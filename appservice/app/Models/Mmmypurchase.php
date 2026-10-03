<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Pesanan sisi pembeli (Merchandise Shop, module Merchandise).
// SEGMENT frontend: home/mmypurchase/mmypurchase. Menu CPMENU MCONTROL = mmypurchase.
//
// Mesin bersama di Mmorder (lazy/history/audit/stok). Di sini: baca, buat,
// batalkan, bayar, terima, keluhan.
class Mmmypurchase extends Model
{
    use ColumnFilter;

    const MCODE = 50010003;
    const PAGE = 'My Purchase';
    const MCONTROL = 'mmypurchase';

    // Tolak bila group user tidak punya akses menu My Purchase.
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

    public static function read_data($param)
    {
        // Daftar bersama (tanpa urut-mendesak). Akses = menu ini.
        return Mmorder::readList($param, self::MCODE, false);
    }

    // Ringkasan: jumlah per status + menunggu pembayaran.
    // Produk aktif satu penjual untuk form (tanpa butuh akses Product Data).
    public static function read_products($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sellerid = $vdata['SELLERID'] ?? ($param['sellerid'] ?? '');
        $q = trim((string) ($param['q'] ?? ''));

        if ($sellerid === '' || filter_var($sellerid, FILTER_VALIDATE_INT) === false) {
            return json_encode(['success' => 'false', 'message' => 'Penjual wajib dipilih.']);
        }

        [$rows, $total] = Mmproductdata::catalogList([
            'limit' => 100, 'offset' => 0, 'q' => $q,
            'sellerid' => (string) $sellerid, 'show_all' => 'YES',
        ]);
        if (is_string($rows) && strpos($rows, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($rows, 9)]);
        }

        // Hanya yang layak jual (aktif + penjual aktif); stok tampil apa adanya.
        $out = [];
        foreach ($rows as $r) {
            $arr = (array) $r;
            if (strtoupper(trim((string) ($arr['ISACTIVE'] ?? ''))) !== 'YES') {
                continue;
            }
            if (strtoupper(trim((string) ($arr['SELLERACTIVE'] ?? ''))) !== 'YES') {
                continue;
            }
            $out[] = $arr;
        }

        return json_encode(['success' => true, 'Rows' => $out, 'TotalRows' => count($out)]);
    }

    // Daftar penjual aktif untuk form (tanpa butuh akses Product Data).
    public static function read_sellers($param)
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

    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        Mmorder::applyLazy();

        $row = DB::selectOne("
            SELECT COUNT(*) AS TOTAL,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'BARU' THEN 1 ELSE 0 END), 0) AS BARU,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'DIPROSES' THEN 1 ELSE 0 END), 0) AS DIPROSES,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'DIKIRIM' THEN 1 ELSE 0 END), 0) AS DIKIRIM,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'SELESAI' THEN 1 ELSE 0 END), 0) AS SELESAI,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS IN ('BARU', 'DIPROSES') AND A.PAYSTATUS = 'BELUM_BAYAR' THEN 1 ELSE 0 END), 0) AS NUNGGU
            FROM T_MERCH_ORDER A
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'TOTAL' => $row ? (int) $row->TOTAL : 0,
            'BARU' => $row ? (int) $row->BARU : 0,
            'DIPROSES' => $row ? (int) $row->DIPROSES : 0,
            'DIKIRIM' => $row ? (int) $row->DIKIRIM : 0,
            'SELESAI' => $row ? (int) $row->SELESAI : 0,
            'NUNGGU' => $row ? (int) $row->NUNGGU : 0,
        ]]]);
    }

    public static function read_detail($param)
    {
        return Mmorder::readDetail($param, self::MCODE);
    }

    // Buat pesanan: semua produk satu penjual aktif, stok cukup (kunci),
    // total dihitung backend, stok berkurang dalam SATU transaksi.
    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $by = $param['VUSERLOGIN'] ?? '';

        $sellerid = $vdata['SELLERID'] ?? null;
        $buyer = trim((string) ($vdata['BUYERNAME'] ?? ''));
        $phone = trim((string) ($vdata['BUYERPHONE'] ?? ''));
        $email = trim((string) ($vdata['BUYEREMAIL'] ?? ''));
        $address = trim((string) ($vdata['ADDRESS'] ?? ''));
        $courier = trim((string) ($vdata['COURIER'] ?? ''));
        $shipRaw = trim((string) ($vdata['SHIPPING'] ?? ''));
        $items = $vdata['ITEMS'] ?? [];
        $idem = mb_substr(trim((string) ($vdata['IDEMPOTENCYKEY'] ?? '')), 0, 64);

        if (empty($sellerid)) {
            return json_encode(['success' => 'false', 'message' => 'Penjual wajib dipilih.']);
        }
        if ($buyer === '') {
            return json_encode(['success' => 'false', 'message' => 'Nama pembeli wajib diisi.']);
        }
        if (mb_strlen($buyer) > 100) {
            return json_encode(['success' => 'false', 'message' => 'Nama pembeli maksimal 100 karakter.']);
        }
        if ($phone !== '' && !preg_match('/^[0-9+\-\s]+$/', $phone)) {
            return json_encode(['success' => 'false', 'message' => 'Telepon hanya boleh angka, plus, spasi, dan strip.']);
        }
        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return json_encode(['success' => 'false', 'message' => 'Format email tidak valid.']);
        }
        if ($address === '') {
            return json_encode(['success' => 'false', 'message' => 'Alamat pengiriman wajib diisi.']);
        }
        if (mb_strlen($address) > 500) {
            return json_encode(['success' => 'false', 'message' => 'Alamat maksimal 500 karakter.']);
        }
        if (!in_array($courier, MerchConfig::COURIERS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Kurir harus salah satu: ' . implode(', ', MerchConfig::COURIERS) . '.']);
        }
        if ($shipRaw === '' || !is_numeric($shipRaw) || (float) $shipRaw < 0) {
            return json_encode(['success' => 'false', 'message' => 'Ongkos kirim wajib diisi dan tidak negatif.']);
        }
        if (!is_array($items) || count($items) === 0) {
            return json_encode(['success' => 'false', 'message' => 'Minimal satu item produk.']);
        }

        // Klik ganda: kunci yang sama -> kembalikan pesanan yang sudah ada.
        if ($idem !== '') {
            $dup = DB::selectOne("SELECT ORDERID, ORDERNO FROM T_MERCH_ORDER WHERE IDEMPOTENCYKEY = ?", [$idem]);
            if ($dup) {
                return json_encode([
                    'success' => 'true',
                    'message' => 'Pesanan sudah dibuat sebelumnya (' . $dup->ORDERNO . ').',
                    'Rows' => [['ORDERID' => $dup->ORDERID, 'ORDERNO' => $dup->ORDERNO]],
                ]);
            }
        }

        $seller = DB::selectOne("SELECT SELLERID, SHOPNAME, ISACTIVE FROM T_SELLER WHERE SELLERID = ?", [$sellerid]);
        if (!$seller) {
            return json_encode(['success' => 'false', 'message' => 'Penjual tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $seller->ISACTIVE)) !== 'YES') {
            return json_encode(['success' => 'false', 'message' => 'Penjual sudah nonaktif.']);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            // Kunci + validasi tiap item: satu penjual, aktif, stok cukup.
            $lines = [];
            $subtotal = 0.0;
            foreach ($items as $it) {
                if (!is_array($it)) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => 'Baris item tidak valid.']);
                }
                $pid = $it['PRODUCTID'] ?? null;
                $qtyRaw = trim((string) ($it['QTY'] ?? ''));
                if (empty($pid) || $qtyRaw === '' || filter_var($qtyRaw, FILTER_VALIDATE_INT) === false || (int) $qtyRaw < 1) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => 'Jumlah tiap item minimal 1.']);
                }
                $p = DB::selectOne("
                    SELECT PRODUCTID, SELLERID, NAME, PRICE, STOCK, ISACTIVE
                    FROM T_PRODUCT WITH (UPDLOCK, HOLDLOCK)
                    WHERE PRODUCTID = ?
                ", [$pid]);
                if (!$p) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => 'Produk tidak ditemukan.']);
                }
                if ((int) $p->SELLERID !== (int) $sellerid) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => 'Semua produk harus dari satu penjual yang sama.']);
                }
                if (strtoupper(trim((string) $p->ISACTIVE)) !== 'YES') {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => 'Produk "' . $p->NAME . '" sudah nonaktif.']);
                }
                if ((int) $p->STOCK < (int) $qtyRaw) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => 'Stok "' . $p->NAME . '" tidak cukup (sisa ' . (int) $p->STOCK . ').']);
                }
                $lines[] = [
                    'pid' => (int) $pid, 'name' => (string) $p->NAME,
                    'price' => (float) $p->PRICE, 'qty' => (int) $qtyRaw,
                ];
                $subtotal += (float) $p->PRICE * (int) $qtyRaw;
            }

            $shipping = (float) $shipRaw;
            $total = $subtotal + $shipping;
            $no = Mmorder::genOrderNo();
            $payH = MerchConfig::payDeadlineHours();

            DB::insert("
                INSERT INTO T_MERCH_ORDER
                    (ORDERNO, SELLERID, BUYERNAME, BUYERPHONE, BUYEREMAIL,
                     ADDRESS, CITY, PROVINCE, POSTALCODE, COURIER,
                     SUBTOTAL, SHIPPING, TOTAL,
                     ORDERSTATUS, PAYSTATUS, PAYDEADLINE, NOTE, IDEMPOTENCYKEY,
                     SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?,
                     'BARU', 'BELUM_BAYAR', DATEADD(HOUR, ?, GETDATE()), ?, ?,
                     ?, GETDATE())
            ", [
                $no, (int) $sellerid, mb_substr($buyer, 0, 100),
                $phone !== '' ? mb_substr($phone, 0, 30) : null,
                $email !== '' ? mb_substr($email, 0, 100) : null,
                mb_substr($address, 0, 500),
                mb_substr(trim((string) ($vdata['CITY'] ?? '')), 0, 100),
                mb_substr(trim((string) ($vdata['PROVINCE'] ?? '')), 0, 100),
                mb_substr(trim((string) ($vdata['POSTALCODE'] ?? '')), 0, 10),
                $courier,
                $subtotal, $shipping, $total,
                $payH, mb_substr(trim((string) ($vdata['NOTE'] ?? '')), 0, 500),
                $idem !== '' ? $idem : null,
                $by !== '' ? mb_substr($by, 0, 25) : null,
            ]);
            $orderid = (int) $pdo->lastInsertId();

            foreach ($lines as $ln) {
                DB::update("
                    UPDATE T_PRODUCT SET STOCK = STOCK - ? WHERE PRODUCTID = ?
                ", [$ln['qty'], $ln['pid']]);
                DB::insert("
                    INSERT INTO T_MERCH_ORDER_ITEM
                        (ORDERID, PRODUCTID, PRODUCTNAME, UNITPRICE, QTY, SUBTOTAL)
                    VALUES (?, ?, ?, ?, ?, ?)
                ", [
                    $orderid, $ln['pid'], mb_substr($ln['name'], 0, 150),
                    $ln['price'], $ln['qty'], $ln['price'] * $ln['qty'],
                ]);
            }

            Mmorder::addHistory($orderid, null, 'BARU', 'Pesanan dibuat.', $by);

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            // Balapan idempotency: baris sudah ada -> anggap sudah dibuat.
            if ($idem !== '' && stripos($e->getMessage(), 'UX_T_MERCH_ORDER_IDEMPOTENCY') !== false) {
                $dup = DB::selectOne("SELECT ORDERID, ORDERNO FROM T_MERCH_ORDER WHERE IDEMPOTENCYKEY = ?", [$idem]);
                if ($dup) {
                    return json_encode([
                        'success' => 'true',
                        'message' => 'Pesanan sudah dibuat sebelumnya (' . $dup->ORDERNO . ').',
                        'Rows' => [['ORDERID' => $dup->ORDERID, 'ORDERNO' => $dup->ORDERNO]],
                    ]);
                }
            }
            SysLog::log('ERROR', 'API', 'Gagal membuat pesanan.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal membuat pesanan. Silakan coba lagi.']);
        }

        $order = Mmorder::findOrder($orderid);
        Mmorder::audit('CREATE', self::MCONTROL, self::PAGE, $order,
            [], ['TOTAL' => (string) $total, 'ITEMS' => count($lines)], $by);

        return json_encode([
            'success' => 'true', 'message' => 'Pesanan ' . $no . ' berhasil dibuat.',
            'Rows' => [['ORDERID' => $orderid, 'ORDERNO' => $no]],
        ]);
    }

    // Batalkan: BARU/DIPROSES + alasan; stok kembali; LUNAS -> REFUND.
    public static function process_cancel($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;
        $reason = trim((string) ($vdata['REASON'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan pembatalan wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        return self::cancelCore((int) $id, $reason, $by, self::MCONTROL, self::PAGE);
    }

    // Inti pembatalan (dipakai kedua halaman). Return JSON string.
    public static function cancelCore(int $id, string $reason, string $by, string $mcontrol, string $page): string
    {
        $order = Mmorder::findOrder($id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $order->ORDERSTATUS));
        if ($st !== 'BARU' && $st !== 'DIPROSES') {
            return json_encode(['success' => 'false', 'message' => 'Hanya pesanan BARU/DIPROSES yang bisa dibatalkan.']);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            $items = DB::select("SELECT PRODUCTID, QTY FROM T_MERCH_ORDER_ITEM WHERE ORDERID = ?", [$id]);
            foreach ($items as $it) {
                DB::update("UPDATE T_PRODUCT SET STOCK = STOCK + ? WHERE PRODUCTID = ?", [(int) $it->QTY, (int) $it->PRODUCTID]);
            }

            $newPay = strtoupper(trim((string) $order->PAYSTATUS)) === 'LUNAS' ? 'REFUND' : (string) $order->PAYSTATUS;
            DB::update("
                UPDATE T_MERCH_ORDER
                SET ORDERSTATUS = 'DIBATALKAN', PAYSTATUS = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE ORDERID = ?
            ", [$newPay, $by !== '' ? mb_substr($by, 0, 25) : null, $id]);

            Mmorder::addHistory($id, $st, 'DIBATALKAN', $reason, $by);

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal membatalkan pesanan.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal membatalkan pesanan.']);
        }

        // Batal setelah LUNAS = refund + kembalikan dana tertahan (Finance).
        $wasPaid = strtoupper(trim((string) $order->PAYSTATUS)) === 'LUNAS';
        if ($wasPaid) {
            $pay = DB::selectOne("
                SELECT PAYMENTID FROM T_PAYMENT
                WHERE REFTYPE = 'MERCH' AND REFID = ? AND STATUS = 'BERHASIL'
            ", [$id]);
            if ($pay) {
                $left = PaymentService::remaining((int) $pay->PAYMENTID);
                if ($left > 0) {
                    $rf = PaymentService::refund([
                        'PAYMENTID' => (int) $pay->PAYMENTID, 'AMOUNT' => $left,
                        'REFUNDTYPE' => 'BATAL_MERCH', 'REFID' => $id, 'ACTOR' => $by,
                    ]);
                    if (!$rf['ok']) {
                        SysLog::log('ERROR', 'API', 'Refund batal pesanan gagal.', ['order' => $id]);
                    }
                }
                $rv = PaymentService::reversePending($id, $by, 'Batal pesanan LUNAS.');
                if (!$rv['ok']) {
                    SysLog::log('ERROR', 'API', 'Reversal dana batal pesanan gagal.', ['order' => $id]);
                }
            } else {
                SysLog::log('WARNING', 'API', 'Batal pesanan LUNAS tanpa pembayaran.', ['order' => $id]);
            }
        }

        Mmorder::audit('STATUS', $mcontrol, $page, $order,
            ['ORDERSTATUS' => $st, 'PAYSTATUS' => (string) $order->PAYSTATUS],
            ['ORDERSTATUS' => 'DIBATALKAN', 'PAYSTATUS' => $newPay, 'REASON' => $reason], $by);

        return json_encode(['success' => 'true', 'message' => 'Pesanan berhasil dibatalkan. Stok dikembalikan.']);
    }

    // Tandai Lunas: BELUM_BAYAR -> LUNAS (+PAIDAT). DIBATALKAN tak bisa dibayar.
    public static function process_pay($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }

        $order = Mmorder::findOrder((int) $id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $order->ORDERSTATUS)) === 'DIBATALKAN'
            || strtoupper(trim((string) $order->ORDERSTATUS)) === 'DIKEMBALIKAN') {
            return json_encode(['success' => 'false', 'message' => 'Pesanan batal/kembali tidak bisa dibayar.']);
        }
        if (strtoupper(trim((string) $order->PAYSTATUS)) !== 'BELUM_BAYAR') {
            return json_encode(['success' => 'false', 'message' => 'Pesanan sudah tidak BELUM_BAYAR.']);
        }

        // Via layanan pembayaran pusat (invoice + buku besar). Butuh metode;
        // form Catat Pembayaran (FRMpayrecord) mengirimkannya.
        $methodRaw = trim((string) ($vdata['PAYMETHODID'] ?? ''));
        if ($methodRaw === '') {
            return json_encode(['success' => 'false', 'message' => 'Catat pembayaran lewat form Catat Pembayaran (metode wajib).']);
        }
        $r = PaymentService::record([
            'REFTYPE' => 'MERCH', 'REFID' => (int) $id,
            'PAYMETHODID' => $methodRaw,
            'PAIDAT' => trim((string) ($vdata['PAIDAT'] ?? '')),
            'EXTREF' => trim((string) ($vdata['EXTREF'] ?? '')),
            'SOURCE' => 'MANUAL', 'ACTOR' => $by,
        ]);
        if (!$r['ok']) {
            return json_encode(['success' => 'false', 'message' => $r['message']]);
        }

        Mmorder::addHistory((int) $id, (string) $order->ORDERSTATUS, (string) $order->ORDERSTATUS, 'Pembayaran LUNAS.', $by);
        Mmorder::audit('STATUS', self::MCONTROL, self::PAGE, $order,
            ['PAYSTATUS' => 'BELUM_BAYAR'], ['PAYSTATUS' => 'LUNAS'], $by);

        return json_encode(['success' => 'true', 'message' => 'Pesanan ditandai LUNAS.']);
    }

    // Tandai terima: DIKIRIM -> SELESAI (+DONEAT).
    public static function process_receive($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }

        $order = Mmorder::findOrder((int) $id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $order->ORDERSTATUS)) !== 'DIKIRIM') {
            return json_encode(['success' => 'false', 'message' => 'Hanya pesanan DIKIRIM yang bisa ditandai diterima.']);
        }

        DB::update("
            UPDATE T_MERCH_ORDER
            SET ORDERSTATUS = 'SELESAI', DONEAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ORDERID = ? AND ORDERSTATUS = 'DIKIRIM'
        ", [$by !== '' ? mb_substr($by, 0, 25) : null, (int) $id]);

        Mmorder::addHistory((int) $id, 'DIKIRIM', 'SELESAI', 'Diterima pembeli.', $by);
        Mmorder::audit('STATUS', self::MCONTROL, self::PAGE, $order,
            ['ORDERSTATUS' => 'DIKIRIM'], ['ORDERSTATUS' => 'SELESAI'], $by);

        // Dana tertahan -> tersedia (sekali per pesanan, idempoten).
        $rel = PaymentService::releaseOrder((int) $id, $by);
        $msg = 'Pesanan selesai.';
        if (!($rel['ok'] ?? false)) {
            SysLog::log('ERROR', 'API', 'Pelepasan dana gagal setelah SELESAI.', ['order' => (int) $id]);
            $msg .= ' Perhatian: pelepasan dana gagal, hubungi administrator.';
        }

        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Buat keluhan: DIKIRIM/SELESAI + dalam batas hari + satu TERBUKA.
    public static function process_complaint($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;
        $reason = strtoupper(trim((string) ($vdata['REASON'] ?? '')));
        $descr = trim((string) ($vdata['DESCR'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }
        if (!in_array($reason, MerchConfig::COMPLAINT_REASONS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Alasan harus salah satu: ' . implode(', ', MerchConfig::COMPLAINT_REASONS) . '.']);
        }
        if (mb_strlen($descr) > 1000) {
            return json_encode(['success' => 'false', 'message' => 'Deskripsi maksimal 1000 karakter.']);
        }

        $order = Mmorder::findOrder((int) $id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $order->ORDERSTATUS));
        if ($st !== 'DIKIRIM' && $st !== 'SELESAI') {
            return json_encode(['success' => 'false', 'message' => 'Keluhan hanya untuk pesanan DIKIRIM/SELESAI.']);
        }

        // Batas hari sejak dikirim/selesai.
        $base = $st === 'SELESAI' ? (string) ($order->DONEAT ?? '') : (string) ($order->SHIPPEDAT ?? '');
        if ($base !== '') {
            $limit = strtotime($base) + MerchConfig::complaintDays() * 86400;
            if (time() > $limit) {
                return json_encode(['success' => 'false', 'message' => 'Melewati batas keluhan (' . MerchConfig::complaintDays() . ' hari).']);
            }
        }

        $open = DB::selectOne("
            SELECT 1 AS X FROM T_MERCH_COMPLAINT
            WHERE ORDERID = ? AND STATUS = 'TERBUKA'
        ", [(int) $id]);
        if ($open) {
            return json_encode(['success' => 'false', 'message' => 'Pesanan ini sudah punya keluhan TERBUKA.']);
        }

        DB::insert("
            INSERT INTO T_MERCH_COMPLAINT
                (ORDERID, REASON, DESCR, STATUS, CREATEBY)
            VALUES (?, ?, ?, 'TERBUKA', ?)
        ", [
            (int) $id, $reason,
            $descr !== '' ? mb_substr($descr, 0, 1000) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null,
        ]);
        $cid = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => self::MCONTROL, 'page' => self::PAGE,
            'table' => 'T_MERCH_COMPLAINT', 'dataId' => (string) $cid,
            'summary' => 'KELUHAN ' . (string) ($order->ORDERNO ?? $id) . ' (' . $reason . ')',
            'before' => [],
            'after' => ['REASON' => $reason, 'STATUS' => 'TERBUKA'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Keluhan berhasil dibuat.']);
    }

    // Tutup keluhan: TERBUKA/DITANGGAPI -> SELESAI + tanggapan wajib.
    public static function process_complaint_close($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $cid = $vdata['COMPLAINTID'] ?? null;
        $resp = trim((string) ($vdata['RESPONSE'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($cid)) {
            return json_encode(['success' => 'false', 'message' => 'COMPLAINTID tidak ditemukan.']);
        }
        if ($resp === '') {
            return json_encode(['success' => 'false', 'message' => 'Tanggapan wajib diisi untuk menutup keluhan.']);
        }
        if (mb_strlen($resp) > 1000) {
            return json_encode(['success' => 'false', 'message' => 'Tanggapan maksimal 1000 karakter.']);
        }

        $row = DB::selectOne("SELECT COMPLAINTID, ORDERID, STATUS FROM T_MERCH_COMPLAINT WHERE COMPLAINTID = ?", [$cid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data keluhan tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $row->STATUS));
        if ($st !== 'TERBUKA' && $st !== 'DITANGGAPI') {
            return json_encode(['success' => 'false', 'message' => 'Hanya keluhan TERBUKA/DITANGGAPI yang bisa ditutup.']);
        }

        DB::update("
            UPDATE T_MERCH_COMPLAINT
            SET STATUS = 'SELESAI', RESPONSE = ?, DONETIME = GETDATE(), DONEBY = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE COMPLAINTID = ?
        ", [
            mb_substr($resp, 0, 1000),
            $by !== '' ? mb_substr($by, 0, 25) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null, $cid,
        ]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => self::MCONTROL, 'page' => self::PAGE,
            'table' => 'T_MERCH_COMPLAINT', 'dataId' => (string) $cid,
            'summary' => 'KELUHAN ' . $cid . ' -> SELESAI',
            'before' => ['STATUS' => $st],
            'after' => ['STATUS' => 'SELESAI'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Keluhan ditutup.']);
    }
}
