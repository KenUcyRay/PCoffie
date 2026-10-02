<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Metode pembayaran (Master Data, module System). Tabel dbo.T_PAYMENT_METHOD
// (aturan: tabel baru pakai awalan T_, bukan CP_).
// SEGMENT frontend: home/cppaymentmethod/cppaymentmethod. Menu CPMENU MCONTROL = cp_paymentmethod.
//
// Perubahan biaya hanya untuk transaksi berikutnya: model ini tidak pernah
// menyentuh tabel transaksi, jadi transaksi lama otomatis tidak berubah.
class Mcppaymentmethod extends Model
{
    use ColumnFilter;

    const TABLE = 'T_PAYMENT_METHOD';

    // Nama tabel pembayaran/transaksi (belum ada) untuk cek pemakaian metode.
    const PAYMENT_TABLE = 'T_PAYMENT';

    // Tipe yang diizinkan.
    const TYPES = ['QRIS', 'VA', 'EWALLET', 'CARD'];

    // Upload logo: ekstensi + mime yang diizinkan, ukuran maks 2MB.
    const LOGO_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
    const LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    const LOGO_MAX = 2097152;
    const LOGO_DIR = 'uploads/payment';

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'PAYID' => 'A.PAYID',
            'PAYCODE' => 'A.PAYCODE',
            'PAYNAME' => 'A.PAYNAME',
            'PAYTYPE' => 'A.PAYTYPE',
            'BANKCODE' => 'A.BANKCODE',
            'BANKSHORT' => 'B.BANKSHORT',
            'PCTCOST' => 'A.PCTCOST',
            'FIXCOST' => 'A.FIXCOST',
            'MINAMT' => 'A.MINAMT',
            'MAXAMT' => 'A.MAXAMT',
            'PAYSORT' => 'A.PAYSORT',
            'PAYACTIVE' => 'A.PAYACTIVE',
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
            $where = " WHERE (A.PAYCODE LIKE ? OR A.PAYNAME LIKE ? OR A.PAYTYPE LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_PAYMENT_METHOD A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default urutan, kode.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.PAYSORT, A.PAYCODE';

        $sql = "
            SELECT A.PAYID, A.PAYCODE, A.PAYNAME, A.PAYTYPE, A.BANKCODE,
                   B.BANKSHORT, A.PCTCOST, A.FIXCOST, A.MINAMT, A.MAXAMT,
                   A.LOGO, A.PAYSORT, A.PAYACTIVE
            FROM T_PAYMENT_METHOD A
            LEFT JOIN T_BANK B ON A.BANKCODE = B.BANKCODE
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
        $payid = $vdata['PAYID'] ?? null;

        if (empty($payid)) {
            return json_encode(['success' => 'false', 'message' => 'PAYID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT PAYID, PAYCODE, PAYNAME, PAYTYPE, BANKCODE, PCTCOST, FIXCOST,
                   MINAMT, MAXAMT, LOGO, PAYSORT, PAYACTIVE
            FROM T_PAYMENT_METHOD WHERE PAYID = ?
        ", [$payid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data metode tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. $excludeId = PAYID yang dikecualikan dari cek kembar (saat ubah).
    // Return pesan error atau null bila lolos.
    private static function validate($vdata, $excludeId = null): ?string
    {
        $paycode = trim((string) ($vdata['PAYCODE'] ?? ''));
        $payname = trim((string) ($vdata['PAYNAME'] ?? ''));
        $paytype = strtoupper(trim((string) ($vdata['PAYTYPE'] ?? '')));
        $bankcode = trim((string) ($vdata['BANKCODE'] ?? ''));
        $pct = trim((string) ($vdata['PCTCOST'] ?? ''));
        $fix = trim((string) ($vdata['FIXCOST'] ?? ''));
        $min = trim((string) ($vdata['MINAMT'] ?? ''));
        $max = trim((string) ($vdata['MAXAMT'] ?? ''));
        $sort = trim((string) ($vdata['PAYSORT'] ?? ''));

        if ($paycode === '' || $payname === '' || $paytype === '') {
            return 'Kode, Nama, dan Tipe wajib diisi.';
        }
        if (strlen($paycode) > 20) {
            return 'Kode maksimal 20 karakter.';
        }
        if (strlen($payname) > 100) {
            return 'Nama maksimal 100 karakter.';
        }
        if (!in_array($paytype, self::TYPES, true)) {
            return 'Tipe hanya boleh QRIS, VA, EWALLET, atau CARD.';
        }
        // VA wajib bank yang aktif; selain VA bank dikosongkan.
        if ($paytype === 'VA') {
            if ($bankcode === '') {
                return 'Tipe VA wajib memilih bank.';
            }
            $bank = DB::selectOne("
                SELECT 1 AS X FROM T_BANK WHERE UPPER(BANKCODE) = UPPER(?) AND BANKACTIVE = 'YES'
            ", [$bankcode]);
            if (!$bank) {
                return 'Bank tidak ditemukan atau tidak aktif.';
            }
        }
        if ($pct === '') {
            $pct = '0';
        }
        if (!preg_match('/^\d+(\.\d+)?$/', $pct) || (float) $pct < 0 || (float) $pct > 100) {
            return 'Biaya persen antara 0 sampai 100.';
        }
        if ($fix === '') {
            $fix = '0';
        }
        if (!preg_match('/^\d+(\.\d+)?$/', $fix)) {
            return 'Biaya tetap tidak negatif.';
        }
        if ($min !== '' && !preg_match('/^\d+(\.\d+)?$/', $min)) {
            return 'Minimum tidak negatif.';
        }
        if ($max !== '' && !preg_match('/^\d+(\.\d+)?$/', $max)) {
            return 'Maksimum tidak negatif.';
        }
        if ($min !== '' && $max !== '' && (float) $max <= (float) $min) {
            return 'Maksimum harus lebih besar dari minimum.';
        }
        if ($sort === '') {
            $sort = '0';
        }
        if (filter_var($sort, FILTER_VALIDATE_INT) === false || (int) $sort < 0) {
            return 'Urutan harus angka bulat tidak negatif.';
        }

        // Kembar abaikan beda kapital (UPPER), deterministik apa pun collation.
        $notSelf = !empty($excludeId) ? " AND PAYID <> ?" : "";
        $argsCode = [$paycode];
        $argsName = [$payname];
        if (!empty($excludeId)) {
            $argsCode[] = $excludeId;
            $argsName[] = $excludeId;
        }
        if (!empty(DB::select(
            "SELECT 1 AS X FROM T_PAYMENT_METHOD WHERE UPPER(PAYCODE) = UPPER(?)" . $notSelf, $argsCode
        ))) {
            return 'Kode sudah dipakai metode lain.';
        }
        if (!empty(DB::select(
            "SELECT 1 AS X FROM T_PAYMENT_METHOD WHERE UPPER(PAYNAME) = UPPER(?)" . $notSelf, $argsName
        ))) {
            return 'Nama sudah dipakai metode lain.';
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
            INSERT INTO T_PAYMENT_METHOD
                (PAYCODE, PAYNAME, PAYTYPE, BANKCODE, PCTCOST, FIXCOST, MINAMT, MAXAMT, LOGO, PAYSORT, PAYACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'YES', ?, GETDATE())
        ", self::rowArgs($vdata, $param['VUSERLOGIN'] ?? ''));

        return json_encode(['success' => 'true', 'message' => 'Metode berhasil dibuat.']);
    }

    public static function process_update($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $payid = $vdata['PAYID'] ?? null;

        if (empty($payid)) {
            return json_encode(['success' => 'false', 'message' => 'PAYID tidak ditemukan.']);
        }

        $err = self::validate($vdata, $payid);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $old = DB::selectOne("SELECT LOGO FROM T_PAYMENT_METHOD WHERE PAYID = ?", [$payid]);

        DB::update("
            UPDATE T_PAYMENT_METHOD
            SET PAYCODE = ?, PAYNAME = ?, PAYTYPE = ?, BANKCODE = ?, PCTCOST = ?,
                FIXCOST = ?, MINAMT = ?, MAXAMT = ?, LOGO = ?, PAYSORT = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PAYID = ?
        ", array_merge(self::rowArgs($vdata, $param['VUSERLOGIN'] ?? ''), [$payid]));

        self::pruneLogo($old->LOGO ?? null, $vdata['LOGO'] ?? null);

        return json_encode(['success' => 'true', 'message' => 'Metode berhasil diupdate.']);
    }

    // Susun argumen INSERT/UPDATE dari vdata tervalidasi (dengan normalisasi).
    private static function rowArgs($vdata, $userlogin): array
    {
        $paytype = strtoupper(trim((string) ($vdata['PAYTYPE'] ?? '')));
        $bankcode = $paytype === 'VA' ? trim((string) ($vdata['BANKCODE'] ?? '')) : '';
        $num = function ($v) {
            $v = trim((string) $v);
            return $v === '' ? null : $v;
        };
        $sort = trim((string) ($vdata['PAYSORT'] ?? ''));
        return [
            trim((string) $vdata['PAYCODE']),
            trim((string) $vdata['PAYNAME']),
            $paytype,
            $bankcode !== '' ? $bankcode : null,
            (float) trim((string) ($vdata['PCTCOST'] ?? '0')),
            (float) trim((string) ($vdata['FIXCOST'] ?? '0')),
            $num($vdata['MINAMT'] ?? null) !== null ? (float) $num($vdata['MINAMT']) : null,
            $num($vdata['MAXAMT'] ?? null) !== null ? (float) $num($vdata['MAXAMT']) : null,
            trim((string) ($vdata['LOGO'] ?? '')) !== '' ? trim((string) $vdata['LOGO']) : null,
            $sort === '' ? 0 : (int) $sort,
            $userlogin,
        ];
    }

    public static function change_status($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $payid = $vdata['PAYID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['PAYACTIVE'] ?? '')));

        if (empty($payid)) {
            return json_encode(['success' => 'false', 'message' => 'PAYID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        DB::update("
            UPDATE T_PAYMENT_METHOD
            SET PAYACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PAYID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $payid]);

        $msg = $active === 'YES' ? 'Metode berhasil diaktifkan.' : 'Metode berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // true bila metode sedang dipakai transaksi. Tabel pembayaran belum ada ->
    // dianggap tidak dipakai (hapus jalan). Begitu tabel T_PAYMENT dibuat,
    // cek ini otomatis aktif.
    private static function isUsedByPayment(string $paycode): bool
    {
        $tbl = DB::selectOne("
            SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
        ", [self::PAYMENT_TABLE]);
        if (!$tbl) {
            return false;
        }
        // Cari kolom acuan metode pada tabel pembayaran (nama kolom belum final).
        $cols = DB::select("
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
              AND UPPER(COLUMN_NAME) IN ('PAYCODE', 'PAYMENT', 'METHOD', 'PAYMETHOD', 'PAYID')
        ", [self::PAYMENT_TABLE]);
        if (empty($cols)) {
            return false;
        }
        $col = $cols[0]->COLUMN_NAME;
        $hit = DB::select("SELECT 1 AS X FROM T_PAYMENT WHERE [{$col}] = ?", [$paycode]);
        return !empty($hit);
    }

    public static function process_delete($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $payid = $vdata['PAYID'] ?? null;

        if (empty($payid)) {
            return json_encode(['success' => 'false', 'message' => 'PAYID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT PAYID, PAYCODE, PAYNAME, LOGO FROM T_PAYMENT_METHOD WHERE PAYID = ?", [$payid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data metode tidak ditemukan.']);
        }

        if (self::isUsedByPayment((string) $row->PAYCODE)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Metode "' . $row->PAYNAME . '" sedang dipakai transaksi, tidak boleh dihapus. Nonaktifkan saja.',
            ]);
        }

        DB::delete("DELETE FROM T_PAYMENT_METHOD WHERE PAYID = ?", [$payid]);
        self::pruneLogo($row->LOGO ?? null, null);

        return json_encode(['success' => 'true', 'message' => 'Metode berhasil dihapus.']);
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen).
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload logo. Dipanggil via multipart (field 'logo'), bukan JSON.
    // Return {success, path, message}. Path relatif dari public/, mis. uploads/payment/pay_....png.
    public static function upload_logo($param)
    {
        $file = $param['logo'] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File logo tidak ditemukan.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, self::LOGO_EXTS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Logo hanya boleh JPG, PNG, atau WebP.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, self::LOGO_MIMES, true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file bukan gambar yang valid.']);
        }
        if ($file->getSize() > self::LOGO_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran logo maksimal 2MB.']);
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, self::LOGO_DIR);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $name = 'pay_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $file->move($dir, $name);

        return json_encode([
            'success' => 'true',
            'path' => self::LOGO_DIR . '/' . $name,
            'message' => 'Logo berhasil diupload.',
        ]);
    }

    // Hapus file logo lama bila diganti/dihapus record. Best-effort, hanya di
    // dalam folder upload (tidak pernah menyentuh path lain).
    private static function pruneLogo(?string $old, ?string $now): void
    {
        $old = trim((string) $old);
        $now = trim((string) $now);
        if ($old === '' || $old === $now) {
            return;
        }
        if (strpos($old, self::LOGO_DIR . '/') !== 0 || strpos($old, '..') !== false) {
            return;
        }
        $file = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $old);
        if (is_file($file)) {
            @unlink($file);
        }
    }

    // Daftar metode aktif untuk halaman pembayaran nanti. Tanpa paging.
    public static function read_active($param)
    {
        $result = DB::select("
            SELECT PAYCODE, PAYNAME, PAYTYPE, PCTCOST, FIXCOST, MINAMT, MAXAMT, LOGO
            FROM T_PAYMENT_METHOD
            WHERE PAYACTIVE = 'YES'
            ORDER BY PAYSORT, PAYCODE
        ");

        return json_encode([
            'success' => true,
            'Rows' => $result,
        ]);
    }
}
