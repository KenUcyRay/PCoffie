<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Riwayat pembayaran pusat (Finance). Tabel dbo.T_PAYMENT + T_PAYMENT_REFUND.
// SEGMENT frontend: home/mpayment/mpayment. Menu CPMENU MCONTROL = mpayment.
//
// Pencatatan/pembatalan/refund lewat PaymentService (satu-satunya jalan).
// Uang tampil dalam rupiah; email/telepon disamarkan.
class Mmpayment extends Model
{
    use ColumnFilter;

    const MCODE = 70010002;
    const EXPORT_LIMIT = 10000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'PAYNO' => 'A.PAYNO',
            'PAIDAT' => 'A.PAIDAT',
            'TOTALPAID' => 'A.TOTALPAID',
            'STATUS' => 'A.STATUS',
        ];
    }

    // Tolak bila group user tidak punya akses menu Payment History.
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

    // Rentang waktu: default bulan ini, maksimum 366 hari.
    // Return [from, to, pesanError|null] (Y-m-d H:i:s).
    private static function parseRange($param): array
    {
        $fRaw = trim((string) ($param['paidfrom'] ?? $param['datefrom'] ?? ''));
        $tRaw = trim((string) ($param['paidto'] ?? $param['dateto'] ?? ''));
        $fTs = $fRaw !== '' ? strtotime($fRaw) : strtotime(date('Y-m-01'));
        $tTs = $tRaw !== '' ? strtotime($tRaw) : time();
        if ($fTs === false || $tTs === false) {
            return ['', '', 'Rentang tanggal tidak valid.'];
        }
        if ($tTs < $fTs) {
            return ['', '', 'Tanggal selesai harus setelah tanggal mulai.'];
        }
        if (($tTs - $fTs) > 366 * 86400) {
            return ['', '', 'Rentang maksimum 1 tahun.'];
        }
        $from = date('Y-m-d 00:00:00', $fTs);
        $to = date('Y-m-d 23:59:59', $tTs);
        return [$from, $to, null];
    }

    // Kolom list/detail + label referensi + total dikembalikan.
    private static function baseSelect(): string
    {
        return "
            SELECT A.PAYMENTID, A.PAYNO, A.REFTYPE, A.REFID, A.EVENTID, A.SELLERID,
                   A.PAYMETHODID, M.PAYNAME, M.PAYCODE,
                   A.SUBTOTAL, A.DISCOUNT, A.PROMOCODE, A.SERVICEFEE, A.SHIPPING,
                   A.TOTALPAID, A.PLATFORMFEE, A.METHODFEE, A.OWNERAMT,
                   A.EXTREF, A.PAIDAT, A.SOURCE, A.STATUS, A.NOTE,
                   A.CANCELREASON, A.CANCELBY, A.CANCELAT,
                   I.INVNO,
                   AT.NAME AS ATTNAME, AT.EMAIL AS ATTEMAIL, AT.PHONE AS ATTPHONE,
                   AT.TICKETCODE, AT.PAYSTATUS AS ATTPAY, AT.ATTENDSTATUS, AT.TIKETSTATUS,
                   O.ORDERNO, O.BUYERNAME, O.BUYEREMAIL, O.BUYERPHONE, O.ORDERSTATUS, O.PAYSTATUS AS ORDPAY,
                   C.CAMPAIGNCODE, C.TITLE AS CAMPTITLE, C.STATUS AS CAMPSTATUS,
                   (SELECT ISNULL(SUM(AMOUNT), 0) FROM T_PAYMENT_REFUND R
                     WHERE R.PAYMENTID = A.PAYMENTID) AS REFUNDEDTOTAL
            FROM T_PAYMENT A
            LEFT JOIN T_PAYMENT_METHOD M ON M.PAYID = A.PAYMETHODID
            LEFT JOIN T_INVOICE I ON I.PAYMENTID = A.PAYMENTID
            LEFT JOIN T_ATTENDEE AT ON AT.ATTENDEEID = A.REFID AND A.REFTYPE = 'TIKET'
            LEFT JOIN T_MERCH_ORDER O ON O.ORDERID = A.REFID AND A.REFTYPE = 'MERCH'
            LEFT JOIN T_AD_CAMPAIGN C ON C.CAMPAIGNID = A.REFID AND A.REFTYPE = 'IKLAN'
        ";
    }

    // Label referensi + penanda refund + samarkan kontak.
    private static function decorate($row): array
    {
        $arr = (array) $row;
        $type = strtoupper(trim((string) ($arr['REFTYPE'] ?? '')));
        if ($type === 'TIKET') {
            $arr['REFLABEL'] = trim((string) ($arr['ATTNAME'] ?? '')) . ' (' . (string) ($arr['TICKETCODE'] ?? '') . ')';
            [$me, $mp] = Mmattendee::maskContact(
                isset($arr['ATTEMAIL']) ? (string) $arr['ATTEMAIL'] : null,
                isset($arr['ATTPHONE']) ? (string) $arr['ATTPHONE'] : null
            );
            $arr['ATTEMAIL'] = $me;
            $arr['ATTPHONE'] = $mp;
        } elseif ($type === 'MERCH') {
            $arr['REFLABEL'] = (string) ($arr['ORDERNO'] ?? '') . ' / ' . trim((string) ($arr['BUYERNAME'] ?? ''));
            $masked = MerchConfig::maskBuyer(
                isset($arr['BUYERNAME']) ? (string) $arr['BUYERNAME'] : null,
                isset($arr['BUYERPHONE']) ? (string) $arr['BUYERPHONE'] : null,
                null
            );
            $arr['BUYERNAME'] = $masked[0];
            $arr['BUYERPHONE'] = $masked[1];
        } else {
            $arr['REFLABEL'] = (string) ($arr['CAMPAIGNCODE'] ?? '') . ' ' . trim((string) ($arr['CAMPTITLE'] ?? ''));
        }
        $refunded = Money::r($arr['REFUNDEDTOTAL'] ?? 0);
        $arr['REFUNDEDTOTAL'] = $refunded;
        if (strtoupper(trim((string) ($arr['STATUS'] ?? ''))) !== 'BERHASIL' || $refunded <= 0) {
            $arr['REFUNDSTATUS'] = '-';
        } else {
            $base = $type === 'MERCH'
                ? Money::r($arr['TOTALPAID'] ?? 0)
                : Money::r($arr['SUBTOTAL'] ?? 0) - Money::r($arr['DISCOUNT'] ?? 0);
            $arr['REFUNDSTATUS'] = $refunded >= $base ? 'DIKEMBALIKAN' : 'SEBAGIAN';
        }
        return $arr;
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $reftype = strtoupper(trim((string) ($param['reftype'] ?? '')));
        $methodid = trim((string) ($param['paymethodid'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $eventid = trim((string) ($param['eventid'] ?? ''));
        $sellerid = trim((string) ($param['sellerid'] ?? ''));
        $source = strtoupper(trim((string) ($param['source'] ?? '')));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.PAIDAT >= ? AND A.PAIDAT <= ?";
        $args = [$from, $to];
        if ($q !== '') {
            $where .= " AND (A.PAYNO LIKE ? OR A.EXTREF LIKE ? OR AT.NAME LIKE ? OR O.ORDERNO LIKE ? OR O.BUYERNAME LIKE ? OR C.CAMPAIGNCODE LIKE ?)";
            $like = '%' . $q . '%';
            array_push($args, $like, $like, $like, $like, $like, $like);
        }
        if (in_array($reftype, ['TIKET', 'MERCH', 'IKLAN'], true)) {
            $where .= " AND A.REFTYPE = ?";
            $args[] = $reftype;
        }
        if ($methodid !== '' && ctype_digit($methodid)) {
            $where .= " AND A.PAYMETHODID = ?";
            $args[] = (int) $methodid;
        }
        if ($status === 'BERHASIL' || $status === 'DIBATALKAN') {
            $where .= " AND A.STATUS = ?";
            $args[] = $status;
        }
        if ($eventid !== '' && ctype_digit($eventid)) {
            $where .= " AND A.EVENTID = ?";
            $args[] = (int) $eventid;
        }
        if ($sellerid !== '' && ctype_digit($sellerid)) {
            $where .= " AND A.SELLERID = ?";
            $args[] = (int) $sellerid;
        }
        if (in_array($source, ['MANUAL', 'IMPOR', 'BACKFILL'], true)) {
            $where .= " AND A.SOURCE = ?";
            $args[] = $source;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne(
            "SELECT COUNT(*) AS TOTAL FROM T_PAYMENT A
             LEFT JOIN T_ATTENDEE AT ON AT.ATTENDEEID = A.REFID AND A.REFTYPE = 'TIKET'
             LEFT JOIN T_MERCH_ORDER O ON O.ORDERID = A.REFID AND A.REFTYPE = 'MERCH'
             LEFT JOIN T_AD_CAMPAIGN C ON C.CAMPAIGNID = A.REFID AND A.REFTYPE = 'IKLAN'" . $where,
            $args
        );
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.PAIDAT DESC, A.PAYMENTID DESC';

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
        $id = $vdata['PAYMENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PAYMENTID tidak ditemukan.']);
        }

        $row = DB::selectOne(self::baseSelect() . " WHERE A.PAYMENTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data pembayaran tidak ditemukan.']);
        }

        $arr = self::decorate($row);
        $arr['REFUNDS'] = DB::select("
            SELECT REFUNDID, AMOUNT, REFUNDTIME, REFUNDTYPE, REFID, ACTOR
            FROM T_PAYMENT_REFUND WHERE PAYMENTID = ? ORDER BY REFUNDID
        ", [$id]);
        $inv = DB::selectOne("SELECT INVNO, STATUS FROM T_INVOICE WHERE PAYMENTID = ?", [$id]);
        $arr['INVNO'] = $inv ? (string) $inv->INVNO : '';
        $arr['INVSTATUS'] = $inv ? (string) $inv->STATUS : '';

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Ringkasan angka pada rentang terpilih.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        $t = DB::selectOne("
            SELECT COUNT(*) AS N, ISNULL(SUM(TOTALPAID), 0) AS S
            FROM T_PAYMENT WHERE STATUS = 'BERHASIL' AND PAIDAT >= ? AND PAIDAT <= ?
        ", [$from, $to]);
        $rf = DB::selectOne("
            SELECT ISNULL(SUM(R.AMOUNT), 0) AS S FROM T_PAYMENT_REFUND R
            JOIN T_PAYMENT A ON A.PAYMENTID = R.PAYMENTID
            WHERE A.STATUS = 'BERHASIL' AND R.REFUNDTIME >= ? AND R.REFUNDTIME <= ?
        ", [$from, $to]);
        $per = DB::select("
            SELECT REFTYPE, COUNT(*) AS N, ISNULL(SUM(TOTALPAID), 0) AS S
            FROM T_PAYMENT WHERE STATUS = 'BERHASIL' AND PAIDAT >= ? AND PAIDAT <= ?
            GROUP BY REFTYPE
        ", [$from, $to]);
        $out = [
            'COUNT' => $t ? (int) $t->N : 0,
            'TOTAL' => $t ? (string) $t->S : '0',
            'REFUNDED' => $rf ? (string) $rf->S : '0',
            'TIKET' => '0', 'TIKET_N' => 0,
            'MERCH' => '0', 'MERCH_N' => 0,
            'IKLAN' => '0', 'IKLAN_N' => 0,
        ];
        foreach ($per as $r) {
            $k = strtoupper(trim((string) $r->REFTYPE));
            if (isset($out[$k])) {
                $out[$k] = (string) $r->S;
                $out[$k . '_N'] = (int) $r->N;
            }
        }

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    // Cari referensi yang boleh dibayar (untuk form catat).
    public static function search_payable($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $type = strtoupper(trim((string) ($vdata['REFTYPE'] ?? $param['reftype'] ?? '')));
        $q = trim((string) ($vdata['Q'] ?? $param['q'] ?? ''));

        if (!in_array($type, ['TIKET', 'MERCH', 'IKLAN'], true)) {
            return json_encode(['success' => 'false', 'message' => 'REFTYPE harus TIKET, MERCH, atau IKLAN.']);
        }

        $like = '%' . $q . '%';
        if ($type === 'TIKET') {
            $rows = DB::select("
                SELECT TOP 25 AT.ATTENDEEID AS REFID,
                       AT.NAME + ' (' + AT.TICKETCODE + ')' AS LABEL,
                       TT.PRICE AS AMOUNT, E.TITLE AS EXTRA
                FROM T_ATTENDEE AT
                JOIN T_EVENT E ON E.EVENTID = AT.EVENTID
                JOIN T_TICKET_TYPE TT ON TT.TICKETTYPEID = AT.TICKETTYPEID
                WHERE AT.PAYSTATUS = 'BELUM_BAYAR' AND AT.TIKETSTATUS = 'AKTIF'
                  AND E.STATUS = 'PUBLISHED'
                  AND (AT.NAME LIKE ? OR AT.TICKETCODE LIKE ? OR AT.EMAIL LIKE ?)
                ORDER BY AT.ATTENDEEID DESC
            ", [$like, $like, $like]);
        } elseif ($type === 'MERCH') {
            $rows = DB::select("
                SELECT TOP 25 O.ORDERID AS REFID,
                       O.ORDERNO + ' / ' + O.BUYERNAME AS LABEL,
                       (O.SUBTOTAL + O.SHIPPING) AS AMOUNT, S.SHOPNAME AS EXTRA
                FROM T_MERCH_ORDER O
                JOIN T_SELLER S ON S.SELLERID = O.SELLERID
                WHERE O.PAYSTATUS = 'BELUM_BAYAR'
                  AND O.ORDERSTATUS NOT IN ('DIBATALKAN', 'DIKEMBALIKAN')
                  AND (O.ORDERNO LIKE ? OR O.BUYERNAME LIKE ?)
                ORDER BY O.ORDERID DESC
            ", [$like, $like]);
        } else {
            $rows = DB::select("
                SELECT TOP 25 C.CAMPAIGNID AS REFID,
                       C.CAMPAIGNCODE + ' ' + C.TITLE AS LABEL,
                       C.TOTALCOST AS AMOUNT, C.ADVERTISER AS EXTRA
                FROM T_AD_CAMPAIGN C
                WHERE C.STATUS = 'MENUNGGU_BAYAR'
                  AND (C.CAMPAIGNCODE LIKE ? OR C.TITLE LIKE ? OR C.ADVERTISER LIKE ?)
                ORDER BY C.CAMPAIGNID DESC
            ", [$like, $like, $like]);
        }

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Opsi metode pembayaran aktif (+biaya dan batas, untuk form catat).
    public static function read_methods($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $rows = DB::select("
            SELECT PAYID, PAYCODE, PAYNAME, PAYTYPE, PCTCOST, FIXCOST, MINAMT, MAXAMT
            FROM T_PAYMENT_METHOD WHERE PAYACTIVE = 'YES' ORDER BY PAYSORT, PAYNAME
        ");

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Catat pembayaran via layanan pusat (+audit).
    public static function process_record($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $vdata['ACTOR'] = $param['VUSERLOGIN'] ?? '';
        if (!isset($vdata['SOURCE']) || trim((string) $vdata['SOURCE']) === '') {
            $vdata['SOURCE'] = 'MANUAL';
        }

        $r = PaymentService::record($vdata);
        if (!$r['ok']) {
            return json_encode(['success' => 'false', 'message' => $r['message']]);
        }

        $pay = $r['payment'];
        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mpayment', 'page' => 'Payment History',
            'table' => 'T_PAYMENT', 'dataId' => (string) ($pay['PAYNO'] ?? ''),
            'summary' => 'BAYAR ' . (string) ($pay['PAYNO'] ?? '') . ' ' . Money::rp(Money::r($pay['TOTALPAID'] ?? 0)),
            'before' => [],
            'after' => ['REFTYPE' => (string) ($pay['REFTYPE'] ?? ''), 'TOTALPAID' => (string) ($pay['TOTALPAID'] ?? '0')],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => $r['message'],
            'Rows' => [$pay],
        ]);
    }

    // Pratinjau hitungan TANPA menulis (ringkasan form + uji promo).
    public static function preview_record($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $vdata['ACTOR'] = $param['VUSERLOGIN'] ?? '';

        $r = PaymentService::preview($vdata);
        if (!$r['ok']) {
            return json_encode(['success' => 'false', 'message' => $r['message']]);
        }

        return json_encode(['success' => true, 'Rows' => [$r['calc']]]);
    }

    // Batalkan pembayaran via layanan pusat (+audit).
    public static function process_cancel($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $vdata['ACTOR'] = $param['VUSERLOGIN'] ?? '';

        $r = PaymentService::cancel($vdata);
        if (!$r['ok']) {
            return json_encode(['success' => 'false', 'message' => $r['message']]);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mpayment', 'page' => 'Payment History',
            'table' => 'T_PAYMENT', 'dataId' => (string) ($vdata['PAYMENTID'] ?? ''),
            'summary' => 'BATAL BAYAR #' . (string) ($vdata['PAYMENTID'] ?? ''),
            'before' => ['STATUS' => 'BERHASIL'],
            'after' => ['STATUS' => 'DIBATALKAN'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => $r['message']]);
    }

    // Pemeriksaan konsistensi: sumber LUNAS tanpa pembayaran BERHASIL, dan
    // pembayaran BERHASIL yang sumbernya tidak LUNAS. Sehat = nol keduanya.
    public static function read_consistency($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        // A1: peserta LUNAS+AKTIF tanpa pembayaran BERHASIL.
        $a1 = DB::select("
            SELECT TOP 25 AT.ATTENDEEID AS ID, AT.TICKETCODE AS CODE
            FROM T_ATTENDEE AT
            LEFT JOIN T_PAYMENT P ON P.REFTYPE = 'TIKET' AND P.REFID = AT.ATTENDEEID AND P.STATUS = 'BERHASIL'
            WHERE AT.PAYSTATUS = 'LUNAS' AND AT.TIKETSTATUS = 'AKTIF' AND P.PAYMENTID IS NULL
            ORDER BY AT.ATTENDEEID
        ");
        $c1 = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_ATTENDEE AT
            LEFT JOIN T_PAYMENT P ON P.REFTYPE = 'TIKET' AND P.REFID = AT.ATTENDEEID AND P.STATUS = 'BERHASIL'
            WHERE AT.PAYSTATUS = 'LUNAS' AND AT.TIKETSTATUS = 'AKTIF' AND P.PAYMENTID IS NULL
        ");
        // A2: pesanan LUNAS tanpa pembayaran BERHASIL.
        $a2 = DB::select("
            SELECT TOP 25 O.ORDERID AS ID, O.ORDERNO AS CODE
            FROM T_MERCH_ORDER O
            LEFT JOIN T_PAYMENT P ON P.REFTYPE = 'MERCH' AND P.REFID = O.ORDERID AND P.STATUS = 'BERHASIL'
            WHERE O.PAYSTATUS = 'LUNAS' AND P.PAYMENTID IS NULL
            ORDER BY O.ORDERID
        ");
        $c2 = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_MERCH_ORDER O
            LEFT JOIN T_PAYMENT P ON P.REFTYPE = 'MERCH' AND P.REFID = O.ORDERID AND P.STATUS = 'BERHASIL'
            WHERE O.PAYSTATUS = 'LUNAS' AND P.PAYMENTID IS NULL
        ");
        // A3: kampanye AKTIF/DIJEDA tanpa pembayaran BERHASIL.
        $a3 = DB::select("
            SELECT TOP 25 C.CAMPAIGNID AS ID, C.CAMPAIGNCODE AS CODE
            FROM T_AD_CAMPAIGN C
            LEFT JOIN T_PAYMENT P ON P.REFTYPE = 'IKLAN' AND P.REFID = C.CAMPAIGNID AND P.STATUS = 'BERHASIL'
            WHERE C.STATUS IN ('AKTIF', 'DIJEDA') AND P.PAYMENTID IS NULL
            ORDER BY C.CAMPAIGNID
        ");
        $c3 = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_AD_CAMPAIGN C
            LEFT JOIN T_PAYMENT P ON P.REFTYPE = 'IKLAN' AND P.REFID = C.CAMPAIGNID AND P.STATUS = 'BERHASIL'
            WHERE C.STATUS IN ('AKTIF', 'DIJEDA') AND P.PAYMENTID IS NULL
        ");
        // B: pembayaran BERHASIL yang sumbernya tidak LUNAS/AKTIF.
        // TIKET REFUND = sudah di-refund (approve) dengan pembayaran tetap
        // BERHASIL, jadi ikut sehat.
        $b = DB::select("
            SELECT TOP 25 A.PAYMENTID AS ID, A.PAYNO AS CODE, A.REFTYPE AS TYPE
            FROM T_PAYMENT A
            LEFT JOIN T_ATTENDEE AT ON AT.ATTENDEEID = A.REFID AND A.REFTYPE = 'TIKET'
            LEFT JOIN T_MERCH_ORDER O ON O.ORDERID = A.REFID AND A.REFTYPE = 'MERCH'
            LEFT JOIN T_AD_CAMPAIGN C ON C.CAMPAIGNID = A.REFID AND A.REFTYPE = 'IKLAN'
            WHERE A.STATUS = 'BERHASIL' AND (
                (A.REFTYPE = 'TIKET' AND (AT.ATTENDEEID IS NULL OR AT.PAYSTATUS NOT IN ('LUNAS', 'REFUND')))
                OR (A.REFTYPE = 'MERCH' AND (O.ORDERID IS NULL OR O.PAYSTATUS <> 'LUNAS'))
                OR (A.REFTYPE = 'IKLAN' AND (C.CAMPAIGNID IS NULL OR C.STATUS NOT IN ('AKTIF', 'DIJEDA')))
            )
            ORDER BY A.PAYMENTID
        ");
        $cb = DB::selectOne("
            SELECT COUNT(*) AS C
            FROM T_PAYMENT A
            LEFT JOIN T_ATTENDEE AT ON AT.ATTENDEEID = A.REFID AND A.REFTYPE = 'TIKET'
            LEFT JOIN T_MERCH_ORDER O ON O.ORDERID = A.REFID AND A.REFTYPE = 'MERCH'
            LEFT JOIN T_AD_CAMPAIGN C ON C.CAMPAIGNID = A.REFID AND A.REFTYPE = 'IKLAN'
            WHERE A.STATUS = 'BERHASIL' AND (
                (A.REFTYPE = 'TIKET' AND (AT.ATTENDEEID IS NULL OR AT.PAYSTATUS NOT IN ('LUNAS', 'REFUND')))
                OR (A.REFTYPE = 'MERCH' AND (O.ORDERID IS NULL OR O.PAYSTATUS <> 'LUNAS'))
                OR (A.REFTYPE = 'IKLAN' AND (C.CAMPAIGNID IS NULL OR C.STATUS NOT IN ('AKTIF', 'DIJEDA')))
            )
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'MISS_TIKET' => $c1 ? (int) $c1->C : 0,
            'MISS_MERCH' => $c2 ? (int) $c2->C : 0,
            'MISS_IKLAN' => $c3 ? (int) $c3->C : 0,
            'ORPHAN' => $cb ? (int) $cb->C : 0,
            'SAMPLE_A' => array_merge(
                array_map(function ($r) { return ['TYPE' => 'TIKET', 'ID' => $r->ID, 'CODE' => $r->CODE]; }, $a1),
                array_map(function ($r) { return ['TYPE' => 'MERCH', 'ID' => $r->ID, 'CODE' => $r->CODE]; }, $a2),
                array_map(function ($r) { return ['TYPE' => 'IKLAN', 'ID' => $r->ID, 'CODE' => $r->CODE]; }, $a3)
            ),
            'SAMPLE_B' => $b,
        ]]]);
    }

    // Export CSV mengikuti filter aktif (dibatasi, dicatat di Audit Log).
    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        $reftype = strtoupper(trim((string) ($param['reftype'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));

        $where = " WHERE A.PAIDAT >= ? AND A.PAIDAT <= ?";
        $args = [$from, $to];
        if (in_array($reftype, ['TIKET', 'MERCH', 'IKLAN'], true)) {
            $where .= " AND A.REFTYPE = ?";
            $args[] = $reftype;
        }
        if ($status === 'BERHASIL' || $status === 'DIBATALKAN') {
            $where .= " AND A.STATUS = ?";
            $args[] = $status;
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_PAYMENT A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT A.PAYNO, A.PAIDAT, A.REFTYPE, A.TOTALPAID, A.STATUS, A.SOURCE,
                   M.PAYNAME, I.INVNO
            FROM T_PAYMENT A
            LEFT JOIN T_PAYMENT_METHOD M ON M.PAYID = A.PAYMETHODID
            LEFT JOIN T_INVOICE I ON I.PAYMENTID = A.PAYMENTID
            " . $where . "
            ORDER BY A.PAIDAT DESC, A.PAYMENTID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Nomor', 'Waktu Bayar', 'Jenis', 'Total', 'Status', 'Sumber', 'Metode', 'Invoice'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->PAYNO, $r->PAIDAT, $r->REFTYPE, (string) $r->TOTALPAID,
                $r->STATUS, $r->SOURCE, $r->PAYNAME, $r->INVNO,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'mpayment', 'page' => 'Payment History',
            'table' => 'T_PAYMENT', 'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [], 'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'payment_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
