<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Pesanan sisi penjual (Seller Center, module Merchandise).
// SEGMENT frontend: home/msellerorder/msellerorder. Menu CPMENU MCONTROL = msellerorder.
//
// Memakai tabel + mesin Mmorder yang sama dengan My Purchase (tanpa salin).
// Di sini: baca (default paling mendesak), proses, kirim+resi, batalkan,
// pengembalian, tanggapi keluhan.
class Mmsellerorder extends Model
{
    const MCODE = 50020003;
    const PAGE = 'Seller Order';
    const MCONTROL = 'msellerorder';

    // Tolak bila group user tidak punya akses menu Seller Order.
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
        // Daftar bersama, default urut paling mendesak. Akses = menu ini.
        return Mmorder::readList($param, self::MCODE, true);
    }

    // Daftar penjual (untuk filter).
    public static function read_sellers($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $result = DB::select("
            SELECT SELLERID, SELLERCODE, SHOPNAME FROM T_SELLER
            ORDER BY SHOPNAME
        ");

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    public static function read_detail($param)
    {
        return Mmorder::readDetail($param, self::MCODE);
    }

    // Ringkasan seller: perlu diproses/dikirim, terlambat, keluhan, selesai.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        Mmorder::applyLazy();

        $shipD = MerchConfig::shipDeadlineDays();
        $row = DB::selectOne("
            SELECT COUNT(*) AS TOTAL,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'BARU' AND A.PAYSTATUS = 'LUNAS' THEN 1 ELSE 0 END), 0) AS NEEDPROCESS,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'DIPROSES' AND A.PAYSTATUS = 'LUNAS' THEN 1 ELSE 0 END), 0) AS NEEDSHIP,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'DIPROSES' AND A.PAYSTATUS = 'LUNAS'
                                        AND A.PAIDAT IS NOT NULL
                                        AND A.PAIDAT <= DATEADD(DAY, ?, GETDATE()) THEN 1 ELSE 0 END), 0) AS LATE,
                   ISNULL(SUM(CASE WHEN A.ORDERSTATUS = 'SELESAI' THEN 1 ELSE 0 END), 0) AS DONE
            FROM T_MERCH_ORDER A
        ", [-$shipD]);

        $comp = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_MERCH_COMPLAINT WHERE STATUS = 'TERBUKA'
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'TOTAL' => $row ? (int) $row->TOTAL : 0,
            'NEEDPROCESS' => $row ? (int) $row->NEEDPROCESS : 0,
            'NEEDSHIP' => $row ? (int) $row->NEEDSHIP : 0,
            'LATE' => $row ? (int) $row->LATE : 0,
            'COMPLAINT' => $comp ? (int) $comp->C : 0,
            'DONE' => $row ? (int) $row->DONE : 0,
        ]]]);
    }

    // Proses: BARU -> DIPROSES. Hanya bila pembayaran LUNAS.
    public static function process_process($param)
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
        if (strtoupper(trim((string) $order->ORDERSTATUS)) !== 'BARU') {
            return json_encode(['success' => 'false', 'message' => 'Hanya pesanan BARU yang bisa diproses.']);
        }
        if (strtoupper(trim((string) $order->PAYSTATUS)) !== 'LUNAS') {
            return json_encode(['success' => 'false', 'message' => 'Pesanan BELUM_BAYAR tidak bisa diproses. Tandai LUNAS dulu.']);
        }

        DB::update("
            UPDATE T_MERCH_ORDER
            SET ORDERSTATUS = 'DIPROSES',
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ORDERID = ? AND ORDERSTATUS = 'BARU'
        ", [$by !== '' ? mb_substr($by, 0, 25) : null, (int) $id]);

        Mmorder::addHistory((int) $id, 'BARU', 'DIPROSES', 'Diproses penjual.', $by);
        Mmorder::audit('STATUS', self::MCONTROL, self::PAGE, $order,
            ['ORDERSTATUS' => 'BARU'], ['ORDERSTATUS' => 'DIPROSES'], $by);

        return json_encode(['success' => 'true', 'message' => 'Pesanan diproses.']);
    }

    // Kirim: DIPROSES -> DIKIRIM. Resi + kurir wajib; notifikasi best-effort.
    public static function process_ship($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;
        $courier = trim((string) ($vdata['COURIER'] ?? ''));
        $resi = trim((string) ($vdata['TRACKINGNO'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }
        if (!in_array($courier, MerchConfig::COURIERS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Kurir harus salah satu: ' . implode(', ', MerchConfig::COURIERS) . '.']);
        }
        if ($resi === '') {
            return json_encode(['success' => 'false', 'message' => 'Nomor resi wajib diisi.']);
        }
        if (mb_strlen($resi) > 50) {
            return json_encode(['success' => 'false', 'message' => 'Nomor resi maksimal 50 karakter.']);
        }

        $order = Mmorder::findOrder((int) $id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $order->ORDERSTATUS)) !== 'DIPROSES') {
            return json_encode(['success' => 'false', 'message' => 'Hanya pesanan DIPROSES yang bisa dikirim.']);
        }
        if (strtoupper(trim((string) $order->PAYSTATUS)) !== 'LUNAS') {
            return json_encode(['success' => 'false', 'message' => 'Pesanan BELUM_BAYAR tidak bisa dikirim.']);
        }

        DB::update("
            UPDATE T_MERCH_ORDER
            SET ORDERSTATUS = 'DIKIRIM', COURIER = ?, TRACKINGNO = ?,
                SHIPPEDAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ORDERID = ? AND ORDERSTATUS = 'DIPROSES'
        ", [
            $courier, mb_substr($resi, 0, 50),
            $by !== '' ? mb_substr($by, 0, 25) : null, (int) $id,
        ]);

        Mmorder::addHistory((int) $id, 'DIPROSES', 'DIKIRIM', 'Dikirim via ' . $courier . ' ' . $resi . '.', $by);
        Mmorder::audit('STATUS', self::MCONTROL, self::PAGE, $order,
            ['ORDERSTATUS' => 'DIPROSES'], ['ORDERSTATUS' => 'DIKIRIM', 'TRACKINGNO' => $resi], $by);

        // Notifikasi ORDER_SHIPPED (best-effort, gagal aman).
        try {
            $r = NotificationTemplate::render('ORDER_SHIPPED', 'EMAIL', [
                'nama' => (string) ($order->BUYERNAME ?? ''),
                'nomor_order' => (string) ($order->ORDERNO ?? ''),
                'kurir' => $courier,
                'nomor_resi' => $resi,
            ]);
            $to = trim((string) ($order->BUYEREMAIL ?? ''));
            if ($r['ok'] && $to !== '' && filter_var($to, FILTER_VALIDATE_EMAIL) !== false) {
                $smtp = DB::selectOne("
                    SELECT TOP 1 MAILFROMNAME, MAILFROMEMAIL, SMTPHOST, SMTPPORT, SMTPENCRYPTION,
                                   SMTPUSERNAME, dbo.app_decrypt(SMTPPASSWORD) AS PLAIN
                    FROM T_APP_SETTING ORDER BY SETTINGID
                ");
                if ($smtp && trim((string) ($smtp->SMTPHOST ?? '')) !== '') {
                    $sent = SmtpMailer::send([
                        'HOST' => (string) ($smtp->SMTPHOST ?? ''),
                        'PORT' => (string) ($smtp->SMTPPORT ?? ''),
                        'ENCRYPTION' => (string) ($smtp->SMTPENCRYPTION ?? 'NONE'),
                        'USERNAME' => (string) ($smtp->SMTPUSERNAME ?? ''),
                        'PASSWORD' => trim((string) ($smtp->PLAIN ?? '')),
                        'FROMEMAIL' => (string) ($smtp->MAILFROMEMAIL ?? ''),
                        'FROMNAME' => (string) ($smtp->MAILFROMNAME ?? ''),
                    ], $to, $r['subject'], $r['body']);
                    SysLog::log($sent['ok'] ? 'INFO' : 'WARNING', 'API', 'Notifikasi ORDER_SHIPPED: ' . ($sent['ok'] ? 'terkirim' : 'gagal') . '.', [
                        'ticket' => (string) ($order->ORDERNO ?? $id),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal notifikasi kirim pesanan.', [], $e);
        }

        return json_encode(['success' => 'true', 'message' => 'Pesanan dikirim.']);
    }

    // Batalkan oleh penjual: BARU/DIPROSES + alasan (pakai inti bersama).
    public static function process_cancel($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }

        return Mmmypurchase::cancelCore(
            (int) $id,
            (string) ($vdata['REASON'] ?? ''),
            $param['VUSERLOGIN'] ?? '',
            self::MCONTROL,
            self::PAGE
        );
    }

    // Pengembalian barang: DIKIRIM/SELESAI -> DIKEMBALIKAN, hanya lewat
    // keluhan TERBUKA/DITANGGAPI. Stok kembali bila layak jual; bayar REFUND.
    public static function process_return($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ORDERID'] ?? null;
        $reason = trim((string) ($vdata['REASON'] ?? ''));
        $restock = strtoupper(trim((string) ($vdata['RESTOCKABLE'] ?? 'YES')));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ORDERID tidak ditemukan.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan pengembalian wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }
        if ($restock !== 'YES' && $restock !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Pilihan stok harus YES atau NO.']);
        }

        $order = Mmorder::findOrder((int) $id);
        if (!$order) {
            return json_encode(['success' => 'false', 'message' => 'Data pesanan tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $order->ORDERSTATUS));
        if ($st !== 'DIKIRIM' && $st !== 'SELESAI') {
            return json_encode(['success' => 'false', 'message' => 'Hanya pesanan DIKIRIM/SELESAI yang bisa dikembalikan.']);
        }

        $comp = DB::selectOne("
            SELECT COMPLAINTID FROM T_MERCH_COMPLAINT
            WHERE ORDERID = ? AND STATUS IN ('TERBUKA', 'DITANGGAPI')
        ", [(int) $id]);
        if (!$comp) {
            return json_encode(['success' => 'false', 'message' => 'Pengembalian hanya lewat keluhan yang disetujui (TERBUKA/DITANGGAPI).']);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            if ($restock === 'YES') {
                $items = DB::select("SELECT PRODUCTID, QTY FROM T_MERCH_ORDER_ITEM WHERE ORDERID = ?", [(int) $id]);
                foreach ($items as $it) {
                    DB::update("UPDATE T_PRODUCT SET STOCK = STOCK + ? WHERE PRODUCTID = ?", [(int) $it->QTY, (int) $it->PRODUCTID]);
                }
            }

            DB::update("
                UPDATE T_MERCH_ORDER
                SET ORDERSTATUS = 'DIKEMBALIKAN', PAYSTATUS = 'REFUND',
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE ORDERID = ?
            ", [$by !== '' ? mb_substr($by, 0, 25) : null, (int) $id]);

            DB::update("
                UPDATE T_MERCH_COMPLAINT
                SET STATUS = 'SELESAI', RESPONSE = ?, DONETIME = GETDATE(), DONEBY = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE COMPLAINTID = ?
            ", [
                mb_substr('Dikembalikan: ' . $reason, 0, 1000),
                $by !== '' ? mb_substr($by, 0, 25) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null, (int) $comp->COMPLAINTID,
            ]);

            Mmorder::addHistory((int) $id, $st, 'DIKEMBALIKAN', $reason, $by);

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal memproses pengembalian.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal memproses pengembalian.']);
        }

        Mmorder::audit('STATUS', self::MCONTROL, self::PAGE, $order,
            ['ORDERSTATUS' => $st, 'PAYSTATUS' => (string) $order->PAYSTATUS],
            ['ORDERSTATUS' => 'DIKEMBALIKAN', 'PAYSTATUS' => 'REFUND'], $by);

        return json_encode(['success' => 'true', 'message' => 'Pengembalian diproses. Pembayaran menjadi REFUND.']);
    }

    // Tanggapi keluhan: isi tanggapan + ubah ke DITANGGAPI/SELESAI.
    public static function process_complaint_respond($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $cid = $vdata['COMPLAINTID'] ?? null;
        $resp = trim((string) ($vdata['RESPONSE'] ?? ''));
        $status = strtoupper(trim((string) ($vdata['STATUS'] ?? 'DITANGGAPI')));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($cid)) {
            return json_encode(['success' => 'false', 'message' => 'COMPLAINTID tidak ditemukan.']);
        }
        if ($resp === '') {
            return json_encode(['success' => 'false', 'message' => 'Tanggapan wajib diisi.']);
        }
        if (mb_strlen($resp) > 1000) {
            return json_encode(['success' => 'false', 'message' => 'Tanggapan maksimal 1000 karakter.']);
        }
        if ($status !== 'DITANGGAPI' && $status !== 'SELESAI') {
            return json_encode(['success' => 'false', 'message' => 'Status harus DITANGGAPI atau SELESAI.']);
        }

        $row = DB::selectOne("SELECT COMPLAINTID, ORDERID, STATUS FROM T_MERCH_COMPLAINT WHERE COMPLAINTID = ?", [$cid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data keluhan tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $row->STATUS));
        if ($st !== 'TERBUKA' && $st !== 'DITANGGAPI') {
            return json_encode(['success' => 'false', 'message' => 'Hanya keluhan TERBUKA/DITANGGAPI yang bisa ditanggapi.']);
        }

        if ($status === 'SELESAI') {
            DB::update("
                UPDATE T_MERCH_COMPLAINT
                SET STATUS = 'SELESAI', RESPONSE = ?, RESPONDTIME = GETDATE(), RESPONDBY = ?,
                    DONETIME = GETDATE(), DONEBY = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE COMPLAINTID = ?
            ", [
                mb_substr($resp, 0, 1000),
                $by !== '' ? mb_substr($by, 0, 25) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null, $cid,
            ]);
        } else {
            DB::update("
                UPDATE T_MERCH_COMPLAINT
                SET STATUS = 'DITANGGAPI', RESPONSE = ?, RESPONDTIME = GETDATE(), RESPONDBY = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE COMPLAINTID = ?
            ", [
                mb_substr($resp, 0, 1000),
                $by !== '' ? mb_substr($by, 0, 25) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null, $cid,
            ]);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => self::MCONTROL, 'page' => self::PAGE,
            'table' => 'T_MERCH_COMPLAINT', 'dataId' => (string) $cid,
            'summary' => 'KELUHAN ' . $cid . ' -> ' . $status,
            'before' => ['STATUS' => $st],
            'after' => ['STATUS' => $status],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Keluhan ditanggapi.']);
    }
}
