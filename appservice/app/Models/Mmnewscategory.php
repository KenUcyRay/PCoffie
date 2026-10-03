<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Kategori berita (Content Management, module Marketing). Tabel dbo.T_NEWS_CATEGORY
// (BUKAN kategori event T_CATEGORY).
// SEGMENT frontend: home/mnewscategory/mnewscategory. Menu CPMENU MCONTROL = mnewscategory.
class Mmnewscategory extends Model
{
    use ColumnFilter;

    const TABLE = 'T_NEWS_CATEGORY';

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'NEWSCATID' => 'A.NEWSCATID',
            'CATCODE' => 'A.CATCODE',
            'CATNAME' => 'A.CATNAME',
            'CATSORT' => 'A.CATSORT',
            'CATACTIVE' => 'A.CATACTIVE',
        ];
    }

    // Tolak bila group user tidak punya akses menu News Category.
    // Return pesan error atau null bila lolos.
    private static function requireAccess($param): ?string
    {
        $res = json_decode(Mhak_akses::menu_akses([
            'VUSERLOGIN' => $param['VUSERLOGIN'] ?? '',
            'vdata' => json_encode(['mcode' => 60020003]),
        ]), true) ?: [];
        if (strtolower(trim((string) ($res['success'] ?? 'false'))) !== 'true') {
            return (string) ($res['message'] ?? 'Anda tidak memiliki hak akses untuk membuka menu ini.');
        }
        return null;
    }

    // Slug otomatis dari nama + angka (unik, retry bila tabrakan).
    public static function genSlug(string $name, $excludeId = null): string
    {
        $base = strtolower(trim((string) $name));
        $base = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $base) ?: $base;
        $base = preg_replace('/[^a-z0-9]+/', '-', $base);
        $base = trim((string) $base, '-');
        if ($base === '') {
            $base = 'kategori';
        }
        $base = substr($base, 0, 120);
        for ($i = 0; $i < 50; $i++) {
            $slug = $i === 0 ? $base : $base . '-' . $i;
            $sql = "SELECT 1 AS X FROM T_NEWS_CATEGORY WHERE SLUG = ?";
            $args = [$slug];
            if (!empty($excludeId)) {
                $sql .= " AND NEWSCATID <> ?";
                $args[] = $excludeId;
            }
            if (!DB::selectOne($sql, $args)) {
                return $slug;
            }
        }
        return $base . '-' . bin2hex(random_bytes(3));
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

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
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_NEWS_CATEGORY A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default CATSORT, CATCODE.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.CATSORT, A.CATCODE';

        $sql = "
            SELECT A.NEWSCATID, A.CATCODE, A.CATNAME, A.SLUG, A.CATSORT, A.CATACTIVE
            FROM T_NEWS_CATEGORY A
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
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['NEWSCATID'] ?? null;

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSCATID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT NEWSCATID, CATCODE, CATNAME, SLUG, CATSORT, CATACTIVE
            FROM T_NEWS_CATEGORY WHERE NEWSCATID = ?
        ", [$catid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kategori tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. $excludeId = NEWSCATID yang dikecualikan dari cek kembar (saat ubah).
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
        $dupSql  = "SELECT 1 AS X FROM T_NEWS_CATEGORY WHERE UPPER(CATCODE) = UPPER(?)";
        if (!empty($excludeId)) {
            $dupSql .= " AND NEWSCATID <> ?";
            $dupArgs[] = $excludeId;
        }
        if (!empty(DB::select($dupSql, $dupArgs))) {
            return 'Kode sudah dipakai kategori lain.';
        }

        $dupArgs = [$catname];
        $dupSql  = "SELECT 1 AS X FROM T_NEWS_CATEGORY WHERE UPPER(CATNAME) = UPPER(?)";
        if (!empty($excludeId)) {
            $dupSql .= " AND NEWSCATID <> ?";
            $dupArgs[] = $excludeId;
        }
        if (!empty(DB::select($dupSql, $dupArgs))) {
            return 'Nama sudah dipakai kategori lain.';
        }

        return null;
    }

    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

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
            INSERT INTO T_NEWS_CATEGORY (CATCODE, CATNAME, SLUG, CATSORT, CATACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, 'YES', ?, GETDATE())
        ", [trim($vdata['CATCODE']), trim($vdata['CATNAME']), self::genSlug(trim($vdata['CATNAME'])), (int) $catsort, $param['VUSERLOGIN'] ?? '']);

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mnewscategory', 'page' => 'News Category',
            'table' => 'T_NEWS_CATEGORY', 'dataId' => trim($vdata['CATCODE']), 'summary' => 'CATCODE ' . trim($vdata['CATCODE']),
            'before' => [],
            'after' => ['CATCODE' => trim($vdata['CATCODE']), 'CATNAME' => trim($vdata['CATNAME'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kategori berhasil dibuat.']);
    }

    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['NEWSCATID'] ?? null;

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSCATID tidak ditemukan.']);
        }

        $err = self::validate($vdata, $catid);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $catsort = trim((string) ($vdata['CATSORT'] ?? ''));
        if ($catsort === '') {
            $catsort = '0';
        }

        $beforeCat = DB::selectOne("SELECT NEWSCATID, CATCODE, CATNAME, SLUG, CATSORT, CATACTIVE FROM T_NEWS_CATEGORY WHERE NEWSCATID = ?", [$catid]);

        DB::update("
            UPDATE T_NEWS_CATEGORY
            SET CATCODE = ?, CATNAME = ?, SLUG = ?, CATSORT = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE NEWSCATID = ?
        ", [trim($vdata['CATCODE']), trim($vdata['CATNAME']), self::genSlug(trim($vdata['CATNAME']), $catid), (int) $catsort, $param['VUSERLOGIN'] ?? '', $catid]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mnewscategory', 'page' => 'News Category',
            'table' => 'T_NEWS_CATEGORY', 'dataId' => $catid, 'summary' => 'CATCODE ' . trim($vdata['CATCODE']),
            'before' => $beforeCat ? (array) $beforeCat : [],
            'after' => ['CATCODE' => trim($vdata['CATCODE']), 'CATNAME' => trim($vdata['CATNAME'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kategori berhasil diupdate.']);
    }

    public static function change_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['NEWSCATID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['CATACTIVE'] ?? '')));

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSCATID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        DB::update("
            UPDATE T_NEWS_CATEGORY
            SET CATACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE NEWSCATID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $catid]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mnewscategory', 'page' => 'News Category',
            'table' => 'T_NEWS_CATEGORY', 'dataId' => $catid, 'summary' => 'CATCODE ' . trim($vdata['CATCODE'] ?? '') . ' -> ' . $active,
            'before' => ['CATACTIVE' => $active === 'YES' ? 'NO' : 'YES'],
            'after' => ['CATACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = $active === 'YES' ? 'Kategori berhasil diaktifkan.' : 'Kategori berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // true bila kategori sedang dipakai berita (cara yang sama seperti Category Data).
    private static function isUsedByNews(string $catcode): bool
    {
        $tbl = DB::selectOne("
            SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'T_NEWS'
        ");
        if (!$tbl) {
            return false;
        }
        $cols = DB::select("
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'T_NEWS'
              AND UPPER(COLUMN_NAME) IN ('NEWSCATCODE', 'CATCODE', 'CATEGORY', 'NEWSCATID')
        ");
        if (empty($cols)) {
            return false;
        }
        $col = $cols[0]->COLUMN_NAME;
        $hit = DB::select("SELECT 1 AS X FROM T_NEWS WHERE [{$col}] = ?", [$catcode]);
        return !empty($hit);
    }

    public static function process_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $catid = $vdata['NEWSCATID'] ?? null;

        if (empty($catid)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSCATID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT NEWSCATID, CATCODE, CATNAME FROM T_NEWS_CATEGORY WHERE NEWSCATID = ?", [$catid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kategori tidak ditemukan.']);
        }

        if (self::isUsedByNews((string) $row->CATCODE)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Kategori "' . $row->CATNAME . '" sedang dipakai berita, tidak boleh dihapus. Nonaktifkan saja.',
            ]);
        }

        $beforeDelCat = DB::selectOne("SELECT NEWSCATID, CATCODE, CATNAME FROM T_NEWS_CATEGORY WHERE NEWSCATID = ?", [$catid]);

        DB::delete("DELETE FROM T_NEWS_CATEGORY WHERE NEWSCATID = ?", [$catid]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mnewscategory', 'page' => 'News Category',
            'table' => 'T_NEWS_CATEGORY', 'dataId' => $catid, 'summary' => 'CATCODE ' . ($beforeDelCat->CATCODE ?? $catid),
            'before' => $beforeDelCat ? (array) $beforeDelCat : [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kategori berhasil dihapus.']);
    }

    // Daftar kategori aktif (kode + nama) untuk dropdown halaman lain. Tanpa paging.
    // Tanpa cek akses (halaman pemanggil sudah cek menunya sendiri).
    public static function read_active($param)
    {
        $result = DB::select("
            SELECT CATCODE, CATNAME FROM T_NEWS_CATEGORY
            WHERE CATACTIVE = 'YES'
            ORDER BY CATSORT, CATCODE
        ");

        return json_encode([
            'success' => true,
            'Rows' => $result,
        ]);
    }
}
