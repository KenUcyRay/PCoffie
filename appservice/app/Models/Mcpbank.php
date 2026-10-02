<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Bank (Master Data, module System). Tabel dbo.T_BANK
// (aturan: tabel baru pakai awalan T_, bukan CP_).
// SEGMENT frontend: home/cpbank/cpbank. Menu CPMENU MCONTROL = cp_bank.
class Mcpbank extends Model
{
    use ColumnFilter;

    const TABLE = 'T_BANK';

    // Nama tabel rekening (belum ada) untuk cek pemakaian bank.
    const ACCOUNT_TABLE = 'T_BANKACCOUNT';

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'BANKID' => 'A.BANKID',
            'BANKCODE' => 'A.BANKCODE',
            'BANKNAME' => 'A.BANKNAME',
            'BANKSHORT' => 'A.BANKSHORT',
            'BANKACTIVE' => 'A.BANKACTIVE',
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
            $where = " WHERE (A.BANKCODE LIKE ? OR A.BANKNAME LIKE ? OR A.BANKSHORT LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_BANK A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default nama bank.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.BANKNAME, A.BANKCODE';

        $sql = "
            SELECT A.BANKID, A.BANKCODE, A.BANKNAME, A.BANKSHORT, A.BANKACTIVE
            FROM T_BANK A
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
        $bankid = $vdata['BANKID'] ?? null;

        if (empty($bankid)) {
            return json_encode(['success' => 'false', 'message' => 'BANKID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT BANKID, BANKCODE, BANKNAME, BANKSHORT, BANKACTIVE
            FROM T_BANK WHERE BANKID = ?
        ", [$bankid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data bank tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. $excludeId = BANKID yang dikecualikan dari cek kembar (saat ubah).
    // Return pesan error atau null bila lolos.
    private static function validate($vdata, $excludeId = null): ?string
    {
        $bankcode = trim((string) ($vdata['BANKCODE'] ?? ''));
        $bankname = trim((string) ($vdata['BANKNAME'] ?? ''));
        $bankshort = trim((string) ($vdata['BANKSHORT'] ?? ''));

        if ($bankcode === '' || $bankname === '' || $bankshort === '') {
            return 'Kode, Nama, dan Nama singkat wajib diisi.';
        }
        // Kode transfer antarbank: hanya angka, 3 sampai 5 digit.
        if (!preg_match('/^[0-9]{3,5}$/', $bankcode)) {
            return 'Kode bank hanya angka 3 sampai 5 digit.';
        }
        if (strlen($bankname) > 100) {
            return 'Nama maksimal 100 karakter.';
        }
        if (strlen($bankshort) > 20) {
            return 'Nama singkat maksimal 20 karakter.';
        }

        // Kembar abaikan beda kapital (UPPER), deterministik apa pun collation.
        $notSelf = !empty($excludeId) ? " AND BANKID <> ?" : "";
        $argsCode = [$bankcode];
        $argsName = [$bankname];
        if (!empty($excludeId)) {
            $argsCode[] = $excludeId;
            $argsName[] = $excludeId;
        }
        if (!empty(DB::select(
            "SELECT 1 AS X FROM T_BANK WHERE UPPER(BANKCODE) = UPPER(?)" . $notSelf, $argsCode
        ))) {
            return 'Kode sudah dipakai bank lain.';
        }
        if (!empty(DB::select(
            "SELECT 1 AS X FROM T_BANK WHERE UPPER(BANKNAME) = UPPER(?)" . $notSelf, $argsName
        ))) {
            return 'Nama sudah dipakai bank lain.';
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
            INSERT INTO T_BANK (BANKCODE, BANKNAME, BANKSHORT, BANKACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, 'YES', ?, GETDATE())
        ", [
            trim($vdata['BANKCODE']), trim($vdata['BANKNAME']), trim($vdata['BANKSHORT']),
            $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Bank berhasil dibuat.']);
    }

    public static function process_update($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $bankid = $vdata['BANKID'] ?? null;

        if (empty($bankid)) {
            return json_encode(['success' => 'false', 'message' => 'BANKID tidak ditemukan.']);
        }

        $err = self::validate($vdata, $bankid);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        DB::update("
            UPDATE T_BANK
            SET BANKCODE = ?, BANKNAME = ?, BANKSHORT = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE BANKID = ?
        ", [
            trim($vdata['BANKCODE']), trim($vdata['BANKNAME']), trim($vdata['BANKSHORT']),
            $param['VUSERLOGIN'] ?? '', $bankid,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Bank berhasil diupdate.']);
    }

    public static function change_status($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $bankid = $vdata['BANKID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['BANKACTIVE'] ?? '')));

        if (empty($bankid)) {
            return json_encode(['success' => 'false', 'message' => 'BANKID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        DB::update("
            UPDATE T_BANK
            SET BANKACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE BANKID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $bankid]);

        $msg = $active === 'YES' ? 'Bank berhasil diaktifkan.' : 'Bank berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // true bila bank sedang dipakai rekening. Tabel rekening belum ada -> dianggap
    // tidak dipakai (hapus jalan). Begitu tabel T_BANKACCOUNT dibuat, cek ini otomatis aktif.
    private static function isUsedByAccount(string $bankcode): bool
    {
        $tbl = DB::selectOne("
            SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
        ", [self::ACCOUNT_TABLE]);
        if (!$tbl) {
            return false;
        }
        // Cari kolom acuan bank pada tabel rekening (nama kolom belum final).
        $cols = DB::select("
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
              AND UPPER(COLUMN_NAME) IN ('BANKCODE', 'BANK', 'BANKID', 'ACCBANK', 'BANKACC')
        ", [self::ACCOUNT_TABLE]);
        if (empty($cols)) {
            return false;
        }
        $col = $cols[0]->COLUMN_NAME;
        $hit = DB::select("SELECT 1 AS X FROM T_BANKACCOUNT WHERE [{$col}] = ?", [$bankcode]);
        return !empty($hit);
    }

    public static function process_delete($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $bankid = $vdata['BANKID'] ?? null;

        if (empty($bankid)) {
            return json_encode(['success' => 'false', 'message' => 'BANKID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT BANKID, BANKCODE, BANKNAME FROM T_BANK WHERE BANKID = ?", [$bankid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data bank tidak ditemukan.']);
        }

        if (self::isUsedByAccount((string) $row->BANKCODE)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Bank "' . $row->BANKNAME . '" sedang dipakai rekening, tidak boleh dihapus. Nonaktifkan saja.',
            ]);
        }

        DB::delete("DELETE FROM T_BANK WHERE BANKID = ?", [$bankid]);

        return json_encode(['success' => 'true', 'message' => 'Bank berhasil dihapus.']);
    }

    // Daftar bank aktif (kode + nama + singkat) untuk dropdown halaman lain. Tanpa paging.
    public static function read_active($param)
    {
        $result = DB::select("
            SELECT BANKCODE, BANKNAME, BANKSHORT FROM T_BANK
            WHERE BANKACTIVE = 'YES'
            ORDER BY BANKNAME, BANKCODE
        ");

        return json_encode([
            'success' => true,
            'Rows' => $result,
        ]);
    }
}
