<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Laporan penjualan (Finance), hanya baca. Sumber: T_PAYMENT,
// T_PAYMENT_REFUND, T_PAYOUT, T_WITHDRAWAL — konsisten dengan halaman lain.
// SEGMENT frontend: home/msales/msales. Menu CPMENU MCONTROL = msales.
class Mmsales extends Model
{
    use ColumnFilter;

    const MCODE = 70020002;
    const EXPORT_LIMIT = 10000;

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

    // Rentang waktu: default bulan ini, maksimum 1 tahun. Pembayaran dihitung
    // berdasarkan PAIDAT; refund berdasarkan REFUNDTIME.
    private static function range($param): array
    {
        $fRaw = trim((string) ($param['paidfrom'] ?? $param['datefrom'] ?? ''));
        $tRaw = trim((string) ($param['paidto'] ?? $param['dateto'] ?? ''));
        $fTs = $fRaw !== '' ? strtotime($fRaw) : strtotime(date('Y-m-01'));
        $tTs = $tRaw !== '' ? strtotime($tRaw) : time();
        if ($fTs === false || $tTs === false) {
            return [null, null, 'Rentang tanggal tidak valid.'];
        }
        if ($tTs < $fTs) {
            return [null, null, 'Tanggal selesai harus setelah tanggal mulai.'];
        }
        if (($tTs - $fTs) > 366 * 86400) {
            return [null, null, 'Rentang maksimum 1 tahun.'];
        }
        return [date('Y-m-d 00:00:00', $fTs), date('Y-m-d 23:59:59', $tTs), null];
    }

    // Total refund untuk pembayaran TIKET/MERCH pada rentang (per TYPE opsional).
    private static function refundSum(string $refType, string $from, string $to, ?int $eventId = null, ?int $sellerId = null): int
    {
        $sql = "
            SELECT ISNULL(SUM(R.AMOUNT), 0) AS S
            FROM T_PAYMENT_REFUND R
            JOIN T_PAYMENT P ON P.PAYMENTID = R.PAYMENTID
            WHERE P.REFTYPE = ? AND P.STATUS = 'BERHASIL'
              AND R.REFUNDTIME >= ? AND R.REFUNDTIME <= ?
        ";
        $args = [$refType, $from, $to];
        if ($eventId !== null) {
            $sql .= " AND P.EVENTID = ?";
            $args[] = $eventId;
        }
        if ($sellerId !== null) {
            $sql .= " AND P.SELLERID = ?";
            $args[] = $sellerId;
        }
        $r = DB::selectOne($sql, $args);
        return Money::r($r->S ?? 0);
    }

    // ------------------------------------------------------------ TIKET TAB
    public static function read_ticket($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        [$from, $to, $err] = self::range($param);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $eventId = trim((string) ($param['eventid'] ?? ''));
        $cat = strtoupper(trim((string) ($param['category'] ?? '')));
        $city = strtoupper(trim((string) ($param['city'] ?? '')));

        // Filter opsional per event/kategori/kota (join T_EVENT, LIKE aman).
        $where = " WHERE P.REFTYPE = 'TIKET' AND P.STATUS = 'BERHASIL' AND P.PAIDAT >= ? AND P.PAIDAT <= ?";
        $args = [$from, $to];
        if ($eventId !== '' && ctype_digit($eventId)) {
            $where .= " AND P.EVENTID = ?";
            $args[] = (int) $eventId;
        }
        if ($cat !== '') {
            $where .= " AND UPPER(E.CATCODE) = ?";
            $args[] = $cat;
        }
        if ($city !== '') {
            $where .= " AND UPPER(E.CITYCODE) = ?";
            $args[] = $city;
        }

        // Ringkasan global (bayar tiket).
        $sum = DB::selectOne("
            SELECT COUNT(*) AS N,
                   ISNULL(SUM(P.SUBTOTAL), 0) AS G,
                   ISNULL(SUM(P.DISCOUNT), 0) AS D,
                   ISNULL(SUM(P.SERVICEFEE), 0) AS SV,
                   ISNULL(SUM(P.PLATFORMFEE), 0) AS PF,
                   ISNULL(SUM(P.OWNERAMT), 0) AS OWN
            FROM T_PAYMENT P
            LEFT JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            " . $where, $args);

        $refund = self::refundSum('TIKET', $from, $to, $eventId !== '' && ctype_digit($eventId) ? (int) $eventId : null);
        $summary = [
            'COUNT' => $sum ? (int) $sum->N : 0,
            'GROSS' => Money::r($sum->G ?? 0),
            'DISCOUNT' => Money::r($sum->D ?? 0),
            'SERVICE' => Money::r($sum->SV ?? 0),
            'PLATFORM' => Money::r($sum->PF ?? 0),
            'REFUND' => $refund,
            'NET_OWNER' => max(0, Money::r($sum->OWN ?? 0) - $refund),
        ];

        // Per event.
        $rows = DB::select("
            SELECT E.EVENTID, E.EVENTCODE, E.TITLE, E.ORGNAME,
                   COUNT(*) AS N,
                   ISNULL(SUM(P.SUBTOTAL), 0) AS G,
                   ISNULL(SUM(P.DISCOUNT), 0) AS D,
                   ISNULL(SUM(P.PLATFORMFEE), 0) AS PF,
                   ISNULL(SUM(P.OWNERAMT), 0) AS OWN,
                   ISNULL(SUM(P.TOTALPAID), 0) AS TOTAL
            FROM T_PAYMENT P
            JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            " . $where . "
            GROUP BY E.EVENTID, E.EVENTCODE, E.TITLE, E.ORGNAME
            ORDER BY TOTAL DESC
        ", $args);

        $out = [];
        foreach ($rows as $r) {
            $eid = (int) $r->EVENTID;
            $rf = self::refundSum('TIKET', $from, $to, $eid);
            $po = DB::selectOne("
                SELECT TOP 1 STATUS FROM T_PAYOUT WHERE EVENTID = ?
                ORDER BY CASE STATUS WHEN 'BERHASIL' THEN 0 WHEN 'DIPROSES' THEN 1 WHEN 'DIAJUKAN' THEN 2 ELSE 3 END
            ", [$eid]);
            $out[] = [
                'EVENTID' => $eid, 'EVENTCODE' => (string) $r->EVENTCODE,
                'TITLE' => (string) $r->TITLE, 'ORGNAME' => (string) $r->ORGNAME,
                'COUNT' => (int) $r->N, 'GROSS' => Money::r($r->G),
                'DISCOUNT' => Money::r($r->D), 'PLATFORM' => Money::r($r->PF),
                'REFUND' => $rf,
                'NET_OWNER' => max(0, Money::r($r->OWN) - $rf),
                'PAYOUT' => $po ? (string) $po->STATUS : '-',
            ];
        }

        // Tren harian tiket (filter event/kategori/kota).
        $tSql = "
            SELECT CAST(P.PAIDAT AS DATE) AS D, COUNT(*) AS N, ISNULL(SUM(P.TOTALPAID), 0) AS S
            FROM T_PAYMENT P
            LEFT JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            WHERE P.REFTYPE = 'TIKET' AND P.STATUS = 'BERHASIL'
              AND P.PAIDAT >= ? AND P.PAIDAT <= ?
        ";
        $tArgs = [$from, $to];
        if ($eventId !== '' && ctype_digit($eventId)) { $tSql .= " AND P.EVENTID = ?"; $tArgs[] = (int) $eventId; }
        if ($cat !== '') { $tSql .= " AND UPPER(E.CATCODE) = ?"; $tArgs[] = $cat; }
        if ($city !== '') { $tSql .= " AND UPPER(E.CITYCODE) = ?"; $tArgs[] = $city; }
        $tSql .= " GROUP BY CAST(P.PAIDAT AS DATE) ORDER BY D";
        $trendRows = DB::select($tSql, $tArgs);
        $trendOut = [];
        foreach ($trendRows as $tr) {
            $trendOut[] = ['DATE' => substr((string) $tr->D, 0, 10), 'N' => (int) $tr->N, 'TOTAL' => Money::r($tr->S)];
        }

        return json_encode(['success' => true, 'Rows' => [$summary], 'Events' => $out, 'Trend' => $trendOut]);
    }

    // ----------------------------------------------------------- MERCH TAB
    public static function read_merch($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        [$from, $to, $err] = self::range($param);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $sellerId = trim((string) ($param['sellerid'] ?? ''));
        $cat = strtoupper(trim((string) ($param['category'] ?? '')));

        $where = " WHERE P.REFTYPE = 'MERCH' AND P.STATUS = 'BERHASIL' AND P.PAIDAT >= ? AND P.PAIDAT <= ?";
        $args = [$from, $to];
        if ($sellerId !== '' && ctype_digit($sellerId)) {
            $where .= " AND P.SELLERID = ?";
            $args[] = (int) $sellerId;
        }

        $sum = DB::selectOne("
            SELECT COUNT(*) AS N,
                   ISNULL(SUM(P.SUBTOTAL), 0) AS G,
                   ISNULL(SUM(P.SHIPPING), 0) AS SH,
                   ISNULL(SUM(P.PLATFORMFEE), 0) AS PF,
                   ISNULL(SUM(P.OWNERAMT), 0) AS OWN
            FROM T_PAYMENT P
            " . $where, $args);

        $refund = self::refundSum('MERCH', $from, $to, null, $sellerId !== '' && ctype_digit($sellerId) ? (int) $sellerId : null);
        $summary = [
            'COUNT' => $sum ? (int) $sum->N : 0,
            'GROSS' => Money::r($sum->G ?? 0),
            'SHIPPING' => Money::r($sum->SH ?? 0),
            'PLATFORM' => Money::r($sum->PF ?? 0),
            'REFUND' => $refund,
            'NET_SELLER' => max(0, Money::r($sum->OWN ?? 0) + Money::r($sum->SH ?? 0) - $refund),
        ];

        $rows = DB::select("
            SELECT S.SELLERID, S.SELLERCODE, S.SHOPNAME,
                   COUNT(*) AS N,
                   ISNULL(SUM(P.SUBTOTAL), 0) AS G,
                   ISNULL(SUM(P.SHIPPING), 0) AS SH,
                   ISNULL(SUM(P.PLATFORMFEE), 0) AS PF,
                   ISNULL(SUM(P.OWNERAMT), 0) AS OWN
            FROM T_PAYMENT P
            JOIN T_SELLER S ON S.SELLERID = P.SELLERID
            " . $where . "
            GROUP BY S.SELLERID, S.SELLERCODE, S.SHOPNAME
            ORDER BY G DESC
        ", $args);

        $out = [];
        foreach ($rows as $r) {
            $sid = (int) $r->SELLERID;
            $rf = self::refundSum('MERCH', $from, $to, null, $sid);
            $out[] = [
                'SELLERID' => $sid, 'SELLERCODE' => (string) $r->SELLERCODE, 'SHOPNAME' => (string) $r->SHOPNAME,
                'COUNT' => (int) $r->N, 'GROSS' => Money::r($r->G),
                'SHIPPING' => Money::r($r->SH), 'PLATFORM' => Money::r($r->PF),
                'REFUND' => $rf,
                'NET_SELLER' => max(0, Money::r($r->OWN) + Money::r($r->SH) - $rf),
            ];
        }

        // Tren harian merch.
        $tArgs = [$from, $to];
        $tSql = "
            SELECT CAST(P.PAIDAT AS DATE) AS D, COUNT(*) AS N, ISNULL(SUM(P.TOTALPAID), 0) AS S
            FROM T_PAYMENT P
            WHERE P.REFTYPE = 'MERCH' AND P.STATUS = 'BERHASIL'
              AND P.PAIDAT >= ? AND P.PAIDAT <= ?
        ";
        if ($sellerId !== '' && ctype_digit($sellerId)) { $tSql .= " AND P.SELLERID = ?"; $tArgs[] = (int) $sellerId; }
        if ($cat !== '') {
            $tSql .= " AND EXISTS (SELECT 1 FROM T_MERCH_ORDER O JOIN T_MERCH_ORDER_ITEM I ON I.ORDERID = O.ORDERID
                JOIN T_PRODUCT PR ON PR.PRODUCTID = I.PRODUCTID
                WHERE O.ORDERID = P.REFID AND UPPER(PR.CATEGORY) = ?)";
            $tArgs[] = $cat;
        }
        $tSql .= " GROUP BY CAST(P.PAIDAT AS DATE) ORDER BY D";
        $trendRows = DB::select($tSql, $tArgs);
        $trendOut = [];
        foreach ($trendRows as $tr) {
            $trendOut[] = ['DATE' => substr((string) $tr->D, 0, 10), 'N' => (int) $tr->N, 'TOTAL' => Money::r($tr->S)];
        }

        return json_encode(['success' => true, 'Rows' => [$summary], 'Sellers' => $out, 'Trend' => $trendOut]);
    }

    // ----------------------------------------------------- PLATFORM TAB
    public static function read_platform($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        [$from, $to, $err] = self::range($param);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $t = DB::selectOne("
            SELECT ISNULL(SUM(CASE WHEN REFTYPE IN ('TIKET', 'MERCH') THEN PLATFORMFEE ELSE 0 END), 0) AS PF,
                   ISNULL(SUM(CASE WHEN REFTYPE = 'TIKET' THEN SERVICEFEE ELSE 0 END), 0) AS SV,
                   ISNULL(SUM(CASE WHEN REFTYPE = 'IKLAN' THEN TOTALPAID ELSE 0 END), 0) AS AD,
                   ISNULL(SUM(METHODFEE), 0) AS MF
            FROM T_PAYMENT
            WHERE STATUS = 'BERHASIL' AND PAIDAT >= ? AND PAIDAT <= ?
        ", [$from, $to]);

        $wd = DB::selectOne(
            "SELECT 1 AS X FROM sys.objects WHERE object_id = OBJECT_ID('dbo.T_WITHDRAWAL') AND type = 'U'"
        );
        $wdFee = 0;
        if ($wd) {
            $w = DB::selectOne("
                SELECT ISNULL(SUM(WITHDRAWFEE), 0) AS S FROM T_WITHDRAWAL
                WHERE STATUS = 'BERHASIL' AND DONEAT >= ? AND DONEAT <= ?
            ", [$from, $to]);
            $wdFee = Money::r($w->S ?? 0);
        }

        $methodFee = Money::r($t->MF ?? 0);
        $net = Money::r($t->PF ?? 0) + Money::r($t->SV ?? 0) + Money::r($t->AD ?? 0) + $wdFee - $methodFee;

        $summary = [
            'PLATFORM_FEE' => Money::r($t->PF ?? 0),
            'SERVICE_FEE' => Money::r($t->SV ?? 0),
            'AD_REVENUE' => Money::r($t->AD ?? 0),
            'WITHDRAWAL_FEE' => $wdFee,
            'METHOD_FEE_EST' => $methodFee,
            'NET' => $net,
        ];

        // Tren pendapatan bersih per hari (plat fee+service+iklan−metode).
        $tSql = "
            SELECT CAST(PAIDAT AS DATE) AS D,
                   ISNULL(SUM(CASE WHEN REFTYPE IN ('TIKET','MERCH') THEN PLATFORMFEE ELSE 0 END), 0) AS PF,
                   ISNULL(SUM(CASE WHEN REFTYPE = 'TIKET' THEN SERVICEFEE ELSE 0 END), 0) AS SV,
                   ISNULL(SUM(CASE WHEN REFTYPE = 'IKLAN' THEN TOTALPAID ELSE 0 END), 0) AS AD,
                   ISNULL(SUM(METHODFEE), 0) AS MF
            FROM T_PAYMENT
            WHERE STATUS = 'BERHASIL' AND PAIDAT >= ? AND PAIDAT <= ?
            GROUP BY CAST(PAIDAT AS DATE) ORDER BY D
        ";
        $trendRows = DB::select($tSql, [$from, $to]);
        $trendOut = [];
        foreach ($trendRows as $tr) {
            $trendOut[] = [
                'DATE' => substr((string) $tr->D, 0, 10),
                'TOTAL' => Money::r($tr->PF) + Money::r($tr->SV) + Money::r($tr->AD) - Money::r($tr->MF),
                'N' => 0,
            ];
        }

        // Rincian per jenis.
        $byType = DB::select("
            SELECT REFTYPE, COUNT(*) AS N,
                   ISNULL(SUM(PLATFORMFEE), 0) AS PF,
                   ISNULL(SUM(SERVICEFEE), 0) AS SV,
                   ISNULL(SUM(TOTALPAID), 0) AS T
            FROM T_PAYMENT
            WHERE STATUS = 'BERHASIL' AND PAIDAT >= ? AND PAIDAT <= ?
            GROUP BY REFTYPE
        ", [$from, $to]);
        $byOut = [];
        foreach ($byType as $b) {
            $byOut[] = [
                'TYPE' => (string) $b->REFTYPE, 'N' => (int) $b->N,
                'PLATFORMFEE' => Money::r($b->PF), 'SERVICEFEE' => Money::r($b->SV),
                'TOTAL' => Money::r($b->T),
            ];
        }

        return json_encode(['success' => true, 'Rows' => [$summary], 'ByType' => $byOut, 'Trend' => $trendOut]);
    }

    // ----------------------------------------- PENYESUAIAN SETELAH PAYOUT
    public static function read_adjustments($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        [$from, $to, $err] = self::range($param);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        // Refund + pembatalan pembayaran SETELAH payout BERHASIL (per event).
        $rows = DB::select("
            SELECT PO.EVENTID, E.TITLE, E.ORGNAME,
                   R.AMOUNT AS AMOUNT, R.REFUNDTIME AS AT, 'REFUND' AS KIND
            FROM T_PAYMENT_REFUND R
            JOIN T_PAYMENT P ON P.PAYMENTID = R.PAYMENTID
            JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            JOIN T_PAYOUT PO ON PO.EVENTID = P.EVENTID AND PO.STATUS = 'BERHASIL'
            WHERE P.REFTYPE = 'TIKET' AND R.REFUNDTIME > PO.DONEAT
              AND R.REFUNDTIME >= ? AND R.REFUNDTIME <= ?
            UNION ALL
            SELECT PO.EVENTID, E.TITLE, E.ORGNAME,
                   P.TOTALPAID AS AMOUNT, P.CANCELAT AS AT, 'BATAL_BAYAR' AS KIND
            FROM T_PAYMENT P
            JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            JOIN T_PAYOUT PO ON PO.EVENTID = P.EVENTID AND PO.STATUS = 'BERHASIL'
            WHERE P.REFTYPE = 'TIKET' AND P.STATUS = 'DIBATALKAN' AND P.CANCELAT > PO.DONEAT
              AND P.CANCELAT >= ? AND P.CANCELAT <= ?
            ORDER BY AT DESC
        ", [$from, $to, $from, $to]);

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'EVENTID' => (int) $r->EVENTID, 'TITLE' => (string) $r->TITLE,
                'ORGNAME' => (string) $r->ORGNAME, 'AMOUNT' => Money::r($r->AMOUNT),
                'AT' => $r->AT, 'KIND' => (string) $r->KIND,
            ];
        }

        return json_encode(['success' => true, 'Rows' => $out]);
    }

    // Pilihan filter: daftar event + kategori/kota/seller unik.
    public static function read_filters($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $events = DB::select("
            SELECT EVENTID, TITLE, EVENTCODE FROM T_EVENT
            WHERE STATUS IN ('PUBLISHED', 'ENDED') ORDER BY TITLE
        ");
        $cats = DB::select("SELECT DISTINCT CATCODE FROM T_EVENT WHERE CATCODE IS NOT NULL AND CATCODE <> '' ORDER BY CATCODE");
        $cities = DB::select("SELECT DISTINCT CITYCODE FROM T_EVENT WHERE CITYCODE IS NOT NULL AND CITYCODE <> '' ORDER BY CITYCODE");
        $sellers = DB::select("SELECT SELLERID, SHOPNAME FROM T_SELLER WHERE ISACTIVE = 'YES' ORDER BY SHOPNAME");
        return json_encode(['success' => true, 'Rows' => [[
            'EVENTS' => $events, 'CATS' => $cats, 'CITIES' => $cities, 'SELLERS' => $sellers,
        ]]]);
    }

    // ------------------------------------------------------------------- export
    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $tab = strtoupper(trim((string) ($param['tab'] ?? 'TIKET')));
        [$from, $to, $err] = self::range($param);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF");
        if ($tab === 'MERCH') {
            $rows = DB::select("
                SELECT S.SHOPNAME, COUNT(*) AS N, SUM(P.SUBTOTAL) AS G, SUM(P.SHIPPING) AS SH,
                       SUM(P.PLATFORMFEE) AS PF, SUM(P.OWNERAMT) AS OWN
                FROM T_PAYMENT P
                JOIN T_SELLER S ON S.SELLERID = P.SELLERID
                WHERE P.REFTYPE = 'MERCH' AND P.STATUS = 'BERHASIL' AND P.PAIDAT >= ? AND P.PAIDAT <= ?
                GROUP BY S.SELLERID, S.SHOPNAME
                ORDER BY G DESC
            ", [$from, $to]);
            fputcsv($fp, ['Penjual', 'Pesanan', 'Barang', 'Ongkir', 'Biaya platform', 'Bersih penjual'], ';');
            foreach ($rows as $r) {
                fputcsv($fp, [$r->SHOPNAME, (int) $r->N, (string) $r->G, (string) $r->SH, (string) $r->PF, (string) $r->OWN], ';');
            }
        } elseif ($tab === 'PLATFORM') {
            $rows = DB::select("
                SELECT REFTYPE, COUNT(*) AS N, SUM(PLATFORMFEE) AS PF, SUM(SERVICEFEE) AS SV, SUM(TOTALPAID) AS T
                FROM T_PAYMENT
                WHERE STATUS = 'BERHASIL' AND PAIDAT >= ? AND PAIDAT <= ?
                GROUP BY REFTYPE
            ", [$from, $to]);
            fputcsv($fp, ['Jenis', 'Transaksi', 'Biaya platform', 'Biaya layanan', 'Total'], ';');
            foreach ($rows as $r) {
                fputcsv($fp, [$r->REFTYPE, (int) $r->N, (string) $r->PF, (string) $r->SV, (string) $r->T], ';');
            }
        } else {
            $rows = DB::select("
                SELECT E.TITLE, E.ORGNAME, COUNT(*) AS N, SUM(P.SUBTOTAL) AS G, SUM(P.DISCOUNT) AS D,
                       SUM(P.PLATFORMFEE) AS PF, SUM(P.OWNERAMT) AS OWN
                FROM T_PAYMENT P
                JOIN T_EVENT E ON E.EVENTID = P.EVENTID
                WHERE P.REFTYPE = 'TIKET' AND P.STATUS = 'BERHASIL' AND P.PAIDAT >= ? AND P.PAIDAT <= ?
                GROUP BY E.EVENTID, E.TITLE, E.ORGNAME
                ORDER BY G DESC
            ", [$from, $to]);
            fputcsv($fp, ['Event', 'Penyelenggara', 'Terjual', 'Kotor', 'Diskon', 'Biaya platform', 'Bersih penyelenggara'], ';');
            foreach ($rows as $r) {
                fputcsv($fp, [$r->TITLE, $r->ORGNAME, (int) $r->N, (string) $r->G, (string) $r->D, (string) $r->PF, (string) $r->OWN], ';');
            }
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'msales', 'page' => 'Sales Report',
            'table' => 'T_PAYMENT', 'dataId' => $tab,
            'summary' => 'Export CSV ' . $tab,
            'before' => [], 'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'sales_' . strtolower($tab) . '_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
        ]);
    }
}
