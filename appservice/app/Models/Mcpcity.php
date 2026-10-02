<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Kota (Master Data, module System). Tabel dbo.T_CITY
// (aturan: tabel baru pakai awalan T_, bukan CP_).
// SEGMENT frontend: home/cpcity/cpcity. Menu CPMENU MCONTROL = cp_city.
class Mcpcity extends Model
{
    use ColumnFilter;

    const TABLE = 'T_CITY';

    // Nama tabel event (belum ada) untuk cek pemakaian kota.
    const EVENT_TABLE = 'CP_EVENT';

    // Zona waktu yang diizinkan.
    const TIMEZONES = ['WIB', 'WITA', 'WIT'];

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'CITYID' => 'A.CITYID',
            'CITYCODE' => 'A.CITYCODE',
            'CITYNAME' => 'A.CITYNAME',
            'CITYPROV' => 'A.CITYPROV',
            'CITYTZ' => 'A.CITYTZ',
            'CITYACTIVE' => 'A.CITYACTIVE',
        ];
    }

    public static function read_data($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args  = [];
        if ($q !== '') {
            $where = " WHERE (A.CITYCODE LIKE ? OR A.CITYNAME LIKE ? OR A.CITYPROV LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_CITY A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default nama kota.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.CITYNAME, A.CITYCODE';

        $sql = "
            SELECT A.CITYID, A.CITYCODE, A.CITYNAME, A.CITYPROV, A.CITYTZ, A.CITYACTIVE
            FROM T_CITY A
            " . $where . "
            ORDER BY " . $order . "
        ";

        // OFFSET/FETCH nilai integer di-inline karena sudah di-cast aman (hindari isu binding int).
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);

        return json_encode([
            'success' => true,
            'Rows' => $result,
            'TotalRows' => $totalRows
        ]);
    }

    public static function read_detail($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $cityid = $vdata['CITYID'] ?? null;

        if (empty($cityid)) {
            return json_encode(['success' => 'false', 'message' => 'CITYID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT CITYID, CITYCODE, CITYNAME, CITYPROV, CITYTZ, CITYACTIVE
            FROM T_CITY WHERE CITYID = ?
        ", [$cityid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kota tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. $excludeId = CITYID yang dikecualikan dari cek kembar (saat ubah).
    // Return pesan error atau null bila lolos.
    private static function validate($vdata, $excludeId = null): ?string
    {
        $citycode = trim((string) ($vdata['CITYCODE'] ?? ''));
        $cityname = trim((string) ($vdata['CITYNAME'] ?? ''));
        $cityprov = trim((string) ($vdata['CITYPROV'] ?? ''));
        $citytz   = strtoupper(trim((string) ($vdata['CITYTZ'] ?? '')));

        if ($citycode === '' || $cityname === '' || $cityprov === '' || $citytz === '') {
            return 'Kode, Nama, Provinsi, dan Zona waktu wajib diisi.';
        }
        if (strlen($citycode) > 20) {
            return 'Kode maksimal 20 karakter.';
        }
        if (strlen($cityname) > 100) {
            return 'Nama maksimal 100 karakter.';
        }
        if (strlen($cityprov) > 100) {
            return 'Provinsi maksimal 100 karakter.';
        }
        if (!in_array($citytz, self::TIMEZONES, true)) {
            return 'Zona waktu hanya boleh WIB, WITA, atau WIT.';
        }

        // Kode unik global; nama unik per provinsi (abaikan beda kapital).
        $notSelf = !empty($excludeId) ? " AND CITYID <> ?" : "";
        $argsCode = [$citycode];
        $argsName = [$cityname, $cityprov];
        if (!empty($excludeId)) {
            $argsCode[] = $excludeId;
            $argsName[] = $excludeId;
        }
        if (!empty(DB::select(
            "SELECT 1 AS X FROM T_CITY WHERE UPPER(CITYCODE) = UPPER(?)" . $notSelf, $argsCode
        ))) {
            return 'Kode sudah dipakai kota lain.';
        }
        if (!empty(DB::select(
            "SELECT 1 AS X FROM T_CITY WHERE UPPER(CITYNAME) = UPPER(?) AND UPPER(CITYPROV) = UPPER(?)" . $notSelf, $argsName
        ))) {
            return 'Nama kota sudah dipakai di provinsi ini.';
        }

        return null;
    }

    public static function process_create($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        DB::insert("
            INSERT INTO T_CITY (CITYCODE, CITYNAME, CITYPROV, CITYTZ, CITYACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, 'YES', ?, GETDATE())
        ", [
            trim($vdata['CITYCODE']), trim($vdata['CITYNAME']), trim($vdata['CITYPROV']),
            strtoupper(trim($vdata['CITYTZ'])), $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kota berhasil dibuat.']);
    }

    public static function process_update($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $cityid = $vdata['CITYID'] ?? null;

        if (empty($cityid)) {
            return json_encode(['success' => 'false', 'message' => 'CITYID tidak ditemukan.']);
        }

        $err = self::validate($vdata, $cityid);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        DB::update("
            UPDATE T_CITY
            SET CITYCODE = ?, CITYNAME = ?, CITYPROV = ?, CITYTZ = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CITYID = ?
        ", [
            trim($vdata['CITYCODE']), trim($vdata['CITYNAME']), trim($vdata['CITYPROV']),
            strtoupper(trim($vdata['CITYTZ'])), $param['VUSERLOGIN'] ?? '', $cityid,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kota berhasil diupdate.']);
    }

    public static function change_status($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $cityid = $vdata['CITYID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['CATACTIVE'] ?? '')));

        if (empty($cityid)) {
            return json_encode(['success' => 'false', 'message' => 'CITYID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        DB::update("
            UPDATE T_CITY
            SET CITYACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CITYID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $cityid]);

        $msg = $active === 'YES' ? 'Kota berhasil diaktifkan.' : 'Kota berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // true bila kota sedang dipakai event. Tabel event belum ada -> dianggap
    // tidak dipakai (hapus jalan). Begitu tabel CP_EVENT dibuat, cek ini otomatis aktif.
    private static function isUsedByEvent(string $citycode): bool
    {
        $tbl = DB::selectOne("
            SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
        ", [self::EVENT_TABLE]);
        if (!$tbl) {
            return false;
        }
        // Cari kolom acuan kota pada tabel event (nama kolom belum final).
        $cols = DB::select("
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
              AND UPPER(COLUMN_NAME) IN ('CITYCODE', 'CITY', 'CITYPROV', 'EVENTCITY', 'CITYID')
        ", [self::EVENT_TABLE]);
        if (empty($cols)) {
            return false;
        }
        $col = $cols[0]->COLUMN_NAME;
        $hit = DB::select("SELECT 1 AS X FROM CP_EVENT WHERE [{$col}] = ?", [$citycode]);
        return !empty($hit);
    }

    public static function process_delete($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $cityid = $vdata['CITYID'] ?? null;

        if (empty($cityid)) {
            return json_encode(['success' => 'false', 'message' => 'CITYID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT CITYID, CITYCODE, CITYNAME FROM T_CITY WHERE CITYID = ?", [$cityid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kota tidak ditemukan.']);
        }

        if (self::isUsedByEvent((string) $row->CITYCODE)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Kota "' . $row->CITYNAME . '" sedang dipakai event, tidak boleh dihapus. Nonaktifkan saja.',
            ]);
        }

        DB::delete("DELETE FROM T_CITY WHERE CITYID = ?", [$cityid]);

        return json_encode(['success' => 'true', 'message' => 'Kota berhasil dihapus.']);
    }

    // Daftar kota aktif (kode + nama + provinsi) untuk dropdown halaman lain. Tanpa paging.
    public static function read_active($param)
    {
        $result = DB::select("
            SELECT CITYCODE, CITYNAME, CITYPROV FROM T_CITY
            WHERE CITYACTIVE = 'YES'
            ORDER BY CITYNAME, CITYCODE
        ");

        return json_encode([
            'success' => true,
            'Rows' => $result,
        ]);
    }
}
