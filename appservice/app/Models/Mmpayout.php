<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Payout penyelenggara (Finance). Tabel dbo.T_PAYOUT.
// SEGMENT frontend: home/mpayout/mpayout. Menu CPMENU MCONTROL = mpayout.
//
// Hitungan dari T_PAYMENT (TIKET BERHASIL): kotor=Σsubtotal, diskon=Σdiskon,
// platform=Σfee platform, refund=ΣT_PAYMENT_REFUND; bersih=Σbagian pemilik−
// refund. Biaya layanan milik platform (tak masuk hitungan organizer).
// Syarat: ENDED + lewat PAYOUTWAITDAYS + bersih>0 + tanpa refund
// DIAJUKAN/DISETUJUI + tanpa payout aktif + rekening ORGANIZER layak.
// Alur: DIAJUKAN -> DIPROSES -> BERHASIL; DIAJUKAN/DIPROSES -> DITOLAK/GAGAL.
class Mmpayout extends Model
{
    use ColumnFilter;

    const MCODE = 70020003;
    const EXPORT_LIMIT = 10000;
    const PROOF_DIR = 'uploads/finance';
    const PROOF_MAX = 2097152; // 2MB

    private static function sortMap(): array
    {
        return [
            'PONO' => 'A.PONO',
            'NETAMOUNT' => 'A.NETAMOUNT',
            'STATUS' => 'A.STATUS',
            'REQUESTAT' => 'A.REQUESTAT',
        ];
    }

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

    private static function parseRange($param): array
    {
        $fRaw = trim((string) ($param['datefrom'] ?? ''));
        $tRaw = trim((string) ($param['dateto'] ?? ''));
        $fTs = $fRaw !== '' ? strtotime($fRaw) : null;
        $tTs = $tRaw !== '' ? strtotime($tRaw) : null;
        if (($fRaw !== '' && $fTs === false) || ($tRaw !== '' && $tTs === false)) {
            return ['', '', 'Rentang tanggal tidak valid.'];
        }
        return [
            $fTs !== null ? date('Y-m-d 00:00:00', $fTs) : null,
            $tTs !== null ? date('Y-m-d 23:59:59', $tTs) : null,
            null,
        ];
    }

    // Hitungan payout satu event dari pembayaran+refund (int rupiah).
    // Return ['GROSS','DISCOUNT','PLATFORMFEE','REFUND','NET','COUNT'].
    public static function calc(int $eventId): array
    {
        $row = DB::selectOne("
            SELECT COUNT(*) AS N,
                   ISNULL(SUM(SUBTOTAL), 0) AS G,
                   ISNULL(SUM(DISCOUNT), 0) AS D,
                   ISNULL(SUM(PLATFORMFEE), 0) AS F,
                   ISNULL(SUM(OWNERAMT), 0) AS O
            FROM T_PAYMENT
            WHERE REFTYPE = 'TIKET' AND EVENTID = ? AND STATUS = 'BERHASIL'
        ", [$eventId]);

        $rf = DB::selectOne("
            SELECT ISNULL(SUM(R.AMOUNT), 0) AS S
            FROM T_PAYMENT_REFUND R
            JOIN T_PAYMENT P ON P.PAYMENTID = R.PAYMENTID
            WHERE P.REFTYPE = 'TIKET' AND P.EVENTID = ? AND P.STATUS = 'BERHASIL'
        ", [$eventId]);

        $gross = Money::r($row->G ?? 0);
        $disc = Money::r($row->D ?? 0);
        $plat = Money::r($row->F ?? 0);
        $owner = Money::r($row->O ?? 0);
        $refund = Money::r($rf->S ?? 0);
        $net = max(0, $owner - $refund);

        return [
            'COUNT' => $row ? (int) $row->N : 0,
            'GROSS' => $gross, 'DISCOUNT' => $disc, 'PLATFORMFEE' => $plat,
            'REFUND' => $refund, 'NET' => $net,
        ];
    }

    // Refund tiket DIAJUKAN/DISETUJUI untuk event (blokir payout).
    private static function pendingRefunds(int $eventId): int
    {
        $r = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_TICKET_REFUND
            WHERE EVENTID = ? AND STATUS IN ('DIAJUKAN', 'DISETUJUI')
        ", [$eventId]);
        return $r ? (int) $r->C : 0;
    }

    // Payout aktif/berhasil untuk event (blokir pajak baru).
    private static function activePayout(int $eventId): int
    {
        $r = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_PAYOUT
            WHERE EVENTID = ? AND STATUS IN ('DIAJUKAN', 'DIPROSES', 'BERHASIL')
        ", [$eventId]);
        return $r ? (int) $r->C : 0;
    }

    // Rekening organizer layak untuk nama penyelenggara event.
    private static function eligibleAccounts(string $orgname): array
    {
        return DB::select("
            SELECT BANKACCOUNTID, BANKNAME, BANKACCOUNTID, BA.LAST4, BA.ACCTNAME, BA.ISPRIMARY
            FROM T_BANK_ACCOUNT BA
            JOIN T_BANK B ON B.BANKID = BA.BANKID
            WHERE BA.OWNERTYPE = 'ORGANIZER'
              AND UPPER(LTRIM(RTRIM(BA.ORGNAME))) = UPPER(LTRIM(RTRIM(?)))
              AND BA.VERIFYSTATUS = 'TERVERIFIKASI' AND BA.STATUS = 'AKTIF'
            ORDER BY BA.ISPRIMARY DESC, BA.BANKACCOUNTID
        ", [$orgname]);
    }

    // Kelayakan satu event + alasan bila tidak layak.
    private static function eligibility($event, array $calc, ?int $payoutWait): array
    {
        $reasons = [];
        if (strtoupper(trim((string) $event->STATUS)) !== 'ENDED') {
            $reasons[] = 'Event belum ENDED.';
        }
        $endTs = !empty($event->ENDAT) ? strtotime((string) $event->ENDAT) : false;
        if ($endTs === false) {
            $reasons[] = 'Tanggal selesai event belum diisi.';
        } elseif ($payoutWait !== null && time() < $endTs + $payoutWait * 86400) {
            $reasons[] = 'Belum lewat masa tunggu payout (' . $payoutWait . ' hari).';
        }
        if ($calc['NET'] <= 0) {
            $reasons[] = 'Bersih <= 0 (tidak layak dicairkan).';
        }
        if (self::pendingRefunds((int) $event->EVENTID) > 0) {
            $reasons[] = 'Masih ada refund tiket DIAJUKAN/DISETUJUI.';
        }
        if (self::activePayout((int) $event->EVENTID) > 0) {
            $reasons[] = 'Sudah ada payout aktif/berhasil untuk event ini.';
        }
        if (count(self::eligibleAccounts((string) $event->ORGNAME)) === 0) {
            $reasons[] = 'Belum ada rekening ORGANIZER TERVERIFIKASI+AKTIF untuk penyelenggara ini.';
        }
        return $reasons;
    }

    // Tab Siap Dicairkan: event ENDED + kelayakan + estimasi.
    public static function read_ready($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $q = trim((string) ($param['q'] ?? ''));
        $sql = "
            SELECT EVENTID, EVENTCODE, TITLE, ORGNAME, STATUS, STARTAT, ENDAT
            FROM T_EVENT WHERE STATUS = 'ENDED'
        ";
        $args = [];
        if ($q !== '') {
            $sql .= " AND (TITLE LIKE ? OR ORGNAME LIKE ? OR EVENTCODE LIKE ?)";
            $like = '%' . $q . '%';
            array_push($args, $like, $like, $like);
        }
        $sql .= " ORDER BY ENDAT DESC, EVENTID DESC";
        $events = DB::select($sql, $args);

        $fee = Mcpfee::effectiveOn(date('Y-m-d'));
        $wait = $fee ? (int) $fee->PAYOUTWAITDAYS : null;

        $rows = [];
        foreach ($events as $e) {
            $calc = self::calc((int) $e->EVENTID);
            $reasons = self::eligibility($e, $calc, $wait);
            $accounts = self::eligibleAccounts((string) $e->ORGNAME);
            $rows[] = [
                'EVENTID' => (int) $e->EVENTID,
                'EVENTCODE' => (string) $e->EVENTCODE,
                'TITLE' => (string) $e->TITLE,
                'ORGNAME' => (string) $e->ORGNAME,
                'ENDAT' => $e->ENDAT,
                'COUNT' => $calc['COUNT'],
                'GROSS' => $calc['GROSS'],
                'DISCOUNT' => $calc['DISCOUNT'],
                'PLATFORMFEE' => $calc['PLATFORMFEE'],
                'REFUND' => $calc['REFUND'],
                'NET' => $calc['NET'],
                'ELIGIBLE' => empty($reasons) ? 'YES' : 'NO',
                'REASONS' => $reasons,
                'ACCOUNTS' => count($accounts),
            ];
        }

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Pratinjau detail satu event (untuk modal ajukan).
    public static function preview($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventId = (int) ($vdata['EVENTID'] ?? 0);
        if ($eventId <= 0) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        $e = DB::selectOne("SELECT * FROM T_EVENT WHERE EVENTID = ?", [$eventId]);
        if (!$e) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        $calc = self::calc($eventId);
        $fee = Mcpfee::effectiveOn(date('Y-m-d'));
        $reasons = self::eligibility($e, $calc, $fee ? (int) $fee->PAYOUTWAITDAYS : null);
        $accounts = self::eligibleAccounts((string) $e->ORGNAME);

        return json_encode(['success' => true, 'Rows' => [[
            'EVENTID' => (int) $e->EVENTID, 'EVENTCODE' => (string) $e->EVENTCODE,
            'TITLE' => (string) $e->TITLE, 'ORGNAME' => (string) $e->ORGNAME,
            'ENDAT' => $e->ENDAT, 'COUNT' => $calc['COUNT'],
            'GROSS' => $calc['GROSS'], 'DISCOUNT' => $calc['DISCOUNT'],
            'PLATFORMFEE' => $calc['PLATFORMFEE'], 'REFUND' => $calc['REFUND'],
            'NET' => $calc['NET'], 'ELIGIBLE' => empty($reasons) ? 'YES' : 'NO',
            'REASONS' => $reasons, 'ACCOUNTS' => $accounts,
        ]]]);
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
        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.PONO LIKE ? OR E.TITLE LIKE ? OR A.ORGNAME LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like];
        }
        $allowed = ['DIAJUKAN', 'DIPROSES', 'BERHASIL', 'GAGAL', 'DITOLAK'];
        if ($status !== '' && in_array($status, $allowed, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($from !== null) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.REQUESTAT >= ?';
            $args[] = $from;
        }
        if ($to !== null) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.REQUESTAT <= ?';
            $args[] = $to;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow = DB::selectOne(
            "SELECT COUNT(*) AS TOTAL FROM T_PAYOUT A
             LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID" . $where,
            $args
        );
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.PAYOUTID DESC';

        $sql = "
            SELECT A.PAYOUTID, A.PONO, A.EVENTID, E.TITLE AS EVENTTITLE, E.EVENTCODE,
                   A.ORGNAME, A.BANKACCOUNTID, BA.LAST4, B.BANKNAME,
                   A.TICKETCOUNT, A.GROSS, A.DISCOUNT, A.PLATFORMFEE, A.REFUND, A.NETAMOUNT,
                   A.STATUS, A.TRANSFERREF, A.REQUESTAT, A.DONEAT
            FROM T_PAYOUT A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_BANK_ACCOUNT BA ON BA.BANKACCOUNTID = A.BANKACCOUNTID
            LEFT JOIN T_BANK B ON B.BANKID = BA.BANKID
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $arr = (array) $r;
            $arr['ACCTMASKED'] = trim((string) ($r->BANKNAME ?? '')) . ' ****' . (string) ($r->LAST4 ?? '');
            $rows[] = $arr;
        }

        return json_encode(['success' => true, 'Rows' => $rows, 'TotalRows' => $totalRows]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PAYOUTID'] ?? null;
        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PAYOUTID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, E.TITLE AS EVENTTITLE, E.EVENTCODE, E.ORGNAME AS EORG,
                   BA.LAST4, B.BANKNAME, S.SHOPNAME
            FROM T_PAYOUT A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_BANK_ACCOUNT BA ON BA.BANKACCOUNTID = A.BANKACCOUNTID
            LEFT JOIN T_BANK B ON B.BANKID = BA.BANKID
            LEFT JOIN T_SELLER S ON S.SELLERID = BA.SELLERID
            WHERE A.PAYOUTID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data payout tidak ditemukan.']);
        }
        $arr = (array) $row;
        $arr['ACCTMASKED'] = trim((string) ($row->BANKNAME ?? '')) . ' ****' . (string) ($row->LAST4 ?? '');

        // Peringatan: refund/pembatalan SETELAH payout BERHASIL (tak mengubah payout).
        $postRefunds = [];
        if (strtoupper(trim((string) $row->STATUS)) === 'BERHASIL' && !empty($row->DONEAT)) {
            $postRefunds = DB::select("
                SELECT R.AMOUNT, R.REFUNDTIME, R.REFUNDTYPE, P.EVENTID
                FROM T_PAYMENT_REFUND R
                JOIN T_PAYMENT P ON P.PAYMENTID = R.PAYMENTID
                WHERE P.REFTYPE = 'TIKET' AND P.EVENTID = ? AND R.REFUNDTIME > ?
                ORDER BY R.REFUNDTIME
            ", [(int) $row->EVENTID, $row->DONEAT]);
        }
        $arr['POST_REFUNDS'] = $postRefunds;

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Ajukan payout: kunci event + hitung ulang + syarat + simpan snapshot.
    public static function process_request($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventId = (int) ($vdata['EVENTID'] ?? 0);
        $acct = trim((string) ($vdata['BANKACCOUNTID'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if ($eventId <= 0) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        if ($acct === '' || !ctype_digit($acct)) {
            return json_encode(['success' => 'false', 'message' => 'Rekening wajib dipilih.']);
        }

        try {
            $out = DB::transaction(function () use ($eventId, $acct, $by) {
                $e = DB::selectOne("
                    SELECT * FROM T_EVENT WITH (UPDLOCK, ROWLOCK)
                    WHERE EVENTID = ?
                ", [$eventId]);
                if (!$e) {
                    return ['ok' => false, 'message' => 'Data event tidak ditemukan.'];
                }
                $calc = self::calc($eventId);
                $fee = Mcpfee::effectiveOn(date('Y-m-d'));
                $reasons = self::eligibility($e, $calc, $fee ? (int) $fee->PAYOUTWAITDAYS : null);
                if (!empty($reasons)) {
                    return ['ok' => false, 'message' => $reasons[0]];
                }
                // Rekening harus organizer + nama sama + layak.
                $accts = self::eligibleAccounts((string) $e->ORGNAME);
                $ok = false;
                foreach ($accts as $a) {
                    if ((int) $a->BANKACCOUNTID === (int) $acct) {
                        $ok = true;
                        break;
                    }
                }
                if (!$ok) {
                    return ['ok' => false, 'message' => 'Rekening organizer tidak layak untuk event ini.'];
                }

                DB::insert("
                    INSERT INTO T_PAYOUT
                        (PONO, EVENTID, ORGNAME, BANKACCOUNTID, TICKETCOUNT,
                         GROSS, DISCOUNT, PLATFORMFEE, REFUND, NETAMOUNT, STATUS,
                         REQUESTBY, REQUESTAT, SYSCREATEUSER, SYSCREATEDATE)
                    VALUES ('TMP', ?, ?, ?, ?,
                         ?, ?, ?, ?, ?, 'DIAJUKAN',
                         ?, GETDATE(), ?, GETDATE())
                ", [
                    $eventId, mb_substr(trim((string) $e->ORGNAME), 0, 100), (int) $acct, $calc['COUNT'],
                    $calc['GROSS'], $calc['DISCOUNT'], $calc['PLATFORMFEE'], $calc['REFUND'], $calc['NET'],
                    $by !== '' ? mb_substr($by, 0, 25) : null,
                    $by !== '' ? mb_substr($by, 0, 25) : null,
                ]);
                $id = (int) DB::getPdo()->lastInsertId();
                $no = 'PO-' . date('Ym') . '-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
                DB::update("UPDATE T_PAYOUT SET PONO = ? WHERE PAYOUTID = ?", [$no, $id]);

                return ['ok' => true, 'id' => $id, 'no' => $no, 'net' => $calc['NET']];
            });

            if (!$out['ok']) {
                return json_encode(['success' => 'false', 'message' => $out['message']]);
            }
        } catch (\Throwable $e) {
            $msg = (string) $e->getMessage();
            if (stripos($msg, 'UX_T_PAYOUT_EVENT_ACTIVE') !== false) {
                return json_encode(['success' => 'false', 'message' => 'Event sudah punya payout aktif/berhasil (ditolak indeks).']);
            }
            SysLog::log('ERROR', 'mpayout', 'Gagal mengajukan payout.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengajukan payout, coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mpayout', 'page' => 'Payout Request',
            'table' => 'T_PAYOUT', 'dataId' => $out['no'],
            'summary' => 'PAYOUT ' . $out['no'] . ' ' . Money::rp($out['net']),
            'before' => [],
            'after' => ['EVENTID' => $eventId, 'NETAMOUNT' => $out['net'], 'STATUS' => 'DIAJUKAN'],
            'userlogin' => $by,
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Payout ' . $out['no'] . ' diajukan.',
            'Rows' => [['PAYOUTID' => $out['id'], 'PONO' => $out['no']]],
        ]);
    }

    // Proses/reject/fail/settle sama pola alur withdrawal.
    public static function process($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PAYOUTID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';
        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PAYOUTID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT PONO, STATUS FROM T_PAYOUT WHERE PAYOUTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data payout tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DIAJUKAN') {
            return json_encode(['success' => 'false', 'message' => 'Hanya DIAJUKAN yang bisa diproses.']);
        }
        DB::update("
            UPDATE T_PAYOUT SET STATUS = 'DIPROSES', PROCESSBY = ?, PROCESSAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE() WHERE PAYOUTID = ? AND STATUS = 'DIAJUKAN'
        ", [$by !== '' ? mb_substr($by, 0, 25) : null, $by !== '' ? mb_substr($by, 0, 25) : null, $id]);
        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mpayout', 'page' => 'Payout Request',
            'table' => 'T_PAYOUT', 'dataId' => (string) ($row->PONO ?? $id),
            'summary' => 'PAYOUT ' . (string) ($row->PONO ?? $id) . ' -> DIPROSES',
            'before' => ['STATUS' => 'DIAJUKAN'], 'after' => ['STATUS' => 'DIPROSES'], 'userlogin' => $by,
        ]);
        return json_encode(['success' => 'true', 'message' => 'Payout diproses.']);
    }

    public static function settle($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PAYOUTID'] ?? null;
        $ref = mb_substr(trim((string) ($vdata['TRANSFERREF'] ?? '')), 0, 100);
        $dateRaw = trim((string) ($vdata['TRANSFERDATE'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';
        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PAYOUTID tidak ditemukan.']);
        }
        if ($ref === '') {
            return json_encode(['success' => 'false', 'message' => 'Nomor referensi transfer wajib diisi.']);
        }
        $dateTs = $dateRaw !== '' ? strtotime($dateRaw) : false;
        if ($dateTs === false) {
            return json_encode(['success' => 'false', 'message' => 'Tanggal transfer tidak valid.']);
        }
        $row = DB::selectOne("
            SELECT P.*, E.ORGCONTACT
            FROM T_PAYOUT P
            LEFT JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            WHERE P.PAYOUTID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data payout tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DIPROSES') {
            return json_encode(['success' => 'false', 'message' => 'Hanya DIPROSES yang bisa diselesaikan.']);
        }
        DB::update("
            UPDATE T_PAYOUT
            SET STATUS = 'BERHASIL', TRANSFERREF = ?, TRANSFERDATE = ?,
                DONEBY = ?, DONEAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PAYOUTID = ? AND STATUS = 'DIPROSES'
        ", [
            $ref, date('Y-m-d', $dateTs),
            $by !== '' ? mb_substr($by, 0, 25) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null, $id,
        ]);
        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mpayout', 'page' => 'Payout Request',
            'table' => 'T_PAYOUT', 'dataId' => (string) ($row->PONO ?? $id),
            'summary' => 'PAYOUT ' . (string) ($row->PONO ?? $id) . ' -> BERHASIL',
            'before' => ['STATUS' => 'DIPROSES'], 'after' => ['STATUS' => 'BERHASIL', 'TRANSFERREF' => $ref], 'userlogin' => $by,
        ]);
        // Notifikasi ke kontak event bila berbentuk email (toleran gagal).
        $contact = trim((string) ($row->ORGCONTACT ?? ''));
        if (filter_var($contact, FILTER_VALIDATE_EMAIL) !== false) {
            FinanceNotify::send('PAYOUT_SUCCESS', $contact, [
                'nama' => (string) $row->ORGNAME,
                'jumlah' => Money::rp(Money::r($row->NETAMOUNT)),
            ], 'mpayout');
        }
        return json_encode(['success' => 'true', 'message' => 'Payout selesai (BERHASIL).']);
    }

    public static function fail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PAYOUTID'] ?? null;
        $to = strtoupper(trim((string) ($vdata['STATUS'] ?? '')));
        $reason = mb_substr(trim((string) ($vdata['REASON'] ?? '')), 0, 200);
        $by = $param['VUSERLOGIN'] ?? '';
        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PAYOUTID tidak ditemukan.']);
        }
        if ($to !== 'DITOLAK' && $to !== 'GAGAL') {
            return json_encode(['success' => 'false', 'message' => 'Status harus DITOLAK atau GAGAL.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan wajib diisi.']);
        }
        try {
            $out = DB::transaction(function () use ($id, $to, $reason, $by) {
                $row = DB::selectOne("SELECT * FROM T_PAYOUT WITH (UPDLOCK, ROWLOCK) WHERE PAYOUTID = ?", [$id]);
                if (!$row) {
                    return ['ok' => false, 'message' => 'Data payout tidak ditemukan.'];
                }
                $st = strtoupper(trim((string) $row->STATUS));
                if ($st !== 'DIAJUKAN' && $st !== 'DIPROSES') {
                    return ['ok' => false, 'message' => 'Hanya DIAJUKAN/DIPROSES yang bisa ditolak/digagalkan.'];
                }
                DB::update("
                    UPDATE T_PAYOUT SET STATUS = ?, REASON = ?,
                        SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                    WHERE PAYOUTID = ?
                ", [$to, $reason, $by !== '' ? mb_substr($by, 0, 25) : null, $id]);
                return ['ok' => true, 'no' => (string) $row->PONO, 'from' => $st];
            });
            if (!$out['ok']) {
                return json_encode(['success' => 'false', 'message' => $out['message']]);
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mpayout', 'Gagal menolak/menggagalkan payout.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal memproses, coba lagi.']);
        }
        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mpayout', 'page' => 'Payout Request',
            'table' => 'T_PAYOUT', 'dataId' => $out['no'],
            'summary' => 'PAYOUT ' . $out['no'] . ' -> ' . $to,
            'before' => ['STATUS' => $out['from']], 'after' => ['STATUS' => $to, 'REASON' => $reason], 'userlogin' => $by,
        ]);
        return json_encode(['success' => 'true', 'message' => $to === 'DITOLAK' ? 'Payout ditolak.' : 'Payout digagalkan.']);
    }

    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    public static function upload_proof($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $id = null;
        if (isset($param['vdata'])) {
            $vd = is_string($param['vdata']) ? json_decode($param['vdata'], true) : $param['vdata'];
            $id = is_array($vd) ? ($vd['PAYOUTID'] ?? null) : null;
        }
        $id = $id ?? ($param['PAYOUTID'] ?? null);
        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PAYOUTID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT PAYOUTID, PONO, STATUS, PROOFIMAGE FROM T_PAYOUT WHERE PAYOUTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data payout tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $row->STATUS));
        if ($st === 'BERHASIL' || $st === 'GAGAL' || $st === 'DITOLAK') {
            return json_encode(['success' => 'false', 'message' => 'Status final tidak bisa diganti buktinya.']);
        }
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
        $name = 'po-' . (int) $id . '-' . date('YmdHis') . '.' . $ext;
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
            UPDATE T_PAYOUT SET PROOFIMAGE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PAYOUTID = ?
        ", [$name, $param['VUSERLOGIN'] ?? '', $id]);
        AuditTrail::log([
            'action' => 'UPLOAD', 'mcontrol' => 'mpayout', 'page' => 'Payout Request',
            'table' => 'T_PAYOUT', 'dataId' => (string) ($row->PONO ?? $id),
            'summary' => 'PAYOUT ' . (string) ($row->PONO ?? $id) . ' bukti',
            'before' => ['PROOFIMAGE' => $old], 'after' => ['PROOFIMAGE' => $name],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);
        return json_encode([
            'success' => 'true', 'message' => 'Bukti berhasil diupload.',
            'Rows' => [['PROOFIMAGE' => $name]],
        ]);
    }

    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $allowed = ['DIAJUKAN', 'DIPROSES', 'BERHASIL', 'GAGAL', 'DITOLAK'];
        $where = '';
        $args = [];
        if ($status !== '' && in_array($status, $allowed, true)) {
            $where = " WHERE A.STATUS = ?";
            $args[] = $status;
        }
        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_PAYOUT A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT A.PONO, E.TITLE, A.ORGNAME, A.NETAMOUNT, A.STATUS, A.TRANSFERREF, A.REQUESTAT
            FROM T_PAYOUT A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            " . $where . "
            ORDER BY A.PAYOUTID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);
        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF");
        fputcsv($fp, ['Nomor', 'Event', 'Penyelenggara', 'Bersih', 'Status', 'Referensi', 'Diajukan'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->PONO, $r->TITLE, $r->ORGNAME, (string) $r->NETAMOUNT,
                $r->STATUS, $r->TRANSFERREF, $r->REQUESTAT,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'mpayout', 'page' => 'Payout Request',
            'table' => 'T_PAYOUT', 'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [], 'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'payout_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
