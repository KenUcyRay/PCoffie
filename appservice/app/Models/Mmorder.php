<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Mesin pesanan merchandise bersama (dipakai My Purchase + Seller Order).
// Bukan endpoint langsung (tidak ada SEGMENT): Mmmypurchase dan Mmsellerorder
// mendelegasikan ke sini dengan mcode/mcontrol/page masing-masing.
// Semua tulis: transaksi + kunci stok + history + audit (PII disamarkan).
class Mmorder extends Model
{
    use ColumnFilter;

    // Kolom pesanan yang boleh di-sort (whitelist) => kolom SQL.
    private static function sortMap(): array
    {
        return [
            'ORDERID' => 'A.ORDERID',
            'ORDERNO' => 'A.ORDERNO',
            'TOTAL' => 'A.TOTAL',
            'ORDERSTATUS' => 'A.ORDERSTATUS',
            'SYSCREATEDATE' => 'A.SYSCREATEDATE',
        ];
    }

    // Nomor pesanan otomatis: MO-YYYYMMDD-XXXX (unik, retry bila tabrakan).
    public static function genOrderNo(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $no = 'MO-' . date('Ymd') . '-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $hit = DB::selectOne("SELECT 1 AS X FROM T_MERCH_ORDER WHERE ORDERNO = ?", [$no]);
            if (!$hit) {
                return $no;
            }
        }
        return 'MO-' . date('YmdHis') . '-' . bin2hex(random_bytes(2));
    }

    // Satu baris riwayat (dipanggil setiap perubahan status).
    public static function addHistory(int $orderid, ?string $old, string $new, ?string $note, string $actor): void
    {
        DB::insert("
            INSERT INTO T_MERCH_ORDER_HISTORY (ORDERID, OLDSTATUS, NEWSTATUS, NOTE, ACTOR, ACTTIME)
            VALUES (?, ?, ?, ?, ?, GETDATE())
        ", [
            $orderid, $old, $new,
            $note !== null ? mb_substr($note, 0, 200) : null,
            $actor !== '' ? mb_substr($actor, 0, 25) : null,
        ]);
    }

    // Kembalikan stok semua item satu pesanan (cancel/expire/return).
    private static function restoreStock(int $orderid): void
    {
        $items = DB::select("SELECT PRODUCTID, QTY FROM T_MERCH_ORDER_ITEM WHERE ORDERID = ?", [$orderid]);
        foreach ($items as $it) {
            DB::update("
                UPDATE T_PRODUCT SET STOCK = STOCK + ?,
                    SYSUPDATEDATE = GETDATE() WHERE PRODUCTID = ?
            ", [(int) $it->QTY, (int) $it->PRODUCTID]);
        }
    }

    // Proses otomatis (lazy, tanpa scheduler): bayar lewat waktu -> batal +
    // stok kembali; kirim lewat 2x batas -> batal + REFUND + stok kembali;
    // dikirim lewat batas auto -> SELESAI. Dipanggil di awal read.
    public static function applyLazy(): void
    {
        try {
            $payH = MerchConfig::payDeadlineHours();
            $shipD = MerchConfig::shipDeadlineDays();
            $doneD = MerchConfig::autoDoneDays();

            // 1) Belum bayar lewat batas -> DIBATALKAN + stok kembali.
            $rows = DB::select("
                SELECT ORDERID FROM T_MERCH_ORDER
                WHERE ORDERSTATUS = 'BARU' AND PAYSTATUS = 'BELUM_BAYAR'
                  AND PAYDEADLINE IS NOT NULL AND PAYDEADLINE <= GETDATE()
            ");
            foreach ($rows as $r) {
                self::restoreStock((int) $r->ORDERID);
                DB::update("
                    UPDATE T_MERCH_ORDER
                    SET ORDERSTATUS = 'DIBATALKAN', SYSUPDATEDATE = GETDATE()
                    WHERE ORDERID = ? AND ORDERSTATUS = 'BARU'
                ", [(int) $r->ORDERID]);
                try {
                    self::addHistory((int) $r->ORDERID, 'BARU', 'DIBATALKAN', 'Timeout pembayaran (otomatis).', 'SYSTEM');
                } catch (\Throwable $ignored) {
                    // abaikan
                }
            }

            // 2) Lewat 2x batas kirim tanpa dikirim -> DIBATALKAN + REFUND + stok.
            $rows = DB::select("
                SELECT ORDERID FROM T_MERCH_ORDER
                WHERE ORDERSTATUS = 'DIPROSES' AND PAYSTATUS = 'LUNAS'
                  AND PAIDAT IS NOT NULL
                  AND PAIDAT <= DATEADD(DAY, ?, GETDATE())
            ", [-2 * $shipD]);
            foreach ($rows as $r) {
                self::restoreStock((int) $r->ORDERID);
                DB::update("
                    UPDATE T_MERCH_ORDER
                    SET ORDERSTATUS = 'DIBATALKAN', PAYSTATUS = 'REFUND',
                        SYSUPDATEDATE = GETDATE()
                    WHERE ORDERID = ? AND ORDERSTATUS = 'DIPROSES'
                ", [(int) $r->ORDERID]);
                try {
                    self::addHistory((int) $r->ORDERID, 'DIPROSES', 'DIBATALKAN', 'Lewat 2x batas kirim (otomatis).', 'SYSTEM');
                } catch (\Throwable $ignored) {
                    // abaikan
                }
                // Finance: refund sisa + kembalikan dana tertahan (idempoten).
                try {
                    $pay = DB::selectOne("
                        SELECT PAYMENTID FROM T_PAYMENT
                        WHERE REFTYPE = 'MERCH' AND REFID = ? AND STATUS = 'BERHASIL'
                    ", [(int) $r->ORDERID]);
                    if ($pay) {
                        $left = PaymentService::remaining((int) $pay->PAYMENTID);
                        if ($left > 0) {
                            PaymentService::refund([
                                'PAYMENTID' => (int) $pay->PAYMENTID, 'AMOUNT' => $left,
                                'REFUNDTYPE' => 'BATAL_MERCH', 'REFID' => (int) $r->ORDERID,
                                'ACTOR' => 'SYSTEM',
                            ]);
                        }
                        PaymentService::reversePending((int) $r->ORDERID, 'SYSTEM', 'Batal otomatis.');
                    }
                } catch (\Throwable $ignored) {
                    // abaikan (diperbaiki saat disentuh manual)
                }
            }

            // 3) Dikirim lewat batas auto -> SELESAI.
            $rows = DB::select("
                SELECT ORDERID FROM T_MERCH_ORDER
                WHERE ORDERSTATUS = 'DIKIRIM' AND SHIPPEDAT IS NOT NULL
                  AND SHIPPEDAT <= DATEADD(DAY, ?, GETDATE())
            ", [-$doneD]);
            foreach ($rows as $r) {
                DB::update("
                    UPDATE T_MERCH_ORDER
                    SET ORDERSTATUS = 'SELESAI', DONEAT = GETDATE(),
                        SYSUPDATEDATE = GETDATE()
                    WHERE ORDERID = ? AND ORDERSTATUS = 'DIKIRIM'
                ", [(int) $r->ORDERID]);
                try {
                    self::addHistory((int) $r->ORDERID, 'DIKIRIM', 'SELESAI', 'Otomatis selesai (diterima).', 'SYSTEM');
                } catch (\Throwable $ignored) {
                    // abaikan
                }
                // Finance: lepas dana tertahan -> tersedia (idempoten).
                try {
                    PaymentService::releaseOrder((int) $r->ORDERID, 'SYSTEM');
                } catch (\Throwable $ignored) {
                    // abaikan (diperbaiki saat disentuh manual)
                }
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal proses otomatis pesanan.', [], $e);
        }
    }

    // true bila pesanan TERLAMBAT (DIPROSES+LUNAS lewat batas kirim).
    public static function isLate($row): bool
    {
        try {
            if (strtoupper(trim((string) ($row->ORDERSTATUS ?? ''))) !== 'DIPROSES') {
                return false;
            }
            if (strtoupper(trim((string) ($row->PAYSTATUS ?? ''))) !== 'LUNAS') {
                return false;
            }
            if (empty($row->PAIDAT)) {
                return false;
            }
            $dl = strtotime((string) $row->PAIDAT) + MerchConfig::shipDeadlineDays() * 86400;
            return time() > $dl;
        } catch (\Throwable $e) {
            return false;
        }
    }

    // Ambil satu pesanan (+penjual). Return row atau null.
    public static function findOrder(int $orderid)
    {
        return DB::selectOne("
            SELECT A.*, S.SHOPNAME
            FROM T_MERCH_ORDER A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
            WHERE A.ORDERID = ?
        ", [$orderid]);
    }

    // Audit standar (PII pembeli disamarkan). $extra digabung ke after.
    public static function audit(string $action, string $mcontrol, string $page, $order, array $before, array $after, string $by): void
    {
        [$mn, $mp, $ma] = MerchConfig::maskBuyer(
            (string) ($order->BUYERNAME ?? ''),
            (string) ($order->BUYERPHONE ?? ''),
            (string) ($order->ADDRESS ?? '')
        );
        $after['BUYERNAME'] = $mn;
        $after['BUYERPHONE'] = $mp;
        $after['ADDRESS'] = $ma;
        AuditTrail::log([
            'action' => $action, 'mcontrol' => $mcontrol, 'page' => $page,
            'table' => 'T_MERCH_ORDER', 'dataId' => (string) ($order->ORDERNO ?? $order->ORDERID),
            'summary' => 'ORDER ' . (string) ($order->ORDERNO ?? $order->ORDERID),
            'before' => $before, 'after' => $after,
            'userlogin' => $by,
        ]);
    }

    // Cek akses menu pemanggil (dipakai kedua wrapper).
    public static function checkAccess($param, int $mcode): ?string
    {
        $res = json_decode(Mhak_akses::menu_akses([
            'VUSERLOGIN' => $param['VUSERLOGIN'] ?? '',
            'vdata' => json_encode(['mcode' => $mcode]),
        ]), true) ?: [];
        if (strtolower(trim((string) ($res['success'] ?? 'false'))) !== 'true') {
            return (string) ($res['message'] ?? 'Anda tidak memiliki hak akses untuk membuka menu ini.');
        }
        return null;
    }

    // Daftar pesanan bersama. $urgency=true: default urut paling mendesak
    // (BARU, DIPROSES, DIKIRIM, sisanya) + flag LATE per baris.
    public static function readList($param, int $mcode, bool $urgency)
    {
        $denied = self::checkAccess($param, $mcode);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyLazy();

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? $param['orderstatus'] ?? '')));
        $pay = strtoupper(trim((string) ($param['paystatus'] ?? '')));
        $seller = trim((string) ($param['sellerid'] ?? ''));
        $courier = trim((string) ($param['courier'] ?? ''));
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));

        if ($dateFrom !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) {
            return json_encode(['success' => 'false', 'message' => 'Format tanggal harus YYYY-MM-DD.']);
        }
        if ($dateTo !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return json_encode(['success' => 'false', 'message' => 'Format tanggal harus YYYY-MM-DD.']);
        }
        if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) {
            return json_encode(['success' => 'false', 'message' => 'Tanggal mulai tidak boleh sesudah tanggal akhir.']);
        }

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.ORDERNO LIKE ? OR A.BUYERNAME LIKE ? OR A.TRACKINGNO LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like];
        }
        $statuses = ['BARU', 'DIPROSES', 'DIKIRIM', 'SELESAI', 'DIBATALKAN', 'DIKEMBALIKAN'];
        if ($status !== '' && in_array($status, $statuses, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.ORDERSTATUS = ?';
            $args[] = $status;
        }
        if ($pay !== '' && in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.PAYSTATUS = ?';
            $args[] = $pay;
        }
        if ($seller !== '' && filter_var($seller, FILTER_VALIDATE_INT) !== false) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.SELLERID = ?';
            $args[] = (int) $seller;
        }
        if ($courier !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.COURIER = ?';
            $args[] = $courier;
        }
        if ($dateFrom !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'CAST(A.SYSCREATEDATE AS DATE) >= ?';
            $args[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'CAST(A.SYSCREATEDATE AS DATE) <= ?';
            $args[] = $dateTo;
        }

        // Filter per kolom grid (DataTable) digabung.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        if ($fWhere !== '') {
            $where .= ($where === '' ? ' WHERE 1=1' : '') . $fWhere;
            $args = array_merge($args, $fArgs);
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_MERCH_ORDER A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $map = [
            'ORDERID' => 'A.ORDERID', 'ORDERNO' => 'A.ORDERNO', 'TOTAL' => 'A.TOTAL',
            'ORDERSTATUS' => 'A.ORDERSTATUS', 'SYSCREATEDATE' => 'A.SYSCREATEDATE',
        ];
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        if (isset($map[$sortKey])) {
            $order = $map[$sortKey] . ' ' . $dir;
        } elseif ($urgency) {
            // Paling mendesak dulu: BARU, DIPROSES, DIKIRIM, sisanya.
            $order = "CASE A.ORDERSTATUS WHEN 'BARU' THEN 0 WHEN 'DIPROSES' THEN 1 WHEN 'DIKIRIM' THEN 2 ELSE 3 END, A.ORDERID DESC";
        } else {
            $order = 'A.ORDERID DESC';
        }

        $sql = "
            SELECT A.ORDERID, A.ORDERNO, A.SELLERID, S.SHOPNAME, A.BUYERNAME,
                   A.COURIER, A.TRACKINGNO, A.TOTAL, A.ORDERSTATUS, A.PAYSTATUS,
                   A.PAIDAT, A.SHIPPEDAT, A.SYSCREATEDATE,
                   (SELECT COUNT(*) FROM T_MERCH_ORDER_ITEM I WHERE I.ORDERID = A.ORDERID) AS ITEMCOUNT
            FROM T_MERCH_ORDER A
            LEFT JOIN T_SELLER S ON S.SELLERID = A.SELLERID
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
            $arr['LATE'] = self::isLate($r) ? 'YES' : 'NO';
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Detail pesanan bersama: order + item + riwayat + keluhan.
    public static function readDetail($param, int $mcode)
    {
        $denied = self::checkAccess($param, $mcode);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyLazy();

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }

        $order = self::findOrder((int) $id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }

        $arr = (array) $order;
        $arr['LATE'] = self::isLate($order) ? 'YES' : 'NO';
        $arr['ITEMS'] = DB::select("
            SELECT I.ITEMID, I.PRODUCTID, I.PRODUCTNAME, I.UNITPRICE, I.QTY, I.SUBTOTAL
            FROM T_MERCH_ORDER_ITEM I WHERE I.ORDERID = ? ORDER BY I.ITEMID
        ", [(int) $id]);
        $arr['HISTORY'] = DB::select("
            SELECT OLDSTATUS, NEWSTATUS, NOTE, ACTOR, ACTTIME
            FROM T_MERCH_ORDER_HISTORY WHERE ORDERID = ? ORDER BY ACTTIME, HISTORYID
        ", [(int) $id]);
        $arr['COMPLAINTS'] = DB::select("
            SELECT COMPLAINTID, REASON, DESCR, STATUS, RESPONSE,
                   CREATETIME, CREATEBY, RESPONDTIME, RESPONDBY
            FROM T_MERCH_COMPLAINT WHERE ORDERID = ? ORDER BY CREATETIME DESC
        ", [(int) $id]);

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }
}
