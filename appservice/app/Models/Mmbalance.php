<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Saldo penjual (Finance). Dibaca dari T_LEDGER (SUM per bucket); tanpa kolom
// saldo, tanpa koreksi manual. SEGMENT: home/mbalance/mbalance.
// Menu CPMENU MCONTROL = mbalance.
class Mmbalance extends Model
{
    use ColumnFilter;

    const MCODE = 70030002;
    const EXPORT_LIMIT = 10000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    // Alias A = T_SELLER (syarat trait ColumnFilter).
    private static function sortMap(): array
    {
        return [
            'SHOPNAME' => 'A.SHOPNAME',
            'SELLERCODE' => 'A.SELLERCODE',
        ];
    }

    // Tolak bila group user tidak punya akses menu Seller Balance.
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

    // Saldo satu penjual dari buku besar + total ditarik + dalam penarikan.
    // Withdrawal (H5): guard OBJECT_ID sampai tabelnya ada.
    public static function sellerBalance(int $sellerId): array
    {
        $bal = LedgerService::balance($sellerId);
        $wd = DB::selectOne(
            "SELECT 1 AS X FROM sys.objects WHERE object_id = OBJECT_ID('dbo.T_WITHDRAWAL') AND type = 'U'"
        );
        $inflight = 0;
        $withdrawn = 0;
        if ($wd) {
            $row = DB::selectOne("
                SELECT ISNULL(SUM(CASE WHEN STATUS IN ('DIAJUKAN', 'DIPROSES') THEN AMOUNT ELSE 0 END), 0) AS F,
                       ISNULL(SUM(CASE WHEN STATUS = 'BERHASIL' THEN AMOUNT ELSE 0 END), 0) AS D
                FROM T_WITHDRAWAL WHERE SELLERID = ?
            ", [$sellerId]);
            if ($row) {
                $inflight = Money::r($row->F);
                $withdrawn = Money::r($row->D);
            }
        }
        return [
            'PENDING' => $bal['PENDING'], 'AVAILABLE' => $bal['AVAILABLE'],
            'INFLIGHT' => $inflight, 'WITHDRAWN' => $withdrawn,
        ];
    }

    // Ringkasan semua penjual: total tertahan/tersedia/ditarik.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $t = DB::selectOne("
            SELECT ISNULL(SUM(CASE WHEN BUCKET = 'PENDING' THEN AMOUNT ELSE 0 END), 0) AS P,
                   ISNULL(SUM(CASE WHEN BUCKET = 'AVAILABLE' THEN AMOUNT ELSE 0 END), 0) AS A
            FROM T_LEDGER WHERE ACCOUNT = 'SELLER'
        ");
        $out = [
            'PENDING' => $t ? (string) $t->P : '0',
            'AVAILABLE' => $t ? (string) $t->A : '0',
            'WITHDRAWN' => '0',
        ];
        $wd = DB::selectOne(
            "SELECT 1 AS X FROM sys.objects WHERE object_id = OBJECT_ID('dbo.T_WITHDRAWAL') AND type = 'U'"
        );
        if ($wd) {
            $w = DB::selectOne("SELECT ISNULL(SUM(AMOUNT), 0) AS D FROM T_WITHDRAWAL WHERE STATUS = 'BERHASIL'");
            $out['WITHDRAWN'] = $w ? (string) $w->D : '0';
        }

        return json_encode(['success' => true, 'Rows' => [$out]]);
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

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.ISACTIVE = 'YES'";
        $args = [];
        if ($q !== '') {
            $where .= " AND (A.SHOPNAME LIKE ? OR A.SELLERCODE LIKE ?)";
            $like = '%' . $q . '%';
            array_push($args, $like, $like);
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_SELLER A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default nama toko.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.SHOPNAME';

        $sql = "
            SELECT A.SELLERID, A.SELLERCODE, A.SHOPNAME, A.OWNERNAME, A.ISACTIVE
            FROM T_SELLER A
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
            $bal = self::sellerBalance((int) $r->SELLERID);
            $arr = array_merge($arr, $bal);
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Mutasi satu penjual (filter jenis + rentang, paging).
    public static function read_ledger($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sellerId = (int) ($vdata['SELLERID'] ?? $param['sellerid'] ?? 0);
        if ($sellerId <= 0) {
            return json_encode(['success' => 'false', 'message' => 'SELLERID tidak ditemukan.']);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $etype = strtoupper(trim((string) ($param['entrytype'] ?? '')));
        $fRaw = trim((string) ($param['datefrom'] ?? ''));
        $tRaw = trim((string) ($param['dateto'] ?? ''));
        $fTs = $fRaw !== '' ? strtotime($fRaw) : null;
        $tTs = $tRaw !== '' ? strtotime($tRaw) : null;
        if (($fRaw !== '' && $fTs === false) || ($tRaw !== '' && $tTs === false)) {
            return json_encode(['success' => 'false', 'message' => 'Rentang tanggal tidak valid.']);
        }

        $where = " WHERE SELLERID = ?";
        $args = [$sellerId];
        $allowed = ['SALE', 'RELEASE', 'REVERSAL', 'REFUND', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL'];
        if ($etype !== '' && in_array($etype, $allowed, true)) {
            $where .= " AND ENTRYTYPE = ?";
            $args[] = $etype;
        }
        if ($fTs !== null) {
            $where .= " AND LEDGERTIME >= ?";
            $args[] = date('Y-m-d 00:00:00', $fTs);
        }
        if ($tTs !== null) {
            $where .= " AND LEDGERTIME <= ?";
            $args[] = date('Y-m-d 23:59:59', $tTs);
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_LEDGER" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "
            SELECT LEDGERID, LEDGERTIME, BUCKET, ENTRYTYPE, AMOUNT,
                   REFTYPE, REFID, NOTE, ACTOR
            FROM T_LEDGER
            " . $where . "
            ORDER BY LEDGERTIME DESC, LEDGERID DESC
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }
        $rows = DB::select($sql, $args);

        $bal = self::sellerBalance($sellerId);
        return json_encode([
            'success' => true, 'Rows' => $rows, 'TotalRows' => $total,
            'Balance' => $bal,
        ]);
    }

    // Rekonsiliasi: silang buku besar vs status sumber (lihat, tanpa ubah).
    // Sehat = violations kosong. $sellerId 0 = semua penjual.
    public static function read_reconcile($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sellerId = (int) ($vdata['SELLERID'] ?? $param['sellerid'] ?? 0);

        $sellers = $sellerId > 0
            ? DB::select("SELECT SELLERID, SHOPNAME FROM T_SELLER WHERE SELLERID = ?", [$sellerId])
            : DB::select("SELECT SELLERID, SHOPNAME FROM T_SELLER WHERE ISACTIVE = 'YES' ORDER BY SHOPNAME");
        if ($sellerId > 0 && empty($sellers)) {
            return json_encode(['success' => 'false', 'message' => 'Data penjual tidak ditemukan.']);
        }

        $out = [];
        foreach ($sellers as $s) {
            $sid = (int) $s->SELLERID;
            $viol = self::reconcileSeller($sid);
            $bal = self::sellerBalance($sid);
            $out[] = [
                'SELLERID' => $sid, 'SHOPNAME' => (string) $s->SHOPNAME,
                'PENDING' => $bal['PENDING'], 'AVAILABLE' => $bal['AVAILABLE'],
                'DIFF' => count($viol) === 0 ? 0 : 1,
                'VIOLATIONS' => $viol,
            ];
        }

        return json_encode(['success' => true, 'Rows' => $out]);
    }

    // Aturan silang per penjual. Return list pelanggaran (kosong = sehat).
    private static function reconcileSeller(int $sellerId): array
    {
        $viol = [];

        // 1) Tiap pembayaran MERCH BERHASIL harus punya tepat 1 SALE dengan
        // nominal = bagian pemilik + ongkir.
        $pays = DB::select("
            SELECT PAYMENTID, PAYNO, REFID, OWNERAMT, SHIPPING
            FROM T_PAYMENT
            WHERE REFTYPE = 'MERCH' AND SELLERID = ? AND STATUS = 'BERHASIL'
        ", [$sellerId]);
        foreach ($pays as $p) {
            $expect = Money::r($p->OWNERAMT) + Money::r($p->SHIPPING);
            $sales = DB::select("
                SELECT AMOUNT FROM T_LEDGER
                WHERE ENTRYTYPE = 'SALE' AND REFTYPE = 'ORDER'
                  AND REFID = ? AND SELLERID = ?
            ", [(int) $p->REFID, $sellerId]);
            if (count($sales) !== 1) {
                $viol[] = 'Bayar ' . $p->PAYNO . ': entri SALE ' . count($sales) . ' (harusnya 1).';
            } elseif (Money::r($sales[0]->AMOUNT) !== $expect) {
                $viol[] = 'Bayar ' . $p->PAYNO . ': SALE ' . Money::rp(Money::r($sales[0]->AMOUNT)) . ' beda hitungan ' . Money::rp($expect) . '.';
            }
        }

        // 2) Tiap pesanan SELESAI+LUNAS harus sudah RELEASE (PENDING net 0
        // untuk order itu); tiap DIBATALKAN/DIKEMBALIKAN dari LUNAS harus
        // net PENDING 0 (REVERSAL/REFUND menutup SALE).
        $orders = DB::select("
            SELECT ORDERID, ORDERNO, ORDERSTATUS, PAYSTATUS FROM T_MERCH_ORDER
            WHERE SELLERID = ?
        ", [$sellerId]);
        foreach ($orders as $o) {
            $st = strtoupper(trim((string) $o->ORDERSTATUS));
            $paid = strtoupper(trim((string) $o->PAYSTATUS)) === 'LUNAS'
                || strtoupper(trim((string) $o->PAYSTATUS)) === 'REFUND';
            if (!$paid) {
                continue;
            }
            $netP = LedgerService::bucketNet('ORDER', (int) $o->ORDERID, 'PENDING');
            if ($st === 'SELESAI' && $netP !== 0) {
                $viol[] = 'Order ' . $o->ORDERNO . ': SELESAI tetapi PENDING net ' . Money::rp($netP) . '.';
            }
            if (($st === 'DIBATALKAN' || $st === 'DIKEMBALIKAN') && $netP !== 0) {
                $viol[] = 'Order ' . $o->ORDERNO . ': ' . strtolower($st) . ' tetapi PENDING net ' . Money::rp($netP) . '.';
            }
        }

        // 3) Tiap refund BATAL_MERCH harus punya leg REFUND di ledger (kecuali
        // net bucket sudah 0 sebelum refund dicatat = tak perlu leg).
        $refs = DB::select("
            SELECT R.REFUNDID, R.AMOUNT, R.REFID FROM T_PAYMENT_REFUND R
            JOIN T_PAYMENT P ON P.PAYMENTID = R.PAYMENTID
            WHERE P.REFTYPE = 'MERCH' AND P.SELLERID = ? AND R.REFUNDTYPE = 'BATAL_MERCH'
        ", [$sellerId]);
        foreach ($refs as $rf) {
            $n = DB::selectOne("
                SELECT COUNT(*) AS C FROM T_LEDGER
                WHERE ENTRYTYPE = 'REFUND' AND REFTYPE = 'ORDER'
                  AND REFID = ? AND SELLERID = ?
            ", [(int) $rf->REFID, $sellerId]);
            if (!$n || (int) $n->C === 0) {
                // Wajar bila net bucket sudah 0 (mis. REVERSAL menutup dulu).
                $viol[] = 'Refund #' . $rf->REFUNDID . ': tanpa leg REFUND di ledger (cek manual).';
            }
        }

        return $viol;
    }

    // Export CSV mutasi penjual (dibatasi, dicatat di Audit Log).
    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sellerId = (int) ($vdata['SELLERID'] ?? $param['sellerid'] ?? 0);
        if ($sellerId <= 0) {
            return json_encode(['success' => 'false', 'message' => 'SELLERID tidak ditemukan.']);
        }
        $etype = strtoupper(trim((string) ($param['entrytype'] ?? '')));
        $allowed = ['SALE', 'RELEASE', 'REVERSAL', 'REFUND', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL'];

        $where = " WHERE SELLERID = ?";
        $args = [$sellerId];
        if ($etype !== '' && in_array($etype, $allowed, true)) {
            $where .= " AND ENTRYTYPE = ?";
            $args[] = $etype;
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_LEDGER" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT LEDGERTIME, BUCKET, ENTRYTYPE, AMOUNT, REFTYPE, REFID, NOTE, ACTOR
            FROM T_LEDGER
            " . $where . "
            ORDER BY LEDGERTIME DESC, LEDGERID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Waktu', 'Bucket', 'Jenis', 'Jumlah', 'Ref', 'ID Ref', 'Keterangan', 'Pelaku'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->LEDGERTIME, $r->BUCKET, $r->ENTRYTYPE, (string) $r->AMOUNT,
                $r->REFTYPE, $r->REFID, $r->NOTE, $r->ACTOR,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'mbalance', 'page' => 'Seller Balance',
            'table' => 'T_LEDGER', 'dataId' => (string) $sellerId,
            'summary' => 'Export CSV mutasi seller #' . $sellerId . ' ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [], 'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'ledger_' . $sellerId . '_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
