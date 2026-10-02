<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Kategori event (Master Data, module System). Tabel dbo.T_CATEGORY
// (aturan baru: tabel baru pakai awalan T_, bukan CP_).
// SEGMENT frontend: home/cpcategory/cpcategory. Menu CPMENU MCONTROL = cp_category.
class Mcpcategory extends Model
{
    use ColumnFilter;

    const TABLE = 'T_CATEGORY';

    // Nama tabel event (belum ada) untuk cek pemakaian kategori.
    const EVENT_TABLE = 'CP_EVENT';

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'CATID' => 'A.CATID',
            'CATCODE' => 'A.CATCODE',
            'CATNAME' => 'A.CATNAME',
            'CATSORT' => 'A.CATSORT',
            'CATACTIVE' => 'A.CATACTIVE',
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
            $where = " WHERE (A.CATCODE LIKE ? OR A.CATNAME LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        // (Model lama Mcpuser*/Mcpusergroup belum punya guard ini.)
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_CATEGORY A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default CATSORT, CATCODE.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.CATSORT, A.CATCODE';

        $sql = "
            SELECT A.CATID, A.CATCODE, A.CATNAME, A.CATSORT, A.CATACTIVE
            FROM T_CATEGORY A
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
        $catid = $vdata['CATID'] ?? null;

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'CATID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT CATID, CATCODE, CATNAME, CATSORT, CATACTIVE
            FROM T_CATEGORY WHERE CATID = ?
        ", [$catid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kategori tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. $excludeId = CATID yang dikecualikan dari cek kembar (saat ubah).
    // Return pesan error atau null bila lolos.
    private static function validate($vdata, $excludeId = null): ?string
    {
        $catcode = trim((string) ($vdata['CATCODE'] ?? ''));
        $catname = trim((string) ($vdata['CATNAME'] ?? ''));
        $catsort = trim((string) ($vdata['CATSORT'] ?? ''));

        if ($catcode === '' || $catname === '') {
            return 'Kode dan Nama wajib diisi.';
        }
        if (strlen($catcode) > 20) {
            return 'Kode maksimal 20 karakter.';
        }
        if (strlen($catname) > 100) {
            return 'Nama maksimal 100 karakter.';
        }
        if ($catsort === '') {
            $catsort = '0';
        }
        if (filter_var($catsort, FILTER_VALIDATE_INT) === false || (int) $catsort < 0) {
            return 'Urutan harus angka bulat tidak negatif.';
        }

        // Kembar diabaikan beda huruf besar kecil (UPPER), deterministik apa pun collation.
        $dupArgs = [$catcode];
        $dupSql  = "SELECT 1 AS X FROM T_CATEGORY WHERE UPPER(CATCODE) = UPPER(?)";
        if (!empty($excludeId)) {
            $dupSql .= " AND CATID <> ?";
            $dupArgs[] = $excludeId;
        }
        if (!empty(DB::select($dupSql, $dupArgs))) {
            return 'Kode sudah dipakai kategori lain.';
        }

        $dupArgs = [$catname];
        $dupSql  = "SELECT 1 AS X FROM T_CATEGORY WHERE UPPER(CATNAME) = UPPER(?)";
        if (!empty($excludeId)) {
            $dupSql .= " AND CATID <> ?";
            $dupArgs[] = $excludeId;
        }
        if (!empty(DB::select($dupSql, $dupArgs))) {
            return 'Nama sudah dipakai kategori lain.';
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

        $catsort = trim((string) ($vdata['CATSORT'] ?? ''));
        if ($catsort === '') {
            $catsort = '0';
        }

        DB::insert("
            INSERT INTO T_CATEGORY (CATCODE, CATNAME, CATSORT, CATACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, 'YES', ?, GETDATE())
        ", [trim($vdata['CATCODE']), trim($vdata['CATNAME']), (int) $catsort, $param['VUSERLOGIN'] ?? '']);

        return json_encode(['success' => 'true', 'message' => 'Kategori berhasil dibuat.']);
    }

    public static function process_update($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['CATID'] ?? null;

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'CATID tidak ditemukan.']);
        }

        $err = self::validate($vdata, $catid);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $catsort = trim((string) ($vdata['CATSORT'] ?? ''));
        if ($catsort === '') {
            $catsort = '0';
        }

        DB::update("
            UPDATE T_CATEGORY
            SET CATCODE = ?, CATNAME = ?, CATSORT = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CATID = ?
        ", [trim($vdata['CATCODE']), trim($vdata['CATNAME']), (int) $catsort, $param['VUSERLOGIN'] ?? '', $catid]);

        return json_encode(['success' => 'true', 'message' => 'Kategori berhasil diupdate.']);
    }

    public static function change_status($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['CATID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['CATACTIVE'] ?? '')));

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'CATID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        DB::update("
            UPDATE T_CATEGORY
            SET CATACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CATID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $catid]);

        $msg = $active === 'YES' ? 'Kategori berhasil diaktifkan.' : 'Kategori berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // true bila kategori sedang dipakai event. Tabel event belum ada -> dianggap
    // tidak dipakai (hapus jalan). Begitu tabel CP_EVENT dibuat, cek ini otomatis aktif.
    private static function isUsedByEvent(string $catcode): bool
    {
        $tbl = DB::selectOne("
            SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
        ", [self::EVENT_TABLE]);
        if (!$tbl) {
            return false;
        }
        // Cari kolom acuan kategori pada tabel event (nama kolom belum final).
        $cols = DB::select("
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
              AND UPPER(COLUMN_NAME) IN ('CATCODE', 'CATEGORY', 'EVENTCAT', 'CATID')
        ", [self::EVENT_TABLE]);
        if (empty($cols)) {
            return false;
        }
        $col = $cols[0]->COLUMN_NAME;
        $hit = DB::select("SELECT 1 AS X FROM CP_EVENT WHERE [{$col}] = ?", [$catcode]);
        return !empty($hit);
    }

    public static function process_delete($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['CATID'] ?? null;

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'CATID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT CATID, CATCODE, CATNAME FROM T_CATEGORY WHERE CATID = ?", [$catid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kategori tidak ditemukan.']);
        }

        if (self::isUsedByEvent((string) $row->CATCODE)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Kategori "' . $row->CATNAME . '" sedang dipakai event, tidak boleh dihapus. Nonaktifkan saja.',
            ]);
        }

        DB::delete("DELETE FROM T_CATEGORY WHERE CATID = ?", [$catid]);

        return json_encode(['success' => 'true', 'message' => 'Kategori berhasil dihapus.']);
    }

    // Daftar kategori aktif (kode + nama) untuk dropdown halaman lain. Tanpa paging.
    public static function read_active($param)
    {
        $result = DB::select("
            SELECT CATCODE, CATNAME FROM T_CATEGORY
            WHERE CATACTIVE = 'YES'
            ORDER BY CATSORT, CATCODE
        ");

        return json_encode([
            'success' => true,
            'Rows' => $result,
        ]);
    }
}
