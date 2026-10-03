<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Rekening bank tujuan payout (organizer) dan penarikan (seller).
// Tabel dbo.T_BANK_ACCOUNT. SEGMENT frontend: home/mbank/mbank.
// Menu CPMENU MCONTROL = mbank.
//
// Nomor tersimpan terenkripsi (ACCTENC via dbo.app_encrypt) + hash berkunci
// HMAC-SHA256 (ACCTHASH, kunci FINANCE_HASH_SECRET) untuk cegah ganda tanpa
// menyimpan nomor mentah. Frontend hanya terima LAST4; nomor utuh hanya via
// reveal() dan setiap penampilan tercatat di Audit Log (disamarkan).
class Mmbank extends Model
{
    use ColumnFilter;

    const MCODE = 70040001;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'BANKACCOUNTID' => 'A.BANKACCOUNTID',
            'OWNERTYPE' => 'A.OWNERTYPE',
            'BANKNAME' => 'B.BANKNAME',
            'LAST4' => 'A.LAST4',
            'ISPRIMARY' => 'A.ISPRIMARY',
            'VERIFYSTATUS' => 'A.VERIFYSTATUS',
            'STATUS' => 'A.STATUS',
        ];
    }

    // Tolak bila group user tidak punya akses menu Bank Account.
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

    // Kunci HMAC dari env. Kosong -> fail-closed (tulis ditolak).
    private static function hashSecret(): string
    {
        return (string) (env('FINANCE_HASH_SECRET') ?? '');
    }

    // Normalisasi nomor: hanya digit (buang spasi/strip).
    public static function normalizeAcct(string $raw): string
    {
        return preg_replace('/\D/', '', $raw) ?? '';
    }

    // Hash berkunci untuk dedup. Null bila secret belum dikonfigurasi.
    public static function hashAcct(string $digits): ?string
    {
        $sec = self::hashSecret();
        if ($sec === '') {
            return null;
        }
        return hash_hmac('sha256', $digits, $sec);
    }

    private static function encryptAcct(string $digits): string
    {
        $row = DB::selectOne('SELECT dbo.app_encrypt(?) AS X', [$digits]);
        return (string) ($row->X ?? '');
    }

    private static function decryptAcct(string $enc): string
    {
        $row = DB::selectOne('SELECT dbo.app_decrypt(?) AS P', [$enc]);
        return (string) ($row->P ?? '');
    }

    // Pemakaian di Finance: aktif = diref payout/penarikan DIAJUKAN/DIPROSES;
    // pernah = diref tabel mana pun. Tabel future-proof (cek OBJECT_ID dulu).
    // Return ['active'=>bool, 'ever'=>bool].
    public static function financeUse(string $col, int $id): array
    {
        $out = ['active' => false, 'ever' => false];
        $maps = [
            ['T_WITHDRAWAL', 'BANKACCOUNTID', ['DIAJUKAN', 'DIPROSES']],
            ['T_PAYOUT', 'BANKACCOUNTID', ['DIAJUKAN', 'DIPROSES']],
        ];
        foreach ($maps as [$tbl, $key, $sts]) {
            $exists = DB::selectOne(
                "SELECT 1 AS X FROM sys.objects WHERE object_id = OBJECT_ID(?) AND type = 'U'",
                ['dbo.' . $tbl]
            );
            if (!$exists) {
                continue;
            }
            $ever = DB::selectOne("SELECT COUNT(*) AS C FROM {$tbl} WHERE {$key} = ?", [$id]);
            if ($ever && (int) $ever->C > 0) {
                $out['ever'] = true;
            }
            $in = implode(',', array_fill(0, count($sts), '?'));
            $act = DB::selectOne(
                "SELECT COUNT(*) AS C FROM {$tbl} WHERE {$key} = ? AND STATUS IN ({$in})",
                array_merge([$id], $sts)
            );
            if ($act && (int) $act->C > 0) {
                $out['active'] = true;
            }
        }
        return $out;
    }

    // Kolom list/detail (tanpa nomor utuh): join bank + seller + label pemilik.
    private static function baseSelect(): string
    {
        return "
            SELECT A.BANKACCOUNTID, A.OWNERTYPE, A.SELLERID, A.ORGNAME,
                   S.SHOPNAME, S.SELLERCODE,
                   A.BANKID, B.BANKNAME, B.BANKCODE,
                   A.LAST4, A.ACCTNAME, A.ISPRIMARY,
                   A.VERIFYSTATUS, A.VERIFYNOTE, A.VERIFYBY, A.VERIFYAT,
                   A.STATUS
            FROM T_BANK_ACCOUNT A
            LEFT JOIN T_BANK B ON B.BANKID = A.BANKID
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
        ";
    }

    // Tambahkan label pemilik + tampilan samaran ke baris hasil.
    private static function decorate($row): array
    {
        $arr = (array) $row;
        $arr['OWNERLABEL'] = $arr['OWNERTYPE'] === 'SELLER'
            ? (string) ($arr['SHOPNAME'] ?? ('Seller #' . $arr['SELLERID']))
            : (string) ($arr['ORGNAME'] ?? '-');
        $arr['MASKED'] = '**** ' . (string) ($arr['LAST4'] ?? '');
        return $arr;
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $otype = strtoupper(trim((string) ($param['ownertype'] ?? '')));
        $bankid = trim((string) ($param['bankid'] ?? ''));
        $verify = strtoupper(trim((string) ($param['verifystatus'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $primary = strtoupper(trim((string) ($param['isprimary'] ?? '')));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.ORGNAME LIKE ? OR A.ACCTNAME LIKE ? OR A.LAST4 LIKE ? OR S.SHOPNAME LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like, $like];
        }
        if ($otype === 'SELLER' || $otype === 'ORGANIZER') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.OWNERTYPE = ?';
            $args[] = $otype;
        }
        if ($bankid !== '' && ctype_digit($bankid)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.BANKID = ?';
            $args[] = (int) $bankid;
        }
        $allowedVerify = ['BELUM_VERIFIKASI', 'TERVERIFIKASI', 'DITOLAK'];
        if ($verify !== '' && in_array($verify, $allowedVerify, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.VERIFYSTATUS = ?';
            $args[] = $verify;
        }
        if ($status === 'AKTIF' || $status === 'NONAKTIF') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($primary === 'YES' || $primary === 'NO') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.ISPRIMARY = ?';
            $args[] = $primary;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne(
            "SELECT COUNT(*) AS TOTAL FROM T_BANK_ACCOUNT A
             LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID" . $where,
            $args
        );
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.BANKACCOUNTID DESC';

        $sql = self::baseSelect() . $where . " ORDER BY " . $order;
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $rows[] = self::decorate($r);
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
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
        $id = $vdata['BANKACCOUNTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }

        $row = DB::selectOne(self::baseSelect() . " WHERE A.BANKACCOUNTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }

        $arr = self::decorate($row);
        $use = self::financeUse('BANKACCOUNTID', (int) $id);
        $arr['ACTIVEUSE'] = $use['active'] ? 'YES' : 'NO';
        $arr['EVERUSED'] = $use['ever'] ? 'YES' : 'NO';

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Daftar rekening layak pakai (TERVERIFIKASI + AKTIF) per pemilik (dropdown).
    public static function read_eligible($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $otype = strtoupper(trim((string) ($vdata['OWNERTYPE'] ?? '')));

        if ($otype !== 'SELLER' && $otype !== 'ORGANIZER') {
            return json_encode(['success' => 'false', 'message' => 'OWNERTYPE harus SELLER atau ORGANIZER.']);
        }

        $sql = self::baseSelect() . "
            WHERE A.OWNERTYPE = ? AND A.VERIFYSTATUS = 'TERVERIFIKASI' AND A.STATUS = 'AKTIF'
        ";
        $args = [$otype];
        if ($otype === 'SELLER') {
            $sid = trim((string) ($vdata['SELLERID'] ?? ''));
            if ($sid === '' || !ctype_digit($sid)) {
                return json_encode(['success' => 'false', 'message' => 'SELLERID wajib diisi.']);
            }
            $sql .= " AND A.SELLERID = ?";
            $args[] = (int) $sid;
        } else {
            $org = trim((string) ($vdata['ORGNAME'] ?? ''));
            if ($org === '') {
                return json_encode(['success' => 'false', 'message' => 'ORGNAME wajib diisi.']);
            }
            $sql .= " AND A.ORGNORM = UPPER(?)";
            $args[] = trim($org);
        }
        $sql .= " ORDER BY A.ISPRIMARY DESC, A.BANKACCOUNTID";

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $rows[] = self::decorate($r);
        }

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Opsi bank aktif (dropdown form, di bawah hak akses menu ini).
    public static function read_banks($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $rows = DB::select("
            SELECT BANKID, BANKCODE, BANKNAME, BANKSHORT FROM T_BANK
            WHERE BANKACTIVE = 'YES' ORDER BY BANKNAME
        ");

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Opsi penjual aktif (dropdown form).
    public static function read_sellers($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $rows = DB::select("
            SELECT SELLERID, SELLERCODE, SHOPNAME FROM T_SELLER
            WHERE ISACTIVE = 'YES' ORDER BY SHOPNAME
        ");

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Opsi nama penyelenggara dari T_EVENT (dropdown + pencarian).
    // Keterbatasan: penyelenggara dikenali dari teks ORGNAME (tanpa tabel sendiri).
    public static function read_orgs($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $q = trim((string) ($param['q'] ?? ''));
        $sql = "SELECT DISTINCT LTRIM(RTRIM(ORGNAME)) AS ORGNAME FROM T_EVENT WHERE ORGNAME IS NOT NULL AND LTRIM(RTRIM(ORGNAME)) <> ''";
        $args = [];
        if ($q !== '') {
            $sql .= " AND ORGNAME LIKE ?";
            $args[] = '%' . $q . '%';
        }
        $sql .= " ORDER BY 1";
        $rows = DB::select($sql, $args);

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Validasi form. $acctDigits = nomor ternormalisasi ('' bila tak diubah).
    // Return [bersih, pesanError|null].
    private static function validate($vdata, string $acctDigits, bool $isNew): array
    {
        $otype = strtoupper(trim((string) ($vdata['OWNERTYPE'] ?? '')));
        $sellerid = trim((string) ($vdata['SELLERID'] ?? ''));
        $org = trim((string) ($vdata['ORGNAME'] ?? ''));
        $bankid = trim((string) ($vdata['BANKID'] ?? ''));
        $acctname = trim((string) ($vdata['ACCTNAME'] ?? ''));

        if ($otype !== 'SELLER' && $otype !== 'ORGANIZER') {
            return [[], 'Jenis pemilik harus SELLER atau ORGANIZER.'];
        }
        if ($otype === 'SELLER') {
            if ($sellerid === '' || !ctype_digit($sellerid)) {
                return [[], 'Penjual wajib dipilih.'];
            }
            $s = DB::selectOne("SELECT SELLERID FROM T_SELLER WHERE SELLERID = ? AND ISACTIVE = 'YES'", [(int) $sellerid]);
            if (!$s) {
                return [[], 'Penjual tidak ditemukan atau nonaktif.'];
            }
            $org = '';
        } else {
            if ($org === '') {
                return [[], 'Nama penyelenggara wajib diisi.'];
            }
            if (mb_strlen($org) > 100) {
                return [[], 'Nama penyelenggara maksimal 100 karakter.'];
            }
            // Harus sudah ada di T_EVENT (cocok tanpa kapital/spasi tepi).
            $hit = DB::selectOne(
                "SELECT TOP 1 EVENTID FROM T_EVENT WHERE UPPER(LTRIM(RTRIM(ORGNAME))) = UPPER(?)",
                [$org]
            );
            if (!$hit) {
                return [[], 'Nama penyelenggara tidak ditemukan di data event.'];
            }
            $sellerid = '';
        }
        if ($bankid === '' || !ctype_digit($bankid)) {
            return [[], 'Bank wajib dipilih.'];
        }
        $b = DB::selectOne("SELECT BANKID, BANKNAME FROM T_BANK WHERE BANKID = ? AND BANKACTIVE = 'YES'", [(int) $bankid]);
        if (!$b) {
            return [[], 'Bank tidak ditemukan atau nonaktif.'];
        }
        if ($isNew || $acctDigits !== '') {
            if ($acctDigits === '' || !ctype_digit($acctDigits)) {
                return [[], 'Nomor rekening hanya boleh berisi angka.'];
            }
            $len = strlen($acctDigits);
            if ($len < 6 || $len > 20) {
                return [[], 'Nomor rekening 6 sampai 20 digit.'];
            }
        }
        if ($acctname === '') {
            return [[], 'Nama pemilik rekening wajib diisi.'];
        }
        if (mb_strlen($acctname) > 100) {
            return [[], 'Nama pemilik rekening maksimal 100 karakter.'];
        }

        return [[
            'OWNERTYPE' => $otype,
            'SELLERID' => $sellerid === '' ? null : (int) $sellerid,
            'ORGNAME' => $org === '' ? null : $org,
            'BANKID' => (int) $bankid,
            'ACCTNAME' => $acctname,
        ], null];
    }

    // Cek ganda (bank+hash+pemilik) sebelum tulis, untuk pesan yang jelas.
    // Return pesan error atau null bila lolos.
    private static function checkDuplicate(array $c, string $hash, $excludeId = null): ?string
    {
        if ($c['SELLERID'] !== null) {
            $sql = "SELECT 1 AS X FROM T_BANK_ACCOUNT WHERE BANKID = ? AND ACCTHASH = ? AND SELLERID = ?";
            $args = [$c['BANKID'], $hash, $c['SELLERID']];
        } else {
            $sql = "SELECT 1 AS X FROM T_BANK_ACCOUNT WHERE BANKID = ? AND ACCTHASH = ? AND SELLERID IS NULL AND ORGNORM = UPPER(?)";
            $args = [$c['BANKID'], $hash, trim((string) $c['ORGNAME'])];
        }
        if (!empty($excludeId)) {
            $sql .= " AND BANKACCOUNTID <> ?";
            $args[] = $excludeId;
        }
        if (!empty(DB::select($sql, $args))) {
            return 'Rekening sudah terdaftar untuk pemilik ini di bank yang sama.';
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
        $digits = self::normalizeAcct((string) ($vdata['ACCTNO'] ?? ''));

        [$c, $err] = self::validate($vdata, $digits, true);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }
        $hash = self::hashAcct($digits);
        if ($hash === null) {
            return json_encode(['success' => 'false', 'message' => 'FINANCE_HASH_SECRET belum dikonfigurasi, hubungi administrator.']);
        }
        $dup = self::checkDuplicate($c, $hash);
        if ($dup !== null) {
            return json_encode(['success' => 'false', 'message' => $dup]);
        }

        try {
            $id = DB::transaction(function () use ($param, $c, $digits, $hash) {
                // Rekening pertama pemilik otomatis utama.
                $cnt = DB::selectOne(
                    $c['SELLERID'] !== null
                        ? "SELECT COUNT(*) AS C FROM T_BANK_ACCOUNT WHERE SELLERID = ?"
                        : "SELECT COUNT(*) AS C FROM T_BANK_ACCOUNT WHERE SELLERID IS NULL AND ORGNORM = UPPER(?)",
                    $c['SELLERID'] !== null ? [$c['SELLERID']] : [trim((string) $c['ORGNAME'])]
                );
                $primary = ($cnt && (int) $cnt->C === 0) ? 'YES' : 'NO';

                DB::insert("
                    INSERT INTO T_BANK_ACCOUNT
                        (OWNERTYPE, SELLERID, ORGNAME, BANKID, ACCTENC, ACCTHASH,
                         LAST4, ACCTNAME, ISPRIMARY, VERIFYSTATUS, STATUS,
                         SYSCREATEUSER, SYSCREATEDATE)
                    VALUES (?, ?, ?, ?, ?, ?,
                         ?, ?, ?, 'BELUM_VERIFIKASI', 'AKTIF',
                         ?, GETDATE())
                ", [
                    $c['OWNERTYPE'], $c['SELLERID'], $c['ORGNAME'], $c['BANKID'],
                    self::encryptAcct($digits), $hash,
                    substr($digits, -4), mb_substr($c['ACCTNAME'], 0, 100),
                    $primary, $param['VUSERLOGIN'] ?? '',
                ]);
                return (int) DB::getPdo()->lastInsertId();
            });
        } catch (\Throwable $e) {
            // Balapan tulis: indeks unik menang -> pesan ganda yang jelas.
            $msg = (string) $e->getMessage();
            if (stripos($msg, 'UX_T_BANK_ACCOUNT') !== false) {
                return json_encode(['success' => 'false', 'message' => 'Rekening sudah terdaftar untuk pemilik ini di bank yang sama.']);
            }
            SysLog::log('ERROR', 'mbank', 'Gagal membuat rekening.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal membuat rekening, coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'REKENING ' . $c['OWNERTYPE'] . ' ****' . substr($digits, -4),
            'before' => [],
            'after' => ['OWNERTYPE' => $c['OWNERTYPE'], 'BANKID' => $c['BANKID'], 'LAST4' => substr($digits, -4)],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Rekening berhasil dibuat.',
            'Rows' => [['BANKACCOUNTID' => $id]],
        ]);
    }

    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['BANKACCOUNTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }
        $before = DB::selectOne("SELECT * FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }
        // Dipakai payout/penarikan aktif -> kunci total.
        $use = self::financeUse('BANKACCOUNTID', (int) $id);
        if ($use['active']) {
            return json_encode(['success' => 'false', 'message' => 'Rekening sedang dipakai payout/penarikan aktif, tidak bisa diubah.']);
        }

        $rawAcct = trim((string) ($vdata['ACCTNO'] ?? ''));
        $digits = $rawAcct === '' ? '' : self::normalizeAcct($rawAcct);

        [$c, $err] = self::validate($vdata, $digits, false);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $acctChanged = $digits !== '';
        $hash = null;
        if ($acctChanged) {
            $hash = self::hashAcct($digits);
            if ($hash === null) {
                return json_encode(['success' => 'false', 'message' => 'FINANCE_HASH_SECRET belum dikonfigurasi, hubungi administrator.']);
            }
            $dup = self::checkDuplicate($c, $hash, $id);
            if ($dup !== null) {
                return json_encode(['success' => 'false', 'message' => $dup]);
            }
        }

        // Ubah bank/nomor/nama pemilik -> verifikasi kembali ke awal.
        $resetVerify = $acctChanged
            || (int) $before->BANKID !== $c['BANKID']
            || trim((string) $before->ACCTNAME) !== $c['ACCTNAME'];

        try {
            DB::transaction(function () use ($param, $id, $c, $digits, $hash, $acctChanged, $resetVerify) {
                if ($acctChanged) {
                    DB::update("
                        UPDATE T_BANK_ACCOUNT
                        SET OWNERTYPE = ?, SELLERID = ?, ORGNAME = ?, BANKID = ?,
                            ACCTENC = ?, ACCTHASH = ?, LAST4 = ?, ACCTNAME = ?,
                            VERIFYSTATUS = ?, VERIFYNOTE = NULL, VERIFYBY = NULL, VERIFYAT = NULL,
                            SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                        WHERE BANKACCOUNTID = ?
                    ", [
                        $c['OWNERTYPE'], $c['SELLERID'], $c['ORGNAME'], $c['BANKID'],
                        self::encryptAcct($digits), $hash,
                        substr($digits, -4), mb_substr($c['ACCTNAME'], 0, 100),
                        $resetVerify ? 'BELUM_VERIFIKASI' : 'TERVERIFIKASI',
                        $param['VUSERLOGIN'] ?? '', $id,
                    ]);
                } else {
                    DB::update("
                        UPDATE T_BANK_ACCOUNT
                        SET OWNERTYPE = ?, SELLERID = ?, ORGNAME = ?, BANKID = ?,
                            ACCTNAME = ?,
                            VERIFYSTATUS = ?, VERIFYNOTE = NULL, VERIFYBY = NULL, VERIFYAT = NULL,
                            SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                        WHERE BANKACCOUNTID = ?
                    ", [
                        $c['OWNERTYPE'], $c['SELLERID'], $c['ORGNAME'], $c['BANKID'],
                        mb_substr($c['ACCTNAME'], 0, 100),
                        $resetVerify ? 'BELUM_VERIFIKASI' : 'TERVERIFIKASI',
                        $param['VUSERLOGIN'] ?? '', $id,
                    ]);
                }
            });
        } catch (\Throwable $e) {
            $msg = (string) $e->getMessage();
            if (stripos($msg, 'UX_T_BANK_ACCOUNT') !== false) {
                return json_encode(['success' => 'false', 'message' => 'Rekening sudah terdaftar untuk pemilik ini di bank yang sama.']);
            }
            SysLog::log('ERROR', 'mbank', 'Gagal mengubah rekening.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengubah rekening, coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'REKENING #' . $id . ($resetVerify ? ' (verifikasi diulang)' : ''),
            'before' => ['BANKID' => (int) $before->BANKID, 'LAST4' => (string) $before->LAST4, 'VERIFYSTATUS' => (string) $before->VERIFYSTATUS],
            'after' => ['BANKID' => $c['BANKID'], 'LAST4' => $acctChanged ? substr($digits, -4) : (string) $before->LAST4, 'VERIFYSTATUS' => $resetVerify ? 'BELUM_VERIFIKASI' : 'TERVERIFIKASI'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = 'Rekening berhasil diupdate.';
        if ($resetVerify) {
            $msg .= ' Verifikasi kembali ke BELUM_VERIFIKASI.';
        }
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Jadikan utama (satu per pemilik; unik dijaga indeks + transaksi).
    public static function set_primary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['BANKACCOUNTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT * FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'AKTIF'
            || strtoupper(trim((string) $row->VERIFYSTATUS)) !== 'TERVERIFIKASI') {
            return json_encode(['success' => 'false', 'message' => 'Hanya rekening TERVERIFIKASI dan AKTIF yang bisa dijadikan utama.']);
        }

        try {
            DB::transaction(function () use ($param, $id, $row) {
                if ($row->SELLERID !== null) {
                    DB::update("UPDATE T_BANK_ACCOUNT SET ISPRIMARY = 'NO' WHERE SELLERID = ? AND BANKACCOUNTID <> ?", [$row->SELLERID, $id]);
                } else {
                    DB::update("UPDATE T_BANK_ACCOUNT SET ISPRIMARY = 'NO' WHERE SELLERID IS NULL AND ORGNORM = ? AND BANKACCOUNTID <> ?", [(string) $row->ORGNORM, $id]);
                }
                DB::update("
                    UPDATE T_BANK_ACCOUNT
                    SET ISPRIMARY = 'YES', SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                    WHERE BANKACCOUNTID = ?
                ", [$param['VUSERLOGIN'] ?? '', $id]);
            });
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mbank', 'Gagal menjadikan utama.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal menjadikan utama, coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'REKENING #' . $id . ' utama',
            'before' => ['ISPRIMARY' => (string) $row->ISPRIMARY],
            'after' => ['ISPRIMARY' => 'YES'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Rekening dijadikan utama.']);
    }

    public static function change_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['BANKACCOUNTID'] ?? null;
        $status = strtoupper(trim((string) ($vdata['STATUS'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }
        if ($status !== 'AKTIF' && $status !== 'NONAKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Status harus AKTIF atau NONAKTIF.']);
        }
        $row = DB::selectOne("SELECT BANKACCOUNTID, STATUS FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }
        if ($status === 'NONAKTIF') {
            $use = self::financeUse('BANKACCOUNTID', (int) $id);
            if ($use['active']) {
                return json_encode(['success' => 'false', 'message' => 'Rekening sedang dipakai payout/penarikan aktif, tidak bisa dinonaktifkan.']);
            }
        }

        DB::update("
            UPDATE T_BANK_ACCOUNT
            SET STATUS = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE BANKACCOUNTID = ?
        ", [$status, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'REKENING #' . $id . ' -> ' . $status,
            'before' => ['STATUS' => (string) $row->STATUS],
            'after' => ['STATUS' => $status],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = $status === 'AKTIF' ? 'Rekening berhasil diaktifkan.' : 'Rekening berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Verifikasi: TERIMA -> TERVERIFIKASI; TOLAK -> DITOLAK (catatan wajib).
    public static function process_verify($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['BANKACCOUNTID'] ?? null;
        $decision = strtoupper(trim((string) ($vdata['DECISION'] ?? '')));
        $note = mb_substr(trim((string) ($vdata['VERIFYNOTE'] ?? '')), 0, 200);

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }
        if ($decision !== 'TERIMA' && $decision !== 'TOLAK') {
            return json_encode(['success' => 'false', 'message' => 'Keputusan harus TERIMA atau TOLAK.']);
        }
        if ($decision === 'TOLAK' && $note === '') {
            return json_encode(['success' => 'false', 'message' => 'Catatan penolakan wajib diisi.']);
        }
        $row = DB::selectOne("SELECT BANKACCOUNTID, VERIFYSTATUS FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }

        $to = $decision === 'TERIMA' ? 'TERVERIFIKASI' : 'DITOLAK';
        DB::update("
            UPDATE T_BANK_ACCOUNT
            SET VERIFYSTATUS = ?, VERIFYNOTE = ?, VERIFYBY = ?, VERIFYAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE BANKACCOUNTID = ?
        ", [$to, $note === '' ? null : $note, $param['VUSERLOGIN'] ?? '', $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'REKENING #' . $id . ' verifikasi -> ' . $to,
            'before' => ['VERIFYSTATUS' => (string) $row->VERIFYSTATUS],
            'after' => ['VERIFYSTATUS' => $to],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = $decision === 'TERIMA' ? 'Rekening diverifikasi.' : 'Rekening ditolak.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Tampilkan nomor utuh (aksi terpisah). Setiap penampilan tercatat di
    // Audit Log dengan nomor disamarkan; nomor tidak masuk System Log.
    public static function reveal($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['BANKACCOUNTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT BANKACCOUNTID, ACCTENC, LAST4 FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }

        $digits = self::decryptAcct((string) $row->ACCTENC);

        AuditTrail::log([
            'action' => 'LAINNYA', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'Lihat nomor REKENING ****' . (string) $row->LAST4,
            'before' => [],
            'after' => ['LAST4' => (string) $row->LAST4],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'OK',
            'Rows' => [['BANKACCOUNTID' => (int) $id, 'ACCTNO' => $digits, 'LAST4' => (string) $row->LAST4]],
        ]);
    }

    // Hapus: hanya yang belum pernah dipakai di Finance (fisik, tanpa trigger).
    public static function process_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['BANKACCOUNTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'BANKACCOUNTID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT * FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data rekening tidak ditemukan.']);
        }
        $use = self::financeUse('BANKACCOUNTID', (int) $id);
        if ($use['ever']) {
            return json_encode(['success' => 'false', 'message' => 'Rekening pernah dipakai payout/penarikan, tidak boleh dihapus. Nonaktifkan saja.']);
        }

        DB::delete("DELETE FROM T_BANK_ACCOUNT WHERE BANKACCOUNTID = ?", [$id]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mbank', 'page' => 'Bank Account',
            'table' => 'T_BANK_ACCOUNT', 'dataId' => (string) $id,
            'summary' => 'REKENING #' . $id . ' ****' . (string) $row->LAST4,
            'before' => ['OWNERTYPE' => (string) $row->OWNERTYPE, 'BANKID' => (int) $row->BANKID, 'LAST4' => (string) $row->LAST4],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Rekening berhasil dihapus.']);
    }
}
