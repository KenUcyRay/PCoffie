<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Data produk + penjual (Seller Center, module Merchandise).
// Tabel dbo.T_SELLER + dbo.T_PRODUCT + dbo.T_PRODUCT_IMAGE.
// SEGMENT frontend: home/mproductdata/mproductdata. Menu CPMENU MCONTROL = mproductdata.
//
// Nonaktifkan penjual -> produknya ikut nonaktif (satu arah; mengaktifkan
// kembali tidak mengaktifkan produk). Hapus hanya bila tanpa transaksi.
class Mmproductdata extends Model
{
    use ColumnFilter;

    const MCODE = 50020002;

    const IMAGE_DIR = 'uploads/merch';
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
    const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    const IMAGE_MAX = 2097152; // 2MB (sama seperti poster/logo)
    const IMAGE_LIMIT = 5;

    // Kolom produk yang boleh di-sort (whitelist) => kolom SQL.
    private static function productSortMap(): array
    {
        return [
            'PRODUCTID' => 'A.PRODUCTID',
            'PRODUCTCODE' => 'A.PRODUCTCODE',
            'NAME' => 'A.NAME',
            'CATEGORY' => 'A.CATEGORY',
            'PRICE' => 'A.PRICE',
            'STOCK' => 'A.STOCK',
            'ISACTIVE' => 'A.ISACTIVE',
        ];
    }

    // Tolak bila group user tidak punya akses menu Product Data.
    // Return pesan error atau null bila lolos.
    private static function requireAccess($param): ?string
    {
        $res = json_decode(Mhak_akses::menu_akses([
            'VUSERLOGIN' => $param['VUSERLOGIN'] ?? '',
            'vdata' => json_encode(['mcode' => self::MCODE]),
        ]), true) ?: [];
        if (strtolower(trim((string) ($res['success'] ?? 'false'))) !== 'true') {
            return (string) ($res['message'] ?? 'Anda tidak memiliki hak akses untuk membuka menu ini.');
        }
        return null;
    }

    // Gambar utama = urutan terkecil (LEFT JOIN, dipakai list + katalog).
    public static function mainImageJoin(): string
    {
        return " LEFT JOIN (
            SELECT PRODUCTID, MIN(SORTORDER) AS MINSORT FROM T_PRODUCT_IMAGE GROUP BY PRODUCTID
        ) G ON G.PRODUCTID = A.PRODUCTID
        LEFT JOIN T_PRODUCT_IMAGE I ON I.PRODUCTID = A.PRODUCTID AND I.SORTORDER = G.MINSORT";
    }

    // Kode otomatis unik: SLR-XXXX / PRD-XXXX (retry bila tabrakan).
    private static function genSellerCode(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $code = 'SLR-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            if (!DB::selectOne("SELECT 1 AS X FROM T_SELLER WHERE SELLERCODE = ?", [$code])) {
                return $code;
            }
        }
        return 'SLR-' . date('His') . bin2hex(random_bytes(2));
    }

    private static function genProductCode(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $code = 'PRD-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            if (!DB::selectOne("SELECT 1 AS X FROM T_PRODUCT WHERE PRODUCTCODE = ?", [$code])) {
                return $code;
            }
        }
        return 'PRD-' . date('His') . bin2hex(random_bytes(2));
    }

    // ================= PENJUAL =================

    public static function read_sellers($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.SHOPNAME LIKE ? OR A.SELLERCODE LIKE ? OR A.OWNERNAME LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like];
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_SELLER A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "
            SELECT A.SELLERID, A.SELLERCODE, A.SHOPNAME, A.OWNERNAME, A.PHONE,
                   A.EMAIL, A.ADDRESS, A.ISACTIVE,
                   (SELECT COUNT(*) FROM T_PRODUCT P WHERE P.SELLERID = A.SELLERID) AS PRODCOUNT
            FROM T_SELLER A
            " . $where . "
            ORDER BY A.SHOPNAME
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);

        return json_encode(['success' => true, 'Rows' => $result, 'TotalRows' => $totalRows]);
    }

    // Daftar penjual aktif untuk dropdown (tanpa paging).
    public static function read_seller_dropdown($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $result = DB::select("
            SELECT SELLERID, SELLERCODE, SHOPNAME FROM T_SELLER
            WHERE ISACTIVE = 'YES' ORDER BY SHOPNAME
        ");

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    private static function validateSeller($vdata, $excludeId = null): ?string
    {
        $shop = trim((string) ($vdata['SHOPNAME'] ?? ''));
        $owner = trim((string) ($vdata['OWNERNAME'] ?? ''));
        $phone = trim((string) ($vdata['PHONE'] ?? ''));
        $email = trim((string) ($vdata['EMAIL'] ?? ''));

        if ($shop === '') {
            return 'Nama toko wajib diisi.';
        }
        if (mb_strlen($shop) > 100) {
            return 'Nama toko maksimal 100 karakter.';
        }
        if ($owner === '') {
            return 'Nama pemilik wajib diisi.';
        }
        if (mb_strlen($owner) > 100) {
            return 'Nama pemilik maksimal 100 karakter.';
        }
        if ($phone !== '' && !preg_match('/^[0-9+\-\s]+$/', $phone)) {
            return 'Telepon hanya boleh angka, plus, spasi, dan strip.';
        }
        if (mb_strlen($phone) > 30) {
            return 'Telepon maksimal 30 karakter.';
        }
        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return 'Format email tidak valid.';
        }
        if (mb_strlen($email) > 100) {
            return 'Email maksimal 100 karakter.';
        }

        // Nama toko unik (abaikan beda kapital).
        $sql = "SELECT 1 AS X FROM T_SELLER WHERE UPPER(SHOPNAME) = UPPER(?)";
        $args = [$shop];
        if (!empty($excludeId)) {
            $sql .= " AND SELLERID <> ?";
            $args[] = $excludeId;
        }
        if (!empty(DB::select($sql, $args))) {
            return 'Nama toko sudah dipakai.';
        }
        return null;
    }

    public static function process_seller_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validateSeller($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $code = self::genSellerCode();
        DB::insert("
            INSERT INTO T_SELLER
                (SELLERCODE, SHOPNAME, OWNERNAME, PHONE, EMAIL, ADDRESS,
                 ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?,
                 'YES', ?, GETDATE())
        ", [
            $code, trim($vdata['SHOPNAME']), trim($vdata['OWNERNAME']),
            trim((string) ($vdata['PHONE'] ?? '')) !== '' ? trim($vdata['PHONE']) : null,
            trim((string) ($vdata['EMAIL'] ?? '')) !== '' ? trim($vdata['EMAIL']) : null,
            mb_substr(trim((string) ($vdata['ADDRESS'] ?? '')), 0, 500),
            $param['VUSERLOGIN'] ?? '',
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_SELLER', 'dataId' => $code, 'summary' => 'SELLER ' . $code,
            'before' => [],
            'after' => ['SHOPNAME' => trim($vdata['SHOPNAME'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Penjual berhasil dibuat.',
            'Rows' => [['SELLERID' => $id, 'SELLERCODE' => $code]],
        ]);
    }

    public static function process_seller_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['SELLERID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'SELLERID tidak ditemukan.']);
        }

        $err = self::validateSeller($vdata, $id);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $before = DB::selectOne("SELECT * FROM T_SELLER WHERE SELLERID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data penjual tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_SELLER
            SET SHOPNAME = ?, OWNERNAME = ?, PHONE = ?, EMAIL = ?, ADDRESS = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE SELLERID = ?
        ", [
            trim($vdata['SHOPNAME']), trim($vdata['OWNERNAME']),
            trim((string) ($vdata['PHONE'] ?? '')) !== '' ? trim($vdata['PHONE']) : null,
            trim((string) ($vdata['EMAIL'] ?? '')) !== '' ? trim($vdata['EMAIL']) : null,
            mb_substr(trim((string) ($vdata['ADDRESS'] ?? '')), 0, 500),
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_SELLER', 'dataId' => (string) ($before->SELLERCODE ?? $id),
            'summary' => 'SELLER ' . (string) ($before->SELLERCODE ?? $id),
            'before' => (array) $before,
            'after' => ['SHOPNAME' => trim($vdata['SHOPNAME']), 'OWNERNAME' => trim($vdata['OWNERNAME'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Penjual berhasil diupdate.']);
    }

    public static function change_seller_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['SELLERID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['ISACTIVE'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'SELLERID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        $row = DB::selectOne("SELECT SELLERID, SELLERCODE, SHOPNAME, ISACTIVE FROM T_SELLER WHERE SELLERID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data penjual tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_SELLER
            SET ISACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE SELLERID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $id]);

        $msg = 'Penjual berhasil ' . ($active === 'YES' ? 'diaktifkan.' : 'dinonaktifkan.');
        // Nonaktifkan penjual -> produknya ikut nonaktif (satu arah; aktifkan
        // kembali tidak mengaktifkan produk).
        if ($active === 'NO') {
            $n = DB::update("
                UPDATE T_PRODUCT
                SET ISACTIVE = 'NO', SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE SELLERID = ? AND ISACTIVE = 'YES'
            ", [$param['VUSERLOGIN'] ?? '', $id]);
            if ($n > 0) {
                $msg .= ' ' . $n . ' produk ikut dinonaktifkan.';
            }
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_SELLER', 'dataId' => (string) ($row->SELLERCODE ?? $id),
            'summary' => 'SELLER ' . (string) ($row->SELLERCODE ?? $id) . ' -> ' . $active,
            'before' => ['ISACTIVE' => (string) $row->ISACTIVE],
            'after' => ['ISACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Hapus penjual: hanya bila tanpa produk maupun pesanan.
    public static function process_seller_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['SELLERID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'SELLERID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT SELLERID, SELLERCODE, SHOPNAME FROM T_SELLER WHERE SELLERID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data penjual tidak ditemukan.']);
        }
        $np = DB::selectOne("SELECT COUNT(*) AS C FROM T_PRODUCT WHERE SELLERID = ?", [$id]);
        if ($np && (int) $np->C > 0) {
            return json_encode(['success' => 'false', 'message' => 'Penjual "' . $row->SHOPNAME . '" masih punya ' . (int) $np->C . ' produk, tidak boleh dihapus. Nonaktifkan saja.']);
        }
        $no = DB::selectOne("SELECT COUNT(*) AS C FROM T_MERCH_ORDER WHERE SELLERID = ?", [$id]);
        if ($no && (int) $no->C > 0) {
            return json_encode(['success' => 'false', 'message' => 'Penjual "' . $row->SHOPNAME . '" sudah punya pesanan, tidak boleh dihapus. Nonaktifkan saja.']);
        }

        DB::delete("DELETE FROM T_SELLER WHERE SELLERID = ?", [$id]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_SELLER', 'dataId' => (string) ($row->SELLERCODE ?? $id),
            'summary' => 'SELLER ' . (string) ($row->SELLERCODE ?? $id),
            'before' => (array) $row,
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Penjual berhasil dihapus.']);
    }

    // ================= PRODUK =================

    public static function read_products($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $cat = trim((string) ($param['category'] ?? ''));
        $seller = trim((string) ($param['sellerid'] ?? ''));
        $cond = strtoupper(trim((string) ($param['condition'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? $param['isactive'] ?? '')));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.NAME LIKE ? OR A.PRODUCTCODE LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like];
        }
        if ($cat !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CATEGORY = ?';
            $args[] = $cat;
        }
        if ($seller !== '' && filter_var($seller, FILTER_VALIDATE_INT) !== false) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.SELLERID = ?';
            $args[] = (int) $seller;
        }
        if ($cond !== '' && in_array($cond, ['BARU', 'BEKAS'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CONDITION = ?';
            $args[] = $cond;
        }
        if ($status !== '' && in_array($status, ['YES', 'NO'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.ISACTIVE = ?';
            $args[] = $status;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_PRODUCT A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $map     = self::productSortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.PRODUCTID DESC';

        $sql = "
            SELECT A.PRODUCTID, A.PRODUCTCODE, A.SELLERID, S.SHOPNAME,
                   A.NAME, A.CATEGORY, A.PRICE, A.STOCK, A.CONDITION,
                   A.WEIGHT, A.ISACTIVE, I.FILEPATH AS MAINIMAGE,
                   (SELECT COUNT(*) FROM T_PRODUCT_IMAGE G WHERE G.PRODUCTID = A.PRODUCTID) AS IMGCOUNT
            FROM T_PRODUCT A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            " . self::mainImageJoin() . "
            " . $where . "
            ORDER BY " . $order . "
        ";
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

    public static function read_product_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PRODUCTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PRODUCTID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, S.SHOPNAME
            FROM T_PRODUCT A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            WHERE A.PRODUCTID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data produk tidak ditemukan.']);
        }

        $imgs = DB::select("
            SELECT IMAGEID, FILEPATH, SORTORDER FROM T_PRODUCT_IMAGE
            WHERE PRODUCTID = ? ORDER BY SORTORDER, IMAGEID
        ", [$id]);

        $arr = (array) $row;
        $arr['IMAGES'] = $imgs;

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Daftar produk aktif untuk dropdown halaman lain (tanpa paging).
    public static function read_product_dropdown($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $result = DB::select("
            SELECT A.PRODUCTID, A.PRODUCTCODE, A.NAME, A.PRICE, A.STOCK
            FROM T_PRODUCT A
            JOIN T_SELLER S ON S.SELLERID = A.SELLERID AND S.ISACTIVE = 'YES'
            WHERE A.ISACTIVE = 'YES'
            ORDER BY A.NAME
        ");

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    private static function validateProduct($vdata): ?string
    {
        $sellerid = $vdata['SELLERID'] ?? null;
        $name = trim((string) ($vdata['NAME'] ?? ''));
        $cat = trim((string) ($vdata['CATEGORY'] ?? ''));
        $priceRaw = trim((string) ($vdata['PRICE'] ?? ''));
        $stockRaw = trim((string) ($vdata['STOCK'] ?? ''));
        $cond = strtoupper(trim((string) ($vdata['CONDITION'] ?? '')));
        $weightRaw = trim((string) ($vdata['WEIGHT'] ?? ''));

        if (empty($sellerid)) {
            return 'Penjual wajib dipilih.';
        }
        $seller = DB::selectOne("SELECT SELLERID, ISACTIVE FROM T_SELLER WHERE SELLERID = ?", [$sellerid]);
        if (!$seller) {
            return 'Penjual tidak ditemukan.';
        }
        if (strtoupper(trim((string) $seller->ISACTIVE)) !== 'YES') {
            return 'Penjual sudah nonaktif.';
        }
        if ($name === '') {
            return 'Nama produk wajib diisi.';
        }
        if (mb_strlen($name) > 150) {
            return 'Nama produk maksimal 150 karakter.';
        }
        if (!in_array($cat, MerchConfig::CATEGORIES, true)) {
            return 'Kategori harus salah satu: ' . implode(', ', MerchConfig::CATEGORIES) . '.';
        }
        if ($priceRaw === '' || !is_numeric($priceRaw) || (float) $priceRaw < 0) {
            return 'Harga wajib diisi dan tidak boleh negatif.';
        }
        if ($stockRaw === '' || filter_var($stockRaw, FILTER_VALIDATE_INT) === false || (int) $stockRaw < 0) {
            return 'Stok wajib bilangan bulat tidak negatif.';
        }
        if (!in_array($cond, ['BARU', 'BEKAS'], true)) {
            return 'Kondisi harus BARU atau BEKAS.';
        }
        if ($weightRaw === '' || filter_var($weightRaw, FILTER_VALIDATE_INT) === false || (int) $weightRaw < 1) {
            return 'Berat wajib bilangan bulat lebih dari 0 (gram).';
        }
        if (mb_strlen((string) ($vdata['DESCR'] ?? '')) > 5000) {
            return 'Deskripsi maksimal 5000 karakter.';
        }
        return null;
    }

    public static function process_product_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validateProduct($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $code = self::genProductCode();
        DB::insert("
            INSERT INTO T_PRODUCT
                (PRODUCTCODE, SELLERID, NAME, DESCR, CATEGORY, PRICE, STOCK,
                 CONDITION, WEIGHT, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?,
                 ?, ?, 'YES', ?, GETDATE())
        ", [
            $code, (int) $vdata['SELLERID'], trim($vdata['NAME']),
            mb_substr(trim(strip_tags((string) ($vdata['DESCR'] ?? ''))), 0, 5000),
            trim($vdata['CATEGORY']), (float) trim($vdata['PRICE']), (int) trim($vdata['STOCK']),
            strtoupper(trim($vdata['CONDITION'])), (int) trim($vdata['WEIGHT']),
            $param['VUSERLOGIN'] ?? '',
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        // Gambar (maks 5): daftar path yang sudah diupload.
        $imgErr = self::attachImages($id, $vdata['IMAGES'] ?? [], $param['VUSERLOGIN'] ?? '');
        if ($imgErr !== null) {
            // Produk tetap tersimpan; gambar dilaporkan.
            AuditTrail::log([
                'action' => 'CREATE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
                'table' => 'T_PRODUCT', 'dataId' => $code, 'summary' => 'PRODUK ' . $code . ' (gambar: ' . $imgErr . ')',
                'before' => [],
                'after' => ['PRODUCTCODE' => $code, 'NAME' => trim($vdata['NAME'])],
                'userlogin' => $param['VUSERLOGIN'] ?? '',
            ]);
            return json_encode([
                'success' => 'true', 'message' => 'Produk berhasil dibuat. ' . $imgErr,
                'Rows' => [['PRODUCTID' => $id, 'PRODUCTCODE' => $code]],
            ]);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_PRODUCT', 'dataId' => $code, 'summary' => 'PRODUK ' . $code,
            'before' => [],
            'after' => ['PRODUCTCODE' => $code, 'NAME' => trim($vdata['NAME'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Produk berhasil dibuat.',
            'Rows' => [['PRODUCTID' => $id, 'PRODUCTCODE' => $code]],
        ]);
    }

    // Simpan daftar path gambar (maks 5, urutan = index). Return pesan atau null.
    private static function attachImages(int $productid, $images, string $by): ?string
    {
        if (!is_array($images)) {
            return null;
        }
        $paths = [];
        foreach ($images as $p) {
            $p = trim((string) $p);
            if ($p !== '' && strpos($p, self::IMAGE_DIR . '/') === 0 && strpos($p, '..') === false) {
                $paths[] = mb_substr($p, 0, 255);
            }
            if (count($paths) >= self::IMAGE_LIMIT) {
                break;
            }
        }
        // Gambar lama diganti seluruhnya oleh daftar baru.
        DB::delete("DELETE FROM T_PRODUCT_IMAGE WHERE PRODUCTID = ?", [$productid]);
        $n = 0;
        foreach ($paths as $p) {
            DB::insert("
                INSERT INTO T_PRODUCT_IMAGE (PRODUCTID, FILEPATH, SORTORDER, SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, ?, GETDATE())
            ", [$productid, $p, $n, $by]);
            $n++;
        }
        if (is_array($images) && count($images) > self::IMAGE_LIMIT) {
            return 'Hanya ' . self::IMAGE_LIMIT . ' gambar pertama yang disimpan.';
        }
        return null;
    }

    public static function process_product_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PRODUCTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PRODUCTID tidak ditemukan.']);
        }

        $err = self::validateProduct($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $before = DB::selectOne("SELECT * FROM T_PRODUCT WHERE PRODUCTID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data produk tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_PRODUCT
            SET SELLERID = ?, NAME = ?, DESCR = ?, CATEGORY = ?, PRICE = ?,
                STOCK = ?, CONDITION = ?, WEIGHT = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PRODUCTID = ?
        ", [
            (int) $vdata['SELLERID'], trim($vdata['NAME']),
            mb_substr(trim(strip_tags((string) ($vdata['DESCR'] ?? ''))), 0, 5000),
            trim($vdata['CATEGORY']), (float) trim($vdata['PRICE']), (int) trim($vdata['STOCK']),
            strtoupper(trim($vdata['CONDITION'])), (int) trim($vdata['WEIGHT']),
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        $imgErr = null;
        if (array_key_exists('IMAGES', $vdata)) {
            $imgErr = self::attachImages((int) $id, $vdata['IMAGES'], $param['VUSERLOGIN'] ?? '');
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_PRODUCT', 'dataId' => (string) ($before->PRODUCTCODE ?? $id),
            'summary' => 'PRODUK ' . (string) ($before->PRODUCTCODE ?? $id),
            'before' => (array) $before,
            'after' => ['NAME' => trim($vdata['NAME']), 'PRICE' => trim($vdata['PRICE']), 'STOCK' => trim($vdata['STOCK'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = 'Produk berhasil diupdate.';
        if ($imgErr !== null) {
            $msg .= ' ' . $imgErr;
        }
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    public static function change_product_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PRODUCTID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['ISACTIVE'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PRODUCTID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        $row = DB::selectOne("
            SELECT P.PRODUCTID, P.PRODUCTCODE, P.NAME, P.ISACTIVE, P.SELLERID,
                   S.ISACTIVE AS SELLERACTIVE
            FROM T_PRODUCT P
            LEFT JOIN T_SELLER S ON S.SELLERID = P.SELLERID
            WHERE P.PRODUCTID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data produk tidak ditemukan.']);
        }
        if ($active === 'YES' && strtoupper(trim((string) ($row->SELLERACTIVE ?? ''))) !== 'YES') {
            return json_encode(['success' => 'false', 'message' => 'Penjual nonaktif; aktifkan penjual dulu.']);
        }

        DB::update("
            UPDATE T_PRODUCT
            SET ISACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PRODUCTID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_PRODUCT', 'dataId' => (string) ($row->PRODUCTCODE ?? $id),
            'summary' => 'PRODUK ' . (string) ($row->PRODUCTCODE ?? $id) . ' -> ' . $active,
            'before' => ['ISACTIVE' => (string) $row->ISACTIVE],
            'after' => ['ISACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = $active === 'YES' ? 'Produk berhasil diaktifkan.' : 'Produk berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Ubah stok cepat: tambah/kurangi dengan alasan wajib, tidak boleh negatif.
    public static function adjust_stock($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PRODUCTID'] ?? null;
        $deltaRaw = trim((string) ($vdata['DELTA'] ?? ''));
        $reason = trim((string) ($vdata['REASON'] ?? ''));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PRODUCTID tidak ditemukan.']);
        }
        if ($deltaRaw === '' || filter_var($deltaRaw, FILTER_VALIDATE_INT) === false || (int) $deltaRaw === 0) {
            return json_encode(['success' => 'false', 'message' => 'Selisih stok wajib angka bulat bukan nol.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            $row = DB::selectOne("
                SELECT PRODUCTID, PRODUCTCODE, NAME, STOCK FROM T_PRODUCT WITH (UPDLOCK, HOLDLOCK)
                WHERE PRODUCTID = ?
            ", [$id]);
            if (!$row) {
                $pdo->rollBack();
                return json_encode(['success' => 'false', 'message' => 'Data produk tidak ditemukan.']);
            }
            $new = (int) $row->STOCK + (int) $deltaRaw;
            if ($new < 0) {
                $pdo->rollBack();
                return json_encode(['success' => 'false', 'message' => 'Stok tidak boleh menjadi negatif (sisa ' . (int) $row->STOCK . ').']);
            }

            DB::update("
                UPDATE T_PRODUCT
                SET STOCK = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE PRODUCTID = ?
            ", [$new, $param['VUSERLOGIN'] ?? '', $id]);

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal ubah stok produk.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengubah stok.']);
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_PRODUCT', 'dataId' => (string) ($row->PRODUCTCODE ?? $id),
            'summary' => 'STOK ' . (string) ($row->PRODUCTCODE ?? $id) . ': ' . (int) $row->STOCK . ' -> ' . $new . ' (' . mb_substr($reason, 0, 100) . ')',
            'before' => ['STOCK' => (string) $row->STOCK],
            'after' => ['STOCK' => (string) $new, 'REASON' => $reason],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Stok berhasil diupdate menjadi ' . $new . '.']);
    }

    // Hapus produk: hanya bila belum punya pesanan (item).
    public static function process_product_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PRODUCTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PRODUCTID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT PRODUCTID, PRODUCTCODE, NAME FROM T_PRODUCT WHERE PRODUCTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data produk tidak ditemukan.']);
        }
        $used = DB::selectOne("SELECT COUNT(*) AS C FROM T_MERCH_ORDER_ITEM WHERE PRODUCTID = ?", [$id]);
        if ($used && (int) $used->C > 0) {
            return json_encode(['success' => 'false', 'message' => 'Produk "' . $row->NAME . '" sudah punya pesanan, tidak boleh dihapus. Nonaktifkan saja.']);
        }

        $imgs = DB::select("SELECT FILEPATH FROM T_PRODUCT_IMAGE WHERE PRODUCTID = ?", [$id]);
        DB::delete("DELETE FROM T_PRODUCT_IMAGE WHERE PRODUCTID = ?", [$id]);
        DB::delete("DELETE FROM T_PRODUCT WHERE PRODUCTID = ?", [$id]);
        foreach ($imgs as $im) {
            self::pruneFile((string) ($im->FILEPATH ?? ''));
        }

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mproductdata', 'page' => 'Product Data',
            'table' => 'T_PRODUCT', 'dataId' => (string) ($row->PRODUCTCODE ?? $id),
            'summary' => 'PRODUK ' . (string) ($row->PRODUCTCODE ?? $id),
            'before' => (array) $row,
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Produk berhasil dihapus.']);
    }

    // ================= KATALOG (dipakai ulang Product List) =================

    // Daftar katalog: default hanya produk AKTIF stok>0 dari penjual AKTIF.
    // show_all=YES menampilkan sisanya dengan label statusnya.
    // Return [$rows, $total] atau ['__ERROR__pesan', []].
    public static function catalogList($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $cat = trim((string) ($param['category'] ?? ''));
        $seller = trim((string) ($param['sellerid'] ?? ''));
        $cond = strtoupper(trim((string) ($param['condition'] ?? '')));
        $pmin = trim((string) ($param['price_min'] ?? ''));
        $pmax = trim((string) ($param['price_max'] ?? ''));
        $sortOpt = strtolower(trim((string) ($param['sortopt'] ?? 'newest')));
        $showAll = strtoupper(trim((string) ($param['show_all'] ?? ''))) === 'YES';

        if (($pmin !== '' && !is_numeric($pmin)) || ($pmax !== '' && !is_numeric($pmax))) {
            return ['__ERROR__Rentang harga tidak valid.', []];
        }

        $where = '';
        $args = [];
        if (!$showAll) {
            $where = " WHERE A.ISACTIVE = 'YES' AND A.STOCK > 0 AND S.ISACTIVE = 'YES'";
        }
        if ($q !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . '(A.NAME LIKE ? OR A.PRODUCTCODE LIKE ?)';
            $like = '%' . $q . '%';
            $args[] = $like;
            $args[] = $like;
        }
        if ($cat !== '' && in_array($cat, MerchConfig::CATEGORIES, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CATEGORY = ?';
            $args[] = $cat;
        }
        if ($seller !== '' && filter_var($seller, FILTER_VALIDATE_INT) !== false) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.SELLERID = ?';
            $args[] = (int) $seller;
        }
        if ($cond !== '' && in_array($cond, ['BARU', 'BEKAS'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CONDITION = ?';
            $args[] = $cond;
        }
        if ($pmin !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.PRICE >= ?';
            $args[] = (float) $pmin;
        }
        if ($pmax !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.PRICE <= ?';
            $args[] = (float) $pmax;
        }

        $countRow = DB::selectOne("
            SELECT COUNT(*) AS TOTAL FROM T_PRODUCT A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            " . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        // Pengurutan katalog: terbaru/harga rendah/tinggi/nama (whitelist).
        switch ($sortOpt) {
            case 'price_asc':
                $order = 'A.PRICE ASC, A.PRODUCTID DESC';
                break;
            case 'price_desc':
                $order = 'A.PRICE DESC, A.PRODUCTID DESC';
                break;
            case 'name':
                $order = 'A.NAME ASC, A.PRODUCTID DESC';
                break;
            case 'newest':
            default:
                $order = 'A.PRODUCTID DESC';
                break;
        }

        $sql = "
            SELECT A.PRODUCTID, A.PRODUCTCODE, A.SELLERID, S.SHOPNAME,
                   A.NAME, A.DESCR, A.CATEGORY, A.PRICE, A.STOCK, A.CONDITION,
                   A.WEIGHT, A.ISACTIVE, S.ISACTIVE AS SELLERACTIVE,
                   I.FILEPATH AS MAINIMAGE
            FROM T_PRODUCT A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            " . self::mainImageJoin() . "
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        return [DB::select($sql, $args), $total];
    }

    // Detail katalog satu produk (+ semua gambar + info penjual).
    public static function catalogDetail(int $id)
    {
        $row = DB::selectOne("
            SELECT A.*, S.SHOPNAME, S.PHONE AS SELLERPHONE, S.ISACTIVE AS SELLERACTIVE
            FROM T_PRODUCT A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            WHERE A.PRODUCTID = ?
        ", [$id]);
        if (!$row) {
            return null;
        }
        $arr = (array) $row;
        $arr['IMAGES'] = DB::select("
            SELECT IMAGEID, FILEPATH, SORTORDER FROM T_PRODUCT_IMAGE
            WHERE PRODUCTID = ? ORDER BY SORTORDER, IMAGEID
        ", [$id]);
        return $arr;
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen). Sama seperti Mcppaymentmethod.
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload gambar produk. Dipanggil via multipart (field 'image'), bukan JSON.
    // Return {success, path, message}. Path relatif dari public/.
    public static function upload_image($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $file = $param['image'] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File gambar tidak ditemukan.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, self::IMAGE_EXTS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Gambar hanya boleh JPG, PNG, atau WebP.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, self::IMAGE_MIMES, true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file bukan gambar yang valid.']);
        }
        if ($file->getSize() > self::IMAGE_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran gambar maksimal 2MB.']);
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, self::IMAGE_DIR);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $name = 'prd_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $file->move($dir, $name);

        return json_encode([
            'success' => 'true',
            'path' => self::IMAGE_DIR . '/' . $name,
            'message' => 'Gambar berhasil diupload.',
        ]);
    }

    // Hapus satu baris gambar (file ikut dihapus best-effort).
    public static function process_image_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['IMAGEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'IMAGEID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT IMAGEID, PRODUCTID, FILEPATH FROM T_PRODUCT_IMAGE WHERE IMAGEID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data gambar tidak ditemukan.']);
        }

        DB::delete("DELETE FROM T_PRODUCT_IMAGE WHERE IMAGEID = ?", [$id]);
        self::pruneFile((string) ($row->FILEPATH ?? ''));

        return json_encode(['success' => 'true', 'message' => 'Gambar berhasil dihapus.']);
    }

    // Hapus file dalam folder upload (best-effort, anti path traversal).
    private static function pruneFile(?string $path): void
    {
        $path = trim((string) $path);
        if ($path === '' || strpos($path, self::IMAGE_DIR . '/') !== 0 || strpos($path, '..') !== false) {
            return;
        }
        $file = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path);
        if (is_file($file)) {
            @unlink($file);
        }
    }
}
