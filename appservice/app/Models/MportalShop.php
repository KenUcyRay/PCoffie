<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
use Tymon\JWTAuth\Facades\JWTAuth;

/**
 * MportalShop - bagian merchandise, pembayaran, invoice, dan profil pembeli.
 * Dipisah dari Mportal supaya file utama tetap ringkas.
 *
 * Semua kemiripan data tetap milik pembeli yang login (dari token), dan
 *-success logika yang sudah ada dipakai ulang:
 *   - Mmorder::genOrderNo / addHistory  : penomoran & riwayat status pesanan
 *   - MerchConfig                       : batas komplain, kurir
 *   - T_SHIPPING_RATE                   : ongkos kirim tarif tetap per kurir
 *   - Mmmypurchase::cancelCore          : pembatalan pesanan merch
 *   - PaymentService                    : (dipakai operator dari Console)
 */
class MportalShop extends Model
{
    const BUYER_GROUP = 'GROUP_USER';

    private static function ok(array $extra = [], string $msg = 'OK'): array
    {
        return array_merge(['success' => 'true', 'message' => $msg], $extra);
    }

    private static function fail(string $msg): array
    {
        return ['success' => 'false', 'message' => $msg];
    }

    private static function failJson(string $msg, int $code = 200): array
    {
        return ['__http' => $code, 'success' => 'false', 'message' => $msg];
    }

    private static function who(): array
    {
        try {
            $p = JWTAuth::parseToken()->getPayload()->toArray();
            $login = trim((string) ($p['sub'] ?? ''));
            if ($login === '') {
                return [];
            }
        } catch (\Throwable $e) {
            return [];
        }
        $u = DB::selectOne("SELECT USERID, USERLOGIN, USERNAME, USEREMAIL, USERGROUP FROM CPUSER WHERE USERLOGIN = ?", [$login]);
        return $u ? (array) $u : [];
    }

    private static function img(string $stored): string
    {
        $p = trim((string) $stored);
        return $p === '' ? '' : $p;
    }

    private static function audit(string $action, string $actor, array $meta = []): void
    {
        try {
            AuditTrail::log([
                'userlogin' => $actor,
                'action' => 'LAINNYA',
                'mcontrol' => 'portal',
                'page' => 'Portal Pembeli',
                'table' => $meta['table'] ?? '',
                'dataId' => (string) ($meta['dataId'] ?? ''),
                'summary' => $action . (isset($meta['dataId']) ? ' ' . $meta['dataId'] : ''),
            ]);
        } catch (\Throwable $e) {
        }
    }

    private static function cartKey(array $u): string
    {
        return 'PORTALCART::' . strtoupper((string) $u['USERLOGIN']);
    }

    // =====================================================================
    //  KERANJANG  (dikelompokkan per penjual, disimpan per akun di server)
    // =====================================================================

    private static function cartRead(array $u): array
    {
        $raw = @file_get_contents(storage_path('portal/' . md5(self::cartKey($u)) . '.json'));
        $arr = $raw ? json_decode($raw, true) : [];
        return is_array($arr) ? $arr : [];
    }

    private static function cartWrite(array $u, array $items): void
    {
        $dir = storage_path('portal');
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        @file_put_contents($dir . '/' . md5(self::cartKey($u)) . '.json', json_encode(array_values($items)));
    }

    public static function cart($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $action = strtolower(trim((string) ($param['action'] ?? 'list')));
        $items = self::cartRead($u);

        if ($action === 'add') {
            $pid = (int) ($param['productid'] ?? 0);
            $qty = max(1, (int) ($param['qty'] ?? 1));
            $p = DB::selectOne("SELECT PRODUCTID, NAME, PRICE, STOCK, SELLERID FROM T_PRODUCT WHERE PRODUCTID = ? AND ISNULL(ISACTIVE,'YES') <> 'NO'", [$pid]);
            if (!$p) {
                return self::fail('Produk tidak tersedia.');
            }
            $found = null;
            foreach ($items as $i => $it) {
                if ((int) $it['productid'] === $pid) {
                    $found = $i;
                }
            }
            $newQty = ($found !== null ? (int) $items[$found]['qty'] : 0) + $qty;
            if ((int) $p->STOCK <= 0) {
                return self::fail('Stok produk habis.');
            }
            if ($newQty > (int) $p->STOCK) {
                return self::fail('Stok tidak cukup. Tersisa ' . (int) $p->STOCK . '.');
            }
            $row = [
                'productid' => $pid,
                'name' => (string) $p->NAME,
                'price' => Money::r($p->PRICE),
                'sellerid' => (int) ($p->SELLERID ?? 0),
                'qty' => $newQty,
            ];
            if ($found !== null) {
                $items[$found] = $row;
            } else {
                $items[] = $row;
            }
            self::cartWrite($u, $items);
        } elseif ($action === 'update') {
            $pid = (int) ($param['productid'] ?? 0);
            $qty = max(0, (int) ($param['qty'] ?? 0));
            foreach ($items as $i => $it) {
                if ((int) $it['productid'] === $pid) {
                    if ($qty === 0) {
                        unset($items[$i]);
                    } else {
                        $p = DB::selectOne("SELECT STOCK FROM T_PRODUCT WHERE PRODUCTID = ?", [$pid]);
                        if ($p && $qty > (int) $p->STOCK) {
                            return self::fail('Stok tidak cukup. Tersisa ' . (int) $p->STOCK . '.');
                        }
                        $items[$i]['qty'] = $qty;
                    }
                }
            }
            $items = array_values($items);
            self::cartWrite($u, $items);
        } elseif ($action === 'remove') {
            $pid = (int) ($param['productid'] ?? 0);
            $items = array_values(array_filter($items, function ($it) use ($pid) {
                return (int) $it['productid'] !== $pid;
            }));
            self::cartWrite($u, $items);
        } elseif ($action === 'clear') {
            $items = [];
            self::cartWrite($u, $items);
        }

        return self::ok(['cart' => self::cartView($u)]);
    }

    /** Kelompokkan keranjang per SELLERID: satu pesanan = satu penjual. */
    private static function cartView(array $u): array
    {
        $items = self::cartRead($u);
        $groups = [];
        foreach ($items as $it) {
            $sid = (int) ($it['sellerid'] ?? 0);
            if (!isset($groups[$sid])) {
                $s = $sid > 0 ? DB::selectOne("SELECT SHOPNAME FROM T_SELLER WHERE SELLERID = ?", [$sid]) : null;
                $groups[$sid] = [
                    'sellerid' => $sid,
                    'sellername' => (string) ($s->SHOPNAME ?? 'Penjual'),
                    'items' => [],
                    'subtotal' => 0,
                ];
            }
            $line = [
                'productid' => (int) $it['productid'],
                'name' => (string) $it['name'],
                'price' => (int) $it['price'],
                'qty' => (int) $it['qty'],
                'amount' => (int) $it['price'] * (int) $it['qty'],
            ];
            $groups[$sid]['items'][] = $line;
            $groups[$sid]['subtotal'] += $line['amount'];
        }
        $out = [];
        foreach ($groups as $g) {
            $out[] = $g;
        }
        return $out;
    }

    /** Kurir + tarif tetap dari T_SHIPPING_RATE. */
    public static function couriers($param)
    {
        $rows = DB::select("SELECT COURIER, COST, ESTIMATEHOURS, NOTE FROM T_SHIPPING_RATE WHERE ISNULL(ISACTIVE,'YES') <> 'NO' ORDER BY COST, COURIER");
        return self::ok([
            'rows' => array_map(function ($r) {
                return [
                    'COURIER' => (string) $r->COURIER,
                    'COST' => Money::r($r->COST),
                    'ESTIMATEHOURS' => (int) ($r->ESTIMATEHOURS ?? 0),
                    'NOTE' => (string) ($r->NOTE ?? ''),
                ];
            }, $rows ?: []),
        ]);
    }

    /** Checkout satu keranjang (harus satu penjual). */
    public static function order_create($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $sellerid = (int) ($param['sellerid'] ?? 0);
        $courier = trim((string) ($param['courier'] ?? ''));
        $address = trim((string) ($param['address'] ?? ''));
        $city = trim((string) ($param['city'] ?? ''));
        $province = trim((string) ($param['province'] ?? ''));
        $postal = trim((string) ($param['postalcode'] ?? ''));
        $phone = trim((string) ($param['phone'] ?? '')) ?: (string) $u['USEREMAIL'];
        $name = trim((string) ($param['name'] ?? '')) ?: (string) $u['USERNAME'];

        if ($address === '') {
            return self::fail('Alamat pengiriman wajib diisi.');
        }
        if ($courier === '') {
            return self::fail('Kurir wajib dipilih.');
        }
        $ship = DB::selectOne("SELECT * FROM T_SHIPPING_RATE WHERE COURIER = ? AND ISNULL(ISACTIVE,'YES') <> 'NO'", [$courier]);
        if (!$ship) {
            return self::fail('Kurir tidak tersedia.');
        }

        $group = null;
        foreach (self::cartView($u) as $g) {
            if ((int) $g['sellerid'] === $sellerid) {
                $group = $g;
            }
        }
        if (!$group || !$group['items']) {
            return self::fail('Keranjang untuk penjual ini kosong.');
        }

        $shipping = Money::r($ship->COST);
        $total = (int) $group['subtotal'] + $shipping;

        try {
            return DB::transaction(function () use ($u, $group, $sellerid, $name, $phone, $address, $city, $province, $postal, $courier, $shipping, $total) {
                // Kunci baris produk + cek stok (UPDLOCK) supaya tidak oversell.
                foreach ($group['items'] as $it) {
                    $p = DB::selectOne("SELECT PRODUCTID, NAME, PRICE, STOCK FROM T_PRODUCT WITH (UPDLOCK, ROWLOCK) WHERE PRODUCTID = ?", [(int) $it['productid']]);
                    if (!$p) {
                        throw new \Exception('Produk tidak ditemukan.');
                    }
                    if ((int) $p->STOCK < (int) $it['qty']) {
                        throw new \Exception('Stok ' . $p->NAME . ' tidak cukup (tersisa ' . (int) $p->STOCK . ').');
                    }
                    $affected = DB::update("UPDATE T_PRODUCT SET STOCK = STOCK - ? WHERE PRODUCTID = ?", [(int) $it['qty'], (int) $it['productid']]);
                    if ($affected === 0) {
                        throw new \Exception('Stok berubah, silakan ulangi.');
                    }
                }

                $payHours = MerchConfig::payDeadlineHours();
                $deadline = date('Y-m-d H:i:s', time() + $payHours * 3600);
                $orderno = Mmorder::genOrderNo();
                DB::insert("
                    INSERT INTO T_MERCH_ORDER
                        (ORDERNO, SELLERID, BUYERNAME, BUYERPHONE, BUYEREMAIL, ADDRESS, CITY, PROVINCE, POSTALCODE,
                         COURIER, SUBTOTAL, SHIPPING, TOTAL, ORDERSTATUS, PAYSTATUS, PAYDEADLINE,
                         SYSCREATEUSER, SYSCREATEDATE)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DIPESAN', 'BELUM_BAYAR', ?, ?, GETDATE())
                ", [
                    $orderno, $sellerid, $name, $phone, (string) $u['USEREMAIL'], $address, $city, $province, $postal,
                    $courier, (int) $group['subtotal'], $shipping, $total, $deadline, (string) $u['USERLOGIN'],
                ]);
                $oid = (int) DB::getPdo()->lastInsertId();
                Mmorder::addHistory($oid, null, 'DIPESAN', 'Pesanan dibuat dari portal', (string) $u['USERLOGIN']);

                foreach ($group['items'] as $it) {
                    DB::insert("
                        INSERT INTO T_MERCH_ORDER_ITEM (ORDERID, PRODUCTID, PRODUCTNAME, UNITPRICE, QTY, SUBTOTAL)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ", [$oid, (int) $it['productid'], (string) $it['name'], (int) $it['price'], (int) $it['qty'], (int) $it['amount']]);
                }

                // Buang item keranjang milik penjual ini saja.
                $items = self::cartRead($u);
                $items = array_values(array_filter($items, function ($it) use ($sellerid) {
                    return (int) ($it['sellerid'] ?? 0) !== $sellerid;
                }));
                self::cartWrite($u, $items);

                self::audit('PORTAL_MERCH_ORDER', (string) $u['USERLOGIN'], ['table' => 'T_MERCH_ORDER', 'dataId' => $orderno]);
                return self::ok(['orderno' => $orderno, 'orderid' => $oid, 'total' => $total, 'paydeadline' => $deadline], 'Pesanan dibuat.');
            });
        } catch (\Exception $e) {
            return self::fail($e->getMessage());
        }
    }

    // =====================================================================
    //  MY PURCHASE
    // =====================================================================

    public static function purchase_list($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        Mmorder::applyLazy();
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $args = [(string) $u['USEREMAIL']];
        $where = 'BUYEREMAIL = ?';
        if ($status !== '') {
            $where .= ' AND ORDERSTATUS = ?';
            $args[] = $status;
        }
        $rows = DB::select("
            SELECT O.ORDERID, O.ORDERNO, O.ORDERSTATUS, O.PAYSTATUS, O.SUBTOTAL, O.SHIPPING, O.TOTAL,
                   O.COURIER, O.TRACKINGNO, O.SYSCREATEDATE, O.DONEAT, O.SHIPPEDAT, O.PAYDEADLINE,
                   S.SHOPNAME,
                   (SELECT COUNT(*) FROM T_MERCH_ORDER_ITEM I WHERE I.ORDERID = O.ORDERID) AS ITEMCOUNT
            FROM T_MERCH_ORDER O
            LEFT JOIN T_SELLER S ON S.SELLERID = O.SELLERID
            WHERE $where
            ORDER BY O.ORDERID DESC
        ", $args);
        return self::ok(['rows' => array_map(function ($r) {
            $r = (array) $r;
            return [
                'ORDERID' => (int) $r['ORDERID'],
                'ORDERNO' => (string) $r['ORDERNO'],
                'ORDERSTATUS' => (string) $r['ORDERSTATUS'],
                'PAYSTATUS' => (string) $r['PAYSTATUS'],
                'SELLERNAME' => (string) ($r['SELLERNAME'] ?? ''),
                'ITEMCOUNT' => (int) $r['ITEMCOUNT'],
                'SUBTOTAL' => Money::r($r['SUBTOTAL']),
                'SHIPPING' => Money::r($r['SHIPPING']),
                'TOTAL' => Money::r($r['TOTAL']),
                'COURIER' => (string) ($r['COURIER'] ?? ''),
                'TRACKINGNO' => (string) ($r['TRACKINGNO'] ?? ''),
                'CREATED' => (string) ($r['SYSCREATEDATE'] ?? ''),
                'PAYDEADLINE' => (string) ($r['PAYDEADLINE'] ?? ''),
            ];
        }, $rows ?: [])]);
    }

    public static function purchase_detail($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $id = (int) ($param['orderid'] ?? 0);
        $o = DB::selectOne("SELECT * FROM T_MERCH_ORDER WHERE ORDERID = ? AND BUYEREMAIL = ?", [$id, (string) $u['USEREMAIL']]);
        if (!$o) {
            return self::fail('Pesanan tidak ditemukan.');
        }
        $o = (array) $o;
        $items = DB::select("SELECT PRODUCTID, PRODUCTNAME, UNITPRICE, QTY, SUBTOTAL FROM T_MERCH_ORDER_ITEM WHERE ORDERID = ? ORDER BY ITEMID", [$id]);
        $hist = DB::select("SELECT OLDSTATUS, NEWSTATUS, NOTE, ACTOR, ACTTIME FROM T_MERCH_ORDER_HISTORY WHERE ORDERID = ? ORDER BY HISTORYID", [$id]);
        return self::ok([
            'order' => [
                'ORDERID' => (int) $o['ORDERID'],
                'ORDERNO' => (string) $o['ORDERNO'],
                'ORDERSTATUS' => (string) $o['ORDERSTATUS'],
                'PAYSTATUS' => (string) $o['PAYSTATUS'],
                'BUYERNAME' => (string) ($o['BUYERNAME'] ?? ''),
                'BUYERPHONE' => (string) ($o['BUYERPHONE'] ?? ''),
                'ADDRESS' => (string) ($o['ADDRESS'] ?? ''),
                'CITY' => (string) ($o['CITY'] ?? ''),
                'PROVINCE' => (string) ($o['PROVINCE'] ?? ''),
                'POSTALCODE' => (string) ($o['POSTALCODE'] ?? ''),
                'COURIER' => (string) ($o['COURIER'] ?? ''),
                'TRACKINGNO' => (string) ($o['TRACKINGNO'] ?? ''),
                'SUBTOTAL' => Money::r($o['SUBTOTAL']),
                'SHIPPING' => Money::r($o['SHIPPING']),
                'TOTAL' => Money::r($o['TOTAL']),
                'CREATED' => (string) ($o['SYSCREATEDATE'] ?? ''),
                'PAYDEADLINE' => (string) ($o['PAYDEADLINE'] ?? ''),
                'SHIPPEDAT' => (string) ($o['SHIPPEDAT'] ?? ''),
                'DONEAT' => (string) ($o['DONEAT'] ?? ''),
            ],
            'items' => array_map(function ($i) {
                $i = (array) $i;
                return [
                    'PRODUCTID' => (int) $i['PRODUCTID'],
                    'PRODUCTNAME' => (string) $i['PRODUCTNAME'],
                    'UNITPRICE' => Money::r($i['UNITPRICE']),
                    'QTY' => (int) $i['QTY'],
                    'SUBTOTAL' => Money::r($i['SUBTOTAL']),
                ];
            }, $items ?: []),
            'history' => array_map(function ($h) {
                $h = (array) $h;
                return [
                    'OLDSTATUS' => (string) ($h['OLDSTATUS'] ?? ''),
                    'NEWSTATUS' => (string) ($h['NEWSTATUS'] ?? ''),
                    'NOTE' => (string) ($h['NOTE'] ?? ''),
                    'ACTTIME' => (string) ($h['ACTTIME'] ?? ''),
                ];
            }, $hist ?: []),
        ]);
    }

    /** Batalkan pesanan (hanya sebelum diproses). Memakai cancelCore yang ada. */
    public static function purchase_cancel($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $id = (int) ($param['orderid'] ?? 0);
        $own = DB::selectOne("SELECT TOP 1 ORDERID FROM T_MERCH_ORDER WHERE ORDERID = ? AND BUYEREMAIL = ?", [$id, (string) $u['USEREMAIL']]);
        if (!$own) {
            return self::fail('Pesanan tidak ditemukan.');
        }
        $r = Mmmypurchase::cancelCore($id, 'Dibatalkan pembeli', (string) $u['USERLOGIN'], 'portal', 'My Purchase');
        $d = json_decode((string) $r, true);
        if (!is_array($d) || strtolower((string) ($d['success'] ?? '')) !== 'true') {
            return self::fail((string) ($d['message'] ?? 'Pembatalan gagal.'));
        }
        self::audit('PORTAL_MERCH_CANCEL', (string) $u['USERLOGIN'], ['table' => 'T_MERCH_ORDER', 'dataId' => (string) $id]);
        return self::ok([], 'Pesanan dibatalkan.');
    }

    /** Tandai diterima (hanya saat DIKIRIM). */
    public static function purchase_receive($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $id = (int) ($param['orderid'] ?? 0);
        $o = DB::selectOne("SELECT * FROM T_MERCH_ORDER WHERE ORDERID = ? AND BUYEREMAIL = ?", [$id, (string) $u['USEREMAIL']]);
        if (!$o) {
            return self::fail('Pesanan tidak ditemukan.');
        }
        if (strtoupper(trim((string) $o->ORDERSTATUS)) !== 'DIKIRIM') {
            return self::fail('Pesanan hanya bisa ditandai diterima setelah dikirim.');
        }
        Mmorder::addHistory($id, 'DIKIRIM', 'DITERIMA', 'Diterima pembeli', (string) $u['USERLOGIN']);
        DB::update("UPDATE T_MERCH_ORDER SET ORDERSTATUS = 'DITERIMA', SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE() WHERE ORDERID = ?", [(string) $u['USERLOGIN'], $id]);
        self::audit('PORTAL_MERCH_RECEIVE', (string) $u['USERLOGIN'], ['table' => 'T_MERCH_ORDER', 'dataId' => (string) $id]);
        return self::ok([], 'Terima kasih, pesanan ditandai diterima.');
    }

    /** Laporkan masalah (pakai batas hari MerchConfig). */
    public static function purchase_complaint($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $id = (int) ($param['orderid'] ?? 0);
        $reason = strtoupper(trim((string) ($param['reason'] ?? '')));
        $descr = trim((string) ($param['descr'] ?? ''));
        if (!in_array($reason, MerchConfig::COMPLAINT_REASONS, true)) {
            return self::fail('Alasan laporan tidak valid.');
        }
        $o = DB::selectOne("SELECT * FROM T_MERCH_ORDER WHERE ORDERID = ? AND BUYEREMAIL = ?", [$id, (string) $u['USEREMAIL']]);
        if (!$o) {
            return self::fail('Pesanan tidak ditemukan.');
        }
        $o = (array) $o;
        if (!empty($o['DONEAT']) && strtotime((string) $o['DONEAT']) < strtotime('-' . MerchConfig::complaintDays() . ' days')) {
            return self::fail('Laporan hanya bisa upto ' . MerchConfig::complaintDays() . ' hari setelah pesanan selesai.');
        }
        DB::insert("
            INSERT INTO T_MERCH_COMPLAINT (ORDERID, REASON, DESCR, STATUS, CREATETIME, CREATEBY)
            VALUES (?, ?, ?, 'DIAJUKAN', GETDATE(), ?)
        ", [$id, $reason, mb_substr($descr, 0, 500), (string) $u['USERLOGIN']]);
        self::audit('PORTAL_MERCH_COMPLAINT', (string) $u['USERLOGIN'], ['table' => 'T_MERCH_COMPLAINT', 'dataId' => (string) $id]);
        return self::ok([], 'Laporan terkirim.');
    }

    // =====================================================================
    //  PAYMENT HISTORY & INVOICE  (read-only)
    // =====================================================================

    public static function payment_list($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $rows = DB::select("
            SELECT PAYMENTID, PAYNO, REFTYPE, REFID, TOTALPAID, STATUS, PAIDAT, SOURCE, NOTE
            FROM T_PAYMENT
            WHERE REFTYPE = 'TIKET' AND REFID IN (SELECT ATTENDEEID FROM T_ATTENDEE WHERE EMAIL = ?)
              OR REFTYPE = 'MERCH' AND REFID IN (SELECT ORDERID FROM T_MERCH_ORDER WHERE BUYEREMAIL = ?)
            ORDER BY PAYMENTID DESC
        ", [(string) $u['USEREMAIL'], (string) $u['USEREMAIL']]);
        return self::ok(['rows' => array_map(function ($r) {
            $r = (array) $r;
            return [
                'PAYMENTID' => (int) $r['PAYMENTID'],
                'PAYNO' => (string) $r['PAYNO'],
                'REFTYPE' => (string) $r['REFTYPE'],
                'REFID' => (int) $r['REFID'],
                'TOTALPAID' => Money::r($r['TOTALPAID']),
                'STATUS' => (string) $r['STATUS'],
                'PAIDAT' => (string) ($r['PAIDAT'] ?? ''),
            ];
        }, $rows ?: [])]);
    }

    public static function invoice_list($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $rows = DB::select("
            SELECT I.INVOICEID, I.INVNO, I.PAYMENTID, I.ISSUEDATE, I.TOTAL, I.STATUS, I.RECIPIENT
            FROM T_INVOICE I
            WHERE I.PAYMENTID IN (
                SELECT PAYMENTID FROM T_PAYMENT
                WHERE REFTYPE = 'TIKET' AND REFID IN (SELECT ATTENDEEID FROM T_ATTENDEE WHERE EMAIL = ?)
                   OR REFTYPE = 'MERCH' AND REFID IN (SELECT ORDERID FROM T_MERCH_ORDER WHERE BUYEREMAIL = ?)
            )
            ORDER BY I.INVOICEID DESC
        ", [(string) $u['USEREMAIL'], (string) $u['USEREMAIL']]);
        return self::ok(['rows' => array_map(function ($r) {
            $r = (array) $r;
            return [
                'INVOICEID' => (int) $r['INVOICEID'],
                'INVNO' => (string) $r['INVNO'],
                'ISSUEDATE' => (string) ($r['ISSUEDATE'] ?? ''),
                'TOTAL' => Money::r($r['TOTAL']),
                'STATUS' => (string) $r['STATUS'],
                'RECIPIENT' => (string) ($r['RECIPIENT'] ?? ''),
            ];
        }, $rows ?: [])]);
    }

    // =====================================================================
    //  PROFIL
    // =====================================================================

    public static function profile($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $action = strtolower(trim((string) ($param['action'] ?? 'read')));
        $login = (string) $u['USERLOGIN'];

        if ($action === 'update') {
            $name = trim((string) ($param['username'] ?? ''));
            $email = mb_strtolower(trim((string) ($param['useremail'] ?? '')));
            $phone = trim((string) ($param['userphone'] ?? ''));
            if ($name === '') {
                return self::fail('Nama wajib diisi.');
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return self::fail('Format email tidak valid.');
            }
            $dup = DB::selectOne("SELECT TOP 1 USERID FROM CPUSER WHERE USEREMAIL = ? AND USERLOGIN <> ?", [$email, $login]);
            if ($dup) {
                return self::fail('Email sudah dipakai akun lain.');
            }
            DB::update("UPDATE CPUSER SET USERNAME = ?, USEREMAIL = ? WHERE USERLOGIN = ?", [$name, $email, $login]);
            self::audit('PORTAL_PROFILE_UPDATE', $login, ['table' => 'CPUSER', 'dataId' => $login]);
            return self::ok([], 'Profil diperbarui.');
        }

        if ($action === 'password') {
            $old = (string) ($param['oldpassword'] ?? '');
            $new = (string) ($param['newpassword'] ?? '');
            $row = DB::selectOne("SELECT USERPASSWORD FROM CPUSER WHERE USERLOGIN = ?", [$login]);
            if (!$row) {
                return self::fail('Akun tidak ditemukan.');
            }
            $plain = DB::selectOne("SELECT dbo.app_decrypt(USERPASSWORD) AS P FROM CPUSER WHERE USERLOGIN = ?", [$login]);
            if (!$plain || trim((string) ($plain->P ?? '')) !== $old) {
                return self::fail('Password lama salah.');
            }
            $perr = SecurityPolicy::checkPassword($new);
            if ($perr !== null && $perr !== '') {
                return self::fail($perr);
            }
            DB::update("UPDATE CPUSER SET USERPASSWORD = dbo.app_encrypt(?), SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE() WHERE USERLOGIN = ?", [$new, $login, $login]);
            self::audit('PORTAL_PASSWORD_CHANGE', $login, ['table' => 'CPUSER', 'dataId' => $login]);
            return self::ok([], 'Password berhasil diganti.');
        }

        // read: profil + sesi aktif + inbox
        $sessions = DB::select("
            SELECT SESSIONID, STATUS, LOGINTIME, EXPIRESAT, LASTACTIVE, USERIP, BROWSER, DEVICE
            FROM T_USER_SESSION WHERE USERLOGIN = ? AND STATUS = 'AKTIF' ORDER BY LOGINTIME DESC
        ", [$login]);
        $inbox = DB::select("
            SELECT TOP 20 M.MSGID, M.TITLE, M.BODY, M.PRIORITY, M.SENTAT, M.STATUS, R.READSTATUS, R.READTIME
            FROM T_MESSAGE_RECIPIENT R
            JOIN T_MESSAGE M ON M.MSGID = R.MSGID
            WHERE R.USERLOGIN = ? OR R.USERID = ?
            ORDER BY M.SENTAT DESC
        ", [$login, (int) $u['USERID']]);

        return self::ok([
            'profile' => [
                'USERLOGIN' => $u['USERLOGIN'],
                'USERNAME' => $u['USERNAME'],
                'USEREMAIL' => $u['USEREMAIL'],
                'USERGROUP' => $u['USERGROUP'],
            ],
            'sessions' => array_map(function ($s) {
                $s = (array) $s;
                return [
                    'SESSIONID' => (string) ($s['SESSIONID'] ?? ''),
                    'STATUS' => (string) $s['STATUS'],
                    'LOGINTIME' => (string) ($s['LOGINTIME'] ?? ''),
                    'LASTACTIVE' => (string) ($s['LASTACTIVE'] ?? ''),
                    'EXPIRESAT' => (string) ($s['EXPIRESAT'] ?? ''),
                    'USERIP' => (string) ($s['USERIP'] ?? ''),
                    'BROWSER' => (string) ($s['BROWSER'] ?? ''),
                    'DEVICE' => (string) ($s['DEVICE'] ?? ''),
                ];
            }, $sessions ?: []),
            'inbox' => array_map(function ($m) {
                $m = (array) $m;
                return [
                    'MSGID' => (int) $m['MSGID'],
                    'TITLE' => (string) $m['TITLE'],
                    'BODY' => (string) ($m['BODY'] ?? ''),
                    'PRIORITY' => (string) ($m['PRIORITY'] ?? ''),
                    'SENTAT' => (string) ($m['SENTAT'] ?? ''),
                    'READSTATUS' => (string) ($m['READSTATUS'] ?? ''),
                ];
            }, $inbox ?: []),
        ]);
    }
}