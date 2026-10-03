<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Penarikan seller (Finance). Tabel dbo.T_WITHDRAWAL.
// SEGMENT frontend: home/mwithdraw/mwithdraw. Menu CPMENU MCONTROL = mwithdraw.
//
// Alur: DIAJUKAN -> DIPROSES -> BERHASIL; DIAJUKAN/DIPROSES -> DITOLAK/GAGAL
// (alasan wajib + dana kembali via WITHDRAWAL_REVERSAL). Dana dikunci di
// AVAILABLE saat diajukan. Saldo dicek + dikunci per penjual dalam satu
// transaksi supaya tarikan bersamaan tak membuat saldo negatif.
// Nomor rekening hanya tampil samaran (LAST4) di semua respons.
class Mmwithdraw extends Model
{
    use ColumnFilter;

    const MCODE = 70030003;
    const EXPORT_LIMIT = 10000;
    const PROOF_DIR = 'uploads/finance';
    const PROOF_MAX = 2097152; // 2MB

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'WDNO' => 'A.WDNO',
            'AMOUNT' => 'A.AMOUNT',
            'STATUS' => 'A.STATUS',
            'REQUESTAT' => 'A.REQUESTAT',
        ];
    }

    // Tolak bila group user tidak punya akses menu Withdrawal.
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

    private static function baseSelect(): string
    {
        return "
            SELECT A.WITHDRAWALID, A.WDNO, A.SELLERID, S.SHOPNAME, S.SELLERCODE, S.EMAIL AS SELLEREMAIL,
                   A.BANKACCOUNTID, B.BANKNAME, BA.LAST4, BA.ACCTNAME,
                   A.AMOUNT, A.WITHDRAWFEE, A.MINAPPLIED, A.NETRECEIVED,
                   A.STATUS, A.TRANSFERREF, A.TRANSFERDATE, A.PROOFIMAGE, A.REASON,
                   A.REQUESTBY, A.REQUESTAT, A.PROCESSBY, A.PROCESSAT, A.DONEBY, A.DONEAT
            FROM T_WITHDRAWAL A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            LEFT JOIN T_BANK_ACCOUNT BA ON BA.BANKACCOUNTID = A.BANKACCOUNTID
            LEFT JOIN T_BANK B ON B.BANKID = BA.BANKID
        ";
    }

    private static function decorate($row): array
    {
        $arr = (array) $row;
        $arr['ACCTMASKED'] = trim((string) ($arr['BANKNAME'] ?? '')) . ' ****' . (string) ($arr['LAST4'] ?? '');
        unset($arr['SELLEREMAIL']);
        return $arr;
    }

    // Email penjual (untuk notifikasi; tak pernah ke frontend).
    private static function sellerEmail(int $sellerId): string
    {
        $s = DB::selectOne("SELECT EMAIL FROM T_SELLER WHERE SELLERID = ?", [$sellerId]);
        return $s ? trim((string) ($s->EMAIL ?? '')) : '';
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
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $sellerid = trim((string) ($param['sellerid'] ?? ''));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.WDNO LIKE ? OR S.SHOPNAME LIKE ? OR A.TRANSFERREF LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like];
        }
        $allowedStatus = ['DIAJUKAN', 'DIPROSES', 'BERHASIL', 'GAGAL', 'DITOLAK'];
        if ($status !== '' && in_array($status, $allowedStatus, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($sellerid !== '' && ctype_digit($sellerid)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.SELLERID = ?';
            $args[] = (int) $sellerid;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne(
            "SELECT COUNT(*) AS TOTAL FROM T_WITHDRAWAL A
             LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID" . $where,
            $args
        );
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.WITHDRAWALID DESC';

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
        $id = $vdata['WITHDRAWALID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'WITHDRAWALID tidak ditemukan.']);
        }

        $row = DB::selectOne(self::baseSelect() . " WHERE A.WITHDRAWALID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data penarikan tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [self::decorate($row)]]);
    }

    // Ringkasan: jumlah per status + nominal menunggu (DIAJUKAN+DIPROSES).
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $out = ['DIAJUKAN' => 0, 'DIPROSES' => 0, 'BERHASIL' => 0, 'GAGAL' => 0, 'DITOLAK' => 0, 'WAITING' => '0'];
        foreach (DB::select("SELECT STATUS, COUNT(*) AS N FROM T_WITHDRAWAL GROUP BY STATUS") as $r) {
            $k = strtoupper(trim((string) $r->STATUS));
            if (isset($out[$k])) {
                $out[$k] = (int) $r->N;
            }
        }
        $w = DB::selectOne("
            SELECT ISNULL(SUM(AMOUNT), 0) AS S FROM T_WITHDRAWAL
            WHERE STATUS IN ('DIAJUKAN', 'DIPROSES')
        ");
        $out['WAITING'] = $w ? (string) $w->S : '0';

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    // Opsi penjual aktif + saldo tersedia (dropdown form ajukan).
    public static function read_sellers($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $sellers = DB::select("
            SELECT SELLERID, SELLERCODE, SHOPNAME FROM T_SELLER
            WHERE ISACTIVE = 'YES' ORDER BY SHOPNAME
        ");
        $rows = [];
        foreach ($sellers as $s) {
            $bal = LedgerService::balance((int) $s->SELLERID);
            $rows[] = [
                'SELLERID' => (int) $s->SELLERID,
                'SELLERCODE' => (string) $s->SELLERCODE,
                'SHOPNAME' => (string) $s->SHOPNAME,
                'AVAILABLE' => $bal['AVAILABLE'],
            ];
        }

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Rekening layak (TERVERIFIKASI+AKTIF) milik penjual (dropdown form).
    public static function read_accounts($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sid = trim((string) ($vdata['SELLERID'] ?? ''));

        if ($sid === '' || !ctype_digit($sid)) {
            return json_encode(['success' => 'false', 'message' => 'SELLERID wajib diisi.']);
        }

        $rows = DB::select("
            SELECT A.BANKACCOUNTID, B.BANKNAME, A.LAST4, A.ACCTNAME, A.ISPRIMARY
            FROM T_BANK_ACCOUNT A
            JOIN T_BANK B ON B.BANKID = A.BANKID
            WHERE A.OWNERTYPE = 'SELLER' AND A.SELLERID = ?
              AND A.VERIFYSTATUS = 'TERVERIFIKASI' AND A.STATUS = 'AKTIF'
            ORDER BY A.ISPRIMARY DESC, A.BANKACCOUNTID
        ", [(int) $sid]);
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'BANKACCOUNTID' => (int) $r->BANKACCOUNTID,
                'LABEL' => trim((string) $r->BANKNAME) . ' ****' . (string) $r->LAST4 . ' (' . (string) $r->ACCTNAME . ')',
                'ISPRIMARY' => (string) $r->ISPRIMARY,
            ];
        }

        return json_encode(['success' => true, 'Rows' => $out]);
    }

    // Aturan fee penarikan yang berlaku hari ini (untuk form).
    public static function read_rule($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $fee = Mcpfee::effectiveOn(date('Y-m-d'));
        if (!$fee) {
            return json_encode(['success' => 'false', 'message' => 'Belum ada pengaturan fee yang berlaku.']);
        }

        return json_encode(['success' => true, 'Rows' => [[
            'WITHDRAWFEE' => (string) $fee->WITHDRAWFEE,
            'MINWITHDRAW' => (string) $fee->MINWITHDRAW,
        ]]]);
    }

    // Ajukan: kunci per penjual, cek saldo, catat + kunci dana (satu trx).
    public static function process_request($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sid = trim((string) ($vdata['SELLERID'] ?? ''));
        $acct = trim((string) ($vdata['BANKACCOUNTID'] ?? ''));
        $amtRaw = trim((string) ($vdata['AMOUNT'] ?? ''));
        $idem = mb_substr(trim((string) ($vdata['IDEMPOTENCYKEY'] ?? '')), 0, 64);
        $by = $param['VUSERLOGIN'] ?? '';

        if ($sid === '' || !ctype_digit($sid)) {
            return json_encode(['success' => 'false', 'message' => 'Penjual wajib dipilih.']);
        }
        if ($acct === '' || !ctype_digit($acct)) {
            return json_encode(['success' => 'false', 'message' => 'Rekening wajib dipilih.']);
        }
        if ($amtRaw === '' || !is_numeric($amtRaw)) {
            return json_encode(['success' => 'false', 'message' => 'Nominal tidak valid.']);
        }
        $amount = Money::r($amtRaw);
        if ($amount <= 0) {
            return json_encode(['success' => 'false', 'message' => 'Nominal harus lebih dari 0.']);
        }

        // Idempotency: kunci sudah dipakai -> kembalikan yang lama.
        if ($idem !== '') {
            $old = DB::selectOne("SELECT WITHDRAWALID, WDNO FROM T_WITHDRAWAL WHERE IDEMPOTENCYKEY = ?", [$idem]);
            if ($old) {
                return json_encode([
                    'success' => 'true', 'message' => 'Pengajuan sudah tercatat sebelumnya.',
                    'Rows' => [['WITHDRAWALID' => (int) $old->WITHDRAWALID, 'WDNO' => (string) $old->WDNO]],
                ]);
            }
        }

        $fee = Mcpfee::effectiveOn(date('Y-m-d'));
        if (!$fee) {
            return json_encode(['success' => 'false', 'message' => 'Belum ada pengaturan fee yang berlaku.']);
        }
        $wdFee = Money::r($fee->WITHDRAWFEE);
        $minWd = Money::r($fee->MINWITHDRAW);
        if ($amount < $minWd) {
            return json_encode(['success' => 'false', 'message' => 'Nominal di bawah minimum penarikan (' . Money::rp($minWd) . ').']);
        }
        if ($amount <= $wdFee) {
            return json_encode(['success' => 'false', 'message' => 'Nominal harus lebih besar dari biaya penarikan (' . Money::rp($wdFee) . ').']);
        }

        try {
            $out = DB::transaction(function () use ($sid, $acct, $amount, $wdFee, $minWd, $idem, $by) {
                $seller = DB::selectOne("
                    SELECT SELLERID, SHOPNAME FROM T_SELLER WITH (UPDLOCK, ROWLOCK)
                    WHERE SELLERID = ? AND ISACTIVE = 'YES'
                ", [(int) $sid]);
                if (!$seller) {
                    return ['ok' => false, 'message' => 'Penjual tidak ditemukan atau nonaktif.'];
                }
                $ba = DB::selectOne("
                    SELECT BANKACCOUNTID FROM T_BANK_ACCOUNT
                    WHERE BANKACCOUNTID = ? AND OWNERTYPE = 'SELLER' AND SELLERID = ?
                      AND VERIFYSTATUS = 'TERVERIFIKASI' AND STATUS = 'AKTIF'
                ", [(int) $acct, (int) $sid]);
                if (!$ba) {
                    return ['ok' => false, 'message' => 'Rekening tidak layak (harus TERVERIFIKASI dan AKTIF milik penjual ini).'];
                }
                // Cek ulang saldo DALAM kunci penjual (anti dobel concurrent).
                $bal = LedgerService::balance((int) $sid);
                if ($amount > $bal['AVAILABLE']) {
                    return ['ok' => false, 'message' => 'Saldo tersedia tidak cukup (' . Money::rp($bal['AVAILABLE']) . ').'];
                }

                DB::insert("
                    INSERT INTO T_WITHDRAWAL
                        (WDNO, SELLERID, BANKACCOUNTID, AMOUNT, WITHDRAWFEE,
                         MINAPPLIED, NETRECEIVED, STATUS,
                         REQUESTBY, REQUESTAT, IDEMPOTENCYKEY,
                         SYSCREATEUSER, SYSCREATEDATE)
                    VALUES ('TMP', ?, ?, ?, ?,
                         ?, ?, 'DIAJUKAN',
                         ?, GETDATE(), ?,
                         ?, GETDATE())
                ", [
                    (int) $sid, (int) $acct, $amount, $wdFee,
                    $minWd, $amount - $wdFee,
                    $by !== '' ? mb_substr($by, 0, 25) : null,
                    $idem !== '' ? $idem : null,
                    $by !== '' ? mb_substr($by, 0, 25) : null,
                ]);
                $id = (int) DB::getPdo()->lastInsertId();
                $no = 'WD-' . date('Ym') . '-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
                DB::update("UPDATE T_WITHDRAWAL SET WDNO = ? WHERE WITHDRAWALID = ?", [$no, $id]);

                LedgerService::add([
                    'SELLERID' => (int) $sid, 'BUCKET' => 'AVAILABLE', 'ENTRYTYPE' => 'WITHDRAWAL',
                    'AMOUNT' => -$amount, 'REFTYPE' => 'WITHDRAWAL', 'REFID' => $id,
                    'NOTE' => 'Kunci ' . $no, 'ACTOR' => $by,
                ]);

                return ['ok' => true, 'id' => $id, 'no' => $no];
            });

            if (!$out['ok']) {
                return json_encode(['success' => 'false', 'message' => $out['message']]);
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mwithdraw', 'Gagal mengajukan penarikan.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengajukan penarikan, coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mwithdraw', 'page' => 'Withdrawal',
            'table' => 'T_WITHDRAWAL', 'dataId' => $out['no'],
            'summary' => 'TARIK ' . $out['no'] . ' ' . Money::rp($amount),
            'before' => [],
            'after' => ['SELLERID' => (int) $sid, 'AMOUNT' => $amount, 'STATUS' => 'DIAJUKAN'],
            'userlogin' => $by,
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Penarikan ' . $out['no'] . ' diajukan.',
            'Rows' => [['WITHDRAWALID' => $out['id'], 'WDNO' => $out['no']]],
        ]);
    }

    // DIAJUKAN -> DIPROSES (transfer manual dimulai).
    public static function process($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['WITHDRAWALID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'WITHDRAWALID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT WITHDRAWALID, WDNO, STATUS FROM T_WITHDRAWAL WHERE WITHDRAWALID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data penarikan tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DIAJUKAN') {
            return json_encode(['success' => 'false', 'message' => 'Hanya DIAJUKAN yang bisa diproses.']);
        }

        DB::update("
            UPDATE T_WITHDRAWAL
            SET STATUS = 'DIPROSES', PROCESSBY = ?, PROCESSAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE WITHDRAWALID = ? AND STATUS = 'DIAJUKAN'
        ", [$by !== '' ? mb_substr($by, 0, 25) : null, $by !== '' ? mb_substr($by, 0, 25) : null, $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mwithdraw', 'page' => 'Withdrawal',
            'table' => 'T_WITHDRAWAL', 'dataId' => (string) ($row->WDNO ?? $id),
            'summary' => 'TARIK ' . (string) ($row->WDNO ?? $id) . ' -> DIPROSES',
            'before' => ['STATUS' => 'DIAJUKAN'],
            'after' => ['STATUS' => 'DIPROSES'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Penarikan diproses.']);
    }

    // DIPROSES -> BERHASIL (referensi + tanggal transfer wajib).
    public static function settle($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['WITHDRAWALID'] ?? null;
        $ref = mb_substr(trim((string) ($vdata['TRANSFERREF'] ?? '')), 0, 100);
        $dateRaw = trim((string) ($vdata['TRANSFERDATE'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'WITHDRAWALID tidak ditemukan.']);
        }
        if ($ref === '') {
            return json_encode(['success' => 'false', 'message' => 'Nomor referensi transfer wajib diisi.']);
        }
        $dateTs = $dateRaw !== '' ? strtotime($dateRaw) : false;
        if ($dateTs === false) {
            return json_encode(['success' => 'false', 'message' => 'Tanggal transfer tidak valid.']);
        }

        $row = DB::selectOne("
            SELECT W.*, S.SHOPNAME, S.EMAIL AS SELLEREMAIL
            FROM T_WITHDRAWAL W
            LEFT JOIN T_SELLER S ON S.SELLERID = W.SELLERID
            WHERE W.WITHDRAWALID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data penarikan tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DIPROSES') {
            return json_encode(['success' => 'false', 'message' => 'Hanya DIPROSES yang bisa diselesaikan.']);
        }

        DB::update("
            UPDATE T_WITHDRAWAL
            SET STATUS = 'BERHASIL', TRANSFERREF = ?, TRANSFERDATE = ?,
                DONEBY = ?, DONEAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE WITHDRAWALID = ? AND STATUS = 'DIPROSES'
        ", [
            $ref, date('Y-m-d', $dateTs),
            $by !== '' ? mb_substr($by, 0, 25) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null, $id,
        ]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mwithdraw', 'page' => 'Withdrawal',
            'table' => 'T_WITHDRAWAL', 'dataId' => (string) ($row->WDNO ?? $id),
            'summary' => 'TARIK ' . (string) ($row->WDNO ?? $id) . ' -> BERHASIL',
            'before' => ['STATUS' => 'DIPROSES'],
            'after' => ['STATUS' => 'BERHASIL', 'TRANSFERREF' => $ref],
            'userlogin' => $by,
        ]);

        // Notifikasi (gagal kirim tak menggagalkan status).
        FinanceNotify::send('WITHDRAWAL_SUCCESS', trim((string) ($row->SELLEREMAIL ?? '')), [
            'nama' => (string) ($row->SHOPNAME ?? 'Penjual'),
            'jumlah' => Money::rp(Money::r($row->NETRECEIVED)),
        ], 'mwithdraw');

        return json_encode(['success' => 'true', 'message' => 'Penarikan selesai (BERHASIL).']);
    }

    // DIAJUKAN/DIPROSES -> DITOLAK/GAGAL (alasan wajib + dana kembali).
    public static function fail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['WITHDRAWALID'] ?? null;
        $to = strtoupper(trim((string) ($vdata['STATUS'] ?? '')));
        $reason = mb_substr(trim((string) ($vdata['REASON'] ?? '')), 0, 200);
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'WITHDRAWALID tidak ditemukan.']);
        }
        if ($to !== 'DITOLAK' && $to !== 'GAGAL') {
            return json_encode(['success' => 'false', 'message' => 'Status harus DITOLAK atau GAGAL.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan wajib diisi.']);
        }

        try {
            $out = DB::transaction(function () use ($id, $to, $reason, $by) {
                $row = DB::selectOne("
                    SELECT * FROM T_WITHDRAWAL WITH (UPDLOCK, ROWLOCK)
                    WHERE WITHDRAWALID = ?
                ", [$id]);
                if (!$row) {
                    return ['ok' => false, 'message' => 'Data penarikan tidak ditemukan.'];
                }
                $st = strtoupper(trim((string) $row->STATUS));
                if ($st !== 'DIAJUKAN' && $st !== 'DIPROSES') {
                    return ['ok' => false, 'message' => 'Hanya DIAJUKAN/DIPROSES yang bisa ditolak/digagalkan.'];
                }

                DB::update("
                    UPDATE T_WITHDRAWAL
                    SET STATUS = ?, REASON = ?,
                        SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                    WHERE WITHDRAWALID = ?
                ", [$to, $reason, $by !== '' ? mb_substr($by, 0, 25) : null, $id]);

                // Dana kembali ke AVAILABLE (transaksi sama).
                LedgerService::add([
                    'SELLERID' => (int) $row->SELLERID, 'BUCKET' => 'AVAILABLE',
                    'ENTRYTYPE' => 'WITHDRAWAL_REVERSAL',
                    'AMOUNT' => Money::r($row->AMOUNT),
                    'REFTYPE' => 'WITHDRAWAL', 'REFID' => (int) $id,
                    'NOTE' => 'Kembali ' . (string) $row->WDNO, 'ACTOR' => $by,
                ]);

                return ['ok' => true, 'no' => (string) $row->WDNO, 'from' => $st];
            });

            if (!$out['ok']) {
                return json_encode(['success' => 'false', 'message' => $out['message']]);
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mwithdraw', 'Gagal menolak/menggagalkan penarikan.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal memproses, coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mwithdraw', 'page' => 'Withdrawal',
            'table' => 'T_WITHDRAWAL', 'dataId' => $out['no'],
            'summary' => 'TARIK ' . $out['no'] . ' -> ' . $to,
            'before' => ['STATUS' => $out['from']],
            'after' => ['STATUS' => $to, 'REASON' => $reason],
            'userlogin' => $by,
        ]);

        $msg = $to === 'DITOLAK' ? 'Penarikan ditolak, dana kembali.' : 'Penarikan digagalkan, dana kembali.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen). Sama seperti Mmnewsdata.
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload bukti transfer: JPG/PNG/WEBP/PDF, maks 2MB, ke uploads/finance/.
    public static function upload_proof($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $id = null;
        if (isset($param['vdata'])) {
            $vd = is_string($param['vdata']) ? json_decode($param['vdata'], true) : $param['vdata'];
            $id = is_array($vd) ? ($vd['WITHDRAWALID'] ?? null) : null;
        }
        $id = $id ?? ($param['WITHDRAWALID'] ?? null);

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'WITHDRAWALID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT WITHDRAWALID, WDNO, STATUS, PROOFIMAGE FROM T_WITHDRAWAL WHERE WITHDRAWALID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data penarikan tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $row->STATUS));
        if ($st === 'BERHASIL' || $st === 'GAGAL' || $st === 'DITOLAK') {
            return json_encode(['success' => 'false', 'message' => 'Status final tidak bisa diganti buktinya.']);
        }

        // C_home mengirim $request->all(): file berupa UploadedFile.
        $file = $param['PROOF'] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File bukti wajib dipilih.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if ($ext === 'jpeg') {
            $ext = 'jpg';
        }
        if (!in_array($ext, ['jpg', 'png', 'webp', 'pdf'], true)) {
            return json_encode(['success' => 'false', 'message' => 'Bukti harus JPG, PNG, WEBP, atau PDF.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file tidak valid.']);
        }
        if ($file->getSize() > self::PROOF_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran bukti maksimal 2MB.']);
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'finance';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $name = 'wd-' . (int) $id . '-' . date('YmdHis') . '.' . $ext;
        try {
            $file->move($dir, $name);
        } catch (\Throwable $e) {
            return json_encode(['success' => 'false', 'message' => 'Gagal menyimpan bukti.']);
        }
        $old = trim((string) ($row->PROOFIMAGE ?? ''));
        if ($old !== '' && $old !== $name && strpos($old, '..') === false
            && file_exists($dir . DIRECTORY_SEPARATOR . basename($old))) {
            @unlink($dir . DIRECTORY_SEPARATOR . basename($old));
        }

        DB::update("
            UPDATE T_WITHDRAWAL
            SET PROOFIMAGE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE WITHDRAWALID = ?
        ", [$name, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'UPLOAD', 'mcontrol' => 'mwithdraw', 'page' => 'Withdrawal',
            'table' => 'T_WITHDRAWAL', 'dataId' => (string) ($row->WDNO ?? $id),
            'summary' => 'TARIK ' . (string) ($row->WDNO ?? $id) . ' bukti',
            'before' => ['PROOFIMAGE' => $old],
            'after' => ['PROOFIMAGE' => $name],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Bukti berhasil diupload.',
            'Rows' => [['PROOFIMAGE' => $name]],
        ]);
    }

    // Export CSV mengikuti filter status (dibatasi, dicatat di Audit Log).
    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $allowedStatus = ['DIAJUKAN', 'DIPROSES', 'BERHASIL', 'GAGAL', 'DITOLAK'];

        $where = '';
        $args = [];
        if ($status !== '' && in_array($status, $allowedStatus, true)) {
            $where = " WHERE A.STATUS = ?";
            $args[] = $status;
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_WITHDRAWAL A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT A.WDNO, S.SHOPNAME, A.AMOUNT, A.WITHDRAWFEE, A.NETRECEIVED,
                   A.STATUS, A.TRANSFERREF, A.REQUESTAT
            FROM T_WITHDRAWAL A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            " . $where . "
            ORDER BY A.WITHDRAWALID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Nomor', 'Penjual', 'Nominal', 'Biaya', 'Diterima', 'Status', 'Referensi', 'Diajukan'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->WDNO, $r->SHOPNAME, (string) $r->AMOUNT, (string) $r->WITHDRAWFEE,
                (string) $r->NETRECEIVED, $r->STATUS, $r->TRANSFERREF, $r->REQUESTAT,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'mwithdraw', 'page' => 'Withdrawal',
            'table' => 'T_WITHDRAWAL', 'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [], 'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'withdrawal_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
