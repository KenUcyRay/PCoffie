<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Layanan pembayaran pusat Finance: SATU-SATUNYA jalan untuk mencatat,
// membatalkan, dan merefund pembayaran. Semua halaman lain memanggil layanan
// ini (tidak ada yang mengubah status pembayaran sendiri).
//
// Uang: integer rupiah penuh (Money). Semua hitungan di backend; nilai
// frontend tidak dipercaya. Biaya disnapshot dari Fee Setting yang berlaku
// pada tanggal bayar (Mcpfee::effectiveOn).
//
// Promo: TIDAK memanggil PromoEngine::record/revert (transaksi PDO sendiri
// akan commit prematur di dalam transaksi service). Logika yang sama
// dijalankan inline: kunci baris T_PROMO (UPDLOCK,HOLDLOCK) + cek ulang +
// tulis, dalam SATU transaksi service.
//
// Tanpa cek hak akses / audit di sini (milik pemanggil). Return array
// ['ok'=>bool, 'message'=>string, ...], tidak pernah throw ke pemanggil
// kecuali LedgerService::add (argumen tidak valid = bug pemanggil).
class PaymentService extends Model
{
    const TYPES = ['TIKET', 'MERCH', 'IKLAN'];

    // Batas export CSV (ikuti pola halaman lain).
    const EXPORT_LIMIT = 10000;

    // ---------------------------------------------------------------- catat
    // $p: REFTYPE, REFID, PAYMETHODID?, PAIDAT?, EXTREF?, PROMOCODE?,
    //     SOURCE?, NOTE?, IDEMPOTENCYKEY?, ACTOR.
    // Return ['ok', 'message', 'payment'=>[...], 'duplicate'=>bool].
    public static function record(array $p): array
    {
        $type = strtoupper(trim((string) ($p['REFTYPE'] ?? '')));
        $refId = (int) ($p['REFID'] ?? 0);
        $actor = mb_substr(trim((string) ($p['ACTOR'] ?? '')), 0, 25);
        $source = strtoupper(trim((string) ($p['SOURCE'] ?? 'MANUAL')));
        if (!in_array($type, self::TYPES, true) || $refId <= 0) {
            return ['ok' => false, 'message' => 'Jenis atau referensi pembayaran tidak valid.'];
        }
        if (!in_array($source, ['MANUAL', 'IMPOR', 'BACKFILL'], true)) {
            return ['ok' => false, 'message' => 'Sumber pembayaran tidak valid.'];
        }
        $paidAt = self::parsePaidAt($p['PAIDAT'] ?? null);
        if ($paidAt === null) {
            return ['ok' => false, 'message' => 'Waktu bayar tidak valid.'];
        }
        $idem = mb_substr(trim((string) ($p['IDEMPOTENCYKEY'] ?? '')), 0, 64);

        // Idempotency: kunci sudah pernah dipakai -> kembalikan yang lama.
        if ($idem !== '') {
            $old = DB::selectOne("SELECT * FROM T_PAYMENT WHERE IDEMPOTENCYKEY = ?", [$idem]);
            if ($old) {
                return ['ok' => true, 'message' => 'Pembayaran sudah tercatat sebelumnya.', 'payment' => (array) $old, 'duplicate' => true];
            }
        }

        try {
            $out = DB::transaction(function () use ($type, $refId, $p, $actor, $source, $paidAt, $idem) {
                $calc = self::buildCalc($type, $refId, $p, $paidAt, $actor, true);
                if (!$calc['ok']) {
                    return $calc;
                }
                $c = $calc['calc'];

                // Metode: wajib untuk MANUAL; IMPOR/BACKFILL boleh kosong.
                $methodFee = 0;
                $methodId = null;
                $methodRaw = trim((string) ($p['PAYMETHODID'] ?? ''));
                if ($methodRaw !== '') {
                    if (!ctype_digit($methodRaw)) {
                        return ['ok' => false, 'message' => 'Metode pembayaran tidak valid.'];
                    }
                    $m = DB::selectOne("SELECT * FROM T_PAYMENT_METHOD WHERE PAYID = ?", [(int) $methodRaw]);
                    if (!$m || strtoupper(trim((string) $m->PAYACTIVE)) !== 'YES') {
                        return ['ok' => false, 'message' => 'Metode pembayaran tidak aktif.'];
                    }
                    $methodId = (int) $m->PAYID;
                    $methodFee = Money::pct($c['total'], $m->PCTCOST) + Money::r($m->FIXCOST);
                    $min = $m->MINAMT !== null ? Money::r($m->MINAMT) : null;
                    $max = $m->MAXAMT !== null ? Money::r($m->MAXAMT) : null;
                    if (($min !== null && $c['total'] < $min) || ($max !== null && $c['total'] > $max)) {
                        return ['ok' => false, 'message' => 'Total di luar batas minimum/maksimum metode pembayaran.'];
                    }
                } elseif ($source === 'MANUAL') {
                    return ['ok' => false, 'message' => 'Metode pembayaran wajib dipilih.'];
                }

                DB::insert("
                    INSERT INTO T_PAYMENT
                        (PAYNO, REFTYPE, REFID, EVENTID, SELLERID, PAYMETHODID,
                         SUBTOTAL, DISCOUNT, PROMOCODE, SERVICEFEE, SHIPPING,
                         TOTALPAID, PLATFORMFEE, METHODFEE, OWNERAMT,
                         EXTREF, PAIDAT, SOURCE, STATUS, NOTE,
                         IDEMPOTENCYKEY, SYSCREATEUSER, SYSCREATEDATE)
                    VALUES ('TMP', ?, ?, ?, ?, ?,
                         ?, ?, ?, ?, ?,
                         ?, ?, ?, ?,
                         ?, ?, ?, 'BERHASIL', ?,
                         ?, ?, GETDATE())
                ", [
                    $type, $refId, $c['eventId'], $c['sellerId'], $methodId,
                    $c['subtotal'], $c['discount'], $c['promocode'] ?: null, $c['service'], $c['shipping'],
                    $c['total'], $c['platform'], $methodFee, $c['owner'],
                    mb_substr(trim((string) ($p['EXTREF'] ?? '')), 0, 100) ?: null,
                    $paidAt, $source,
                    mb_substr(trim((string) ($p['NOTE'] ?? '')), 0, 200) ?: null,
                    $idem !== '' ? $idem : null, $actor !== '' ? $actor : null,
                ]);
                $payId = (int) DB::getPdo()->lastInsertId();
                $payNo = 'PAY-' . date('Ym', strtotime($paidAt)) . '-' . str_pad((string) $payId, 6, '0', STR_PAD_LEFT);
                DB::update("UPDATE T_PAYMENT SET PAYNO = ? WHERE PAYMENTID = ?", [$payNo, $payId]);

                // Pemakaian promo (inline, terkunci): TIKET + kode valid.
                if ($type === 'TIKET' && $c['promoid'] > 0) {
                    $prow = DB::selectOne("
                        SELECT PROMOID, QUOTA, MAXPERBUYER FROM T_PROMO WITH (UPDLOCK, HOLDLOCK)
                        WHERE PROMOID = ?
                    ", [$c['promoid']]);
                    if (!$prow) {
                        throw new \RuntimeException('Promo tidak ditemukan.');
                    }
                    if ($prow->QUOTA !== null && (int) $prow->QUOTA > 0) {
                        $used = (int) (DB::selectOne("SELECT COUNT(*) AS C FROM T_PROMO_USAGE WHERE PROMOID = ?", [$c['promoid']])->C ?? 0);
                        if ($used >= (int) $prow->QUOTA) throw new \RuntimeException('Kuota promo habis.');
                    }
                    $maxBuyer = max(1, (int) ($prow->MAXPERBUYER ?? 1));
                    if (trim((string) $c['email']) !== '') {
                        $bc = (int) (DB::selectOne("SELECT COUNT(*) AS C FROM T_PROMO_USAGE WHERE PROMOID = ? AND BUYEREMAIL = ?", [$c['promoid'], (string) $c['email']])->C ?? 0);
                        if ($bc >= $maxBuyer) throw new \RuntimeException('Batas pemakaian promo per pembeli tercapai.');
                    }
                    DB::insert("
                        INSERT INTO T_PROMO_USAGE
                            (PROMOID, EVENTID, BUYEREMAIL, BEFOREAMOUNT, DISCAMOUNT,
                             USEDATETIME, STATUS, REFERENCENO)
                        VALUES (?, ?, ?, ?, ?,
                             GETDATE(), 'DIPAKAI', ?)
                    ", [
                        $c['promoid'], $c['eventId'],
                        mb_substr(trim((string) $c['email']), 0, 100),
                        (float) $c['subtotal'], (float) $c['discount'],
                        $payNo,
                    ]);
                }

                // Mutasi sumber: peserta LUNAS / pesanan LUNAS / kampanye (sudah
                // diaktivasi di calcIklan). Kuota tiket sudah dicek di calcTiket.
                if ($type === 'TIKET') {
                    DB::update("
                        UPDATE T_ATTENDEE
                        SET PAYSTATUS = 'LUNAS', SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                        WHERE ATTENDEEID = ?
                    ", [$actor !== '' ? $actor : null, $refId]);
                } elseif ($type === 'MERCH') {
                    DB::update("
                        UPDATE T_MERCH_ORDER
                        SET PAYSTATUS = 'LUNAS', PAIDAT = GETDATE(),
                            SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                        WHERE ORDERID = ?
                    ", [$actor !== '' ? $actor : null, $refId]);
                }

                // Invoice otomatis.
                $invNo = InvoiceService::issue($payId, $type, [
                    'RECIPIENT' => $c['recipient'],
                    'RECIPIENTEMAIL' => $c['email'],
                    'RECIPIENTADDR' => $c['address'],
                    'LINES' => $c['lines'],
                    'TOTAL' => $c['total'],
                    'ISSUEDATE' => substr($paidAt, 0, 10),
                    'ACTOR' => $actor,
                ]);

                // Buku besar: MERCH -> SALE di PENDING (bagian penjual + ongkir).
                if ($type === 'MERCH') {
                    LedgerService::add([
                        'SELLERID' => $c['sellerId'], 'BUCKET' => 'PENDING', 'ENTRYTYPE' => 'SALE',
                        'AMOUNT' => $c['owner'] + $c['shipping'],
                        'REFTYPE' => 'ORDER', 'REFID' => $refId,
                        'NOTE' => 'Penjualan ' . $c['orderno'] . ' (' . $payNo . ')',
                        'ACTOR' => $actor,
                    ]);
                }

                $pay = DB::selectOne("SELECT * FROM T_PAYMENT WHERE PAYMENTID = ?", [$payId]);
                return ['ok' => true, 'message' => 'Pembayaran ' . $payNo . ' tercatat.', 'payment' => (array) $pay, 'invoice' => $invNo];
            });

            return $out;
        } catch (\Throwable $e) {
            // Balapan dua operator: unik (REFTYPE,REFID)+BERHASIL menang satu.
            $msg = (string) $e->getMessage();
            if (stripos($msg, 'UX_T_PAYMENT_REF_SUCCESS') !== false) {
                $old = DB::selectOne(
                    "SELECT * FROM T_PAYMENT WHERE REFTYPE = ? AND REFID = ? AND STATUS = 'BERHASIL'",
                    [$type, $refId]
                );
                if ($old) {
                    return ['ok' => true, 'message' => 'Pembayaran sudah tercatat sebelumnya.', 'payment' => (array) $old, 'duplicate' => true];
                }
            }
            if ($e instanceof \RuntimeException) {
                return ['ok' => false, 'message' => $e->getMessage()];
            }
            SysLog::log('ERROR', 'mpayment', 'Gagal mencatat pembayaran.', [], $e);
            return ['ok' => false, 'message' => 'Gagal mencatat pembayaran, coba lagi.'];
        }
    }

    // Susun hitungan per jenis. $forReal=true ikut memutasi sumber (aktivasi
    // iklan); false = baca saja (untuk pratinjau).
    private static function buildCalc(string $type, int $refId, array $p, string $paidAt, string $actor, bool $forReal): array
    {
        if ($type === 'TIKET') {
            return self::calcTiket($refId, $p, $paidAt);
        }
        if ($type === 'MERCH') {
            return self::calcMerch($refId, $p, $paidAt);
        }
        if ($forReal) {
            return self::calcIklan($refId, $p, $paidAt, $actor);
        }
        return self::calcIklanPreview($refId);
    }

    // Pratinjau hitungan TANPA menulis apa pun (ringkasan form sebelum simpan
    // + tombol uji promo). $p sama seperti record().
    // Return ['ok', 'calc'=>[...rincian + methodfee], 'message'].
    public static function preview(array $p): array
    {
        $type = strtoupper(trim((string) ($p['REFTYPE'] ?? '')));
        $refId = (int) ($p['REFID'] ?? 0);
        $actor = mb_substr(trim((string) ($p['ACTOR'] ?? '')), 0, 25);
        if (!in_array($type, self::TYPES, true) || $refId <= 0) {
            return ['ok' => false, 'message' => 'Jenis atau referensi pembayaran tidak valid.'];
        }
        $paidAt = self::parsePaidAt($p['PAIDAT'] ?? null);
        if ($paidAt === null) {
            return ['ok' => false, 'message' => 'Waktu bayar tidak valid.'];
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();
            $calc = self::buildCalc($type, $refId, $p, $paidAt, $actor, false);
            if (!$calc['ok']) {
                $pdo->rollBack();
                return $calc;
            }
            $c = $calc['calc'];

            $methodFee = 0;
            $methodName = '';
            $methodRaw = trim((string) ($p['PAYMETHODID'] ?? ''));
            if ($methodRaw !== '' && ctype_digit($methodRaw)) {
                $m = DB::selectOne("SELECT * FROM T_PAYMENT_METHOD WHERE PAYID = ?", [(int) $methodRaw]);
                if ($m && strtoupper(trim((string) $m->PAYACTIVE)) === 'YES') {
                    $methodName = (string) $m->PAYNAME;
                    $methodFee = Money::pct($c['total'], $m->PCTCOST) + Money::r($m->FIXCOST);
                }
            }
            $pdo->rollBack();

            $c['methodfee'] = $methodFee;
            $c['methodname'] = $methodName;
            return ['ok' => true, 'message' => 'OK', 'calc' => $c];
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            if ($e instanceof \RuntimeException) {
                return ['ok' => false, 'message' => $e->getMessage()];
            }
            SysLog::log('ERROR', 'mpayment', 'Gagal menghitung pratinjau.', [], $e);
            return ['ok' => false, 'message' => 'Gagal menghitung pratinjau, coba lagi.'];
        }
    }

    // Hitung TIKET. Kunci baris peserta + cek kuota + promo (cek awal;
    // penguncian promo saat tulis). Return ['ok','calc'=>[...]].
    private static function calcTiket(int $refId, array $p, string $paidAt): array
    {
        $a = DB::selectOne("
            SELECT * FROM T_ATTENDEE WITH (UPDLOCK, ROWLOCK)
            WHERE ATTENDEEID = ?
        ", [$refId]);
        if (!$a) {
            return ['ok' => false, 'message' => 'Data peserta tidak ditemukan.'];
        }
        if (strtoupper(trim((string) $a->TIKETSTATUS)) !== 'AKTIF') {
            return ['ok' => false, 'message' => 'Tiket sudah dibatalkan.'];
        }
        if (strtoupper(trim((string) $a->PAYSTATUS)) !== 'BELUM_BAYAR') {
            return ['ok' => false, 'message' => 'Peserta sudah ' . strtolower(trim((string) $a->PAYSTATUS)) . ', tidak bisa dibayar lagi.'];
        }
        $ev = DB::selectOne("SELECT EVENTID, STATUS FROM T_EVENT WHERE EVENTID = ?", [(int) $a->EVENTID]);
        if (!$ev || strtoupper(trim((string) $ev->STATUS)) !== 'PUBLISHED') {
            return ['ok' => false, 'message' => 'Event tidak dalam status PUBLISHED.'];
        }
        $t = DB::selectOne("SELECT TICKETTYPEID, NAME, PRICE FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [(int) $a->TICKETTYPEID]);
        if (!$t) {
            return ['ok' => false, 'message' => 'Data tipe tiket tidak ditemukan.'];
        }
        $quota = (int) ($t->QUOTA ?? 0);
        if ($quota > 0) {
            $sold = (int) (DB::selectOne("SELECT COUNT(*) AS C FROM T_ATTENDEE WHERE TICKETTYPEID = ? AND ISNULL(TIKETSTATUS,'AKTIF') <> 'BATAL'", [(int) $a->TICKETTYPEID])->C ?? 0);
            if ($sold >= $quota) return ['ok' => false, 'message' => 'Kuota tiket habis.'];
        }
        $subtotal = Money::r($t->PRICE);
        $fee = Mcpfee::effectiveOn(substr($paidAt, 0, 10));
        $service = $fee ? Money::r($fee->SERVICEPERTICKET) : 0;
        $discount = 0;
        $promoid = 0;
        $promocode = strtoupper(trim((string) ($p['PROMOCODE'] ?? '')));
        $email = trim((string) ($a->EMAIL ?? ''));
        if ($promocode !== '') {
            $pr = DB::selectOne("SELECT PROMOID, DISCTYPE, DISCVALUE, MAXDISC FROM T_PROMO WHERE PROMOCODE = ? AND ISACTIVE='YES'", [$promocode]);
            if (!$pr) return ['ok' => false, 'message' => 'Promo tidak berlaku (kode tidak ditemukan).'];
            $discount = Money::r($pr->DISCVALUE);
            $promoid = (int) $pr->PROMOID;
            if ($discount > $subtotal) $discount = $subtotal;
        }

        $base = $subtotal - $discount;
        $platform = $fee ? Money::platformFee($base, $fee->PLATFORMPCT, $fee->PLATFORMFIX) : 0;
        $total = $base + $service;
        $owner = $base - $platform;

        return ['ok' => true, 'calc' => [
            'subtotal' => $subtotal, 'discount' => $discount, 'promocode' => $promocode,
            'promoid' => $promoid, 'email' => $email, 'service' => $service,
            'shipping' => 0, 'total' => $total, 'platform' => $platform, 'owner' => $owner,
            'eventId' => (int) $a->EVENTID, 'sellerId' => null,
            'recipient' => (string) ($a->NAME ?? '-'),
            'address' => trim((string) ($a->PHONE ?? '')) !== '' ? ('Tel: ' . trim((string) $a->PHONE)) : '',
            'lines' => [[
                'desc' => 'Tiket ' . (string) $t->NAME . ' (' . (string) $a->TICKETCODE . ')',
                'qty' => 1, 'price' => $subtotal, 'amount' => $subtotal,
            ]],
        ]];
    }

    // Hitung MERCH dari pesanan (subtotal + ongkir). Ongkir penuh ke penjual,
    // tidak dikenai biaya platform.
    private static function calcMerch(int $refId, array $p, string $paidAt): array
    {
        $o = DB::selectOne("
            SELECT * FROM T_MERCH_ORDER WITH (UPDLOCK, ROWLOCK)
            WHERE ORDERID = ?
        ", [$refId]);
        if (!$o) {
            return ['ok' => false, 'message' => 'Data pesanan tidak ditemukan.'];
        }
        if (strtoupper(trim((string) $o->PAYSTATUS)) !== 'BELUM_BAYAR') {
            return ['ok' => false, 'message' => 'Pesanan sudah ' . strtolower(trim((string) $o->PAYSTATUS)) . ', tidak bisa dibayar lagi.'];
        }
        $st = strtoupper(trim((string) $o->ORDERSTATUS));
        if ($st === 'DIBATALKAN' || $st === 'DIKEMBALIKAN') {
            return ['ok' => false, 'message' => 'Pesanan sudah ' . strtolower($st) . '.'];
        }

        $subtotal = Money::r($o->SUBTOTAL);
        $shipping = Money::r($o->SHIPPING);
        $fee = Mcpfee::effectiveOn(substr($paidAt, 0, 10));
        $platform = $fee ? Money::platformFee($subtotal, $fee->PLATFORMPCT, $fee->PLATFORMFIX) : 0;
        $total = $subtotal + $shipping;
        $owner = $subtotal - $platform;

        $items = DB::select("
            SELECT PRODUCTNAME, QTY, UNITPRICE FROM T_MERCH_ORDER_ITEM WHERE ORDERID = ? ORDER BY ITEMID
        ", [$refId]);
        $lines = [];
        foreach ($items as $it) {
            $pr = Money::r($it->UNITPRICE);
            $qy = max(1, (int) $it->QTY);
            $lines[] = ['desc' => (string) $it->PRODUCTNAME, 'qty' => $qy, 'price' => $pr, 'amount' => $pr * $qy];
        }
        if (empty($lines)) {
            $lines[] = ['desc' => 'Pesanan ' . (string) $o->ORDERNO, 'qty' => 1, 'price' => $subtotal, 'amount' => $subtotal];
        }

        $addr = trim((string) ($o->ADDRESS ?? ''));
        if (trim((string) ($o->CITY ?? '')) !== '') {
            $addr .= ($addr !== '' ? ', ' : '') . trim((string) $o->CITY);
        }

        return ['ok' => true, 'calc' => [
            'subtotal' => $subtotal, 'discount' => 0, 'promocode' => '',
            'promoid' => 0, 'email' => trim((string) ($o->BUYEREMAIL ?? '')), 'service' => 0,
            'shipping' => $shipping, 'total' => $total, 'platform' => $platform, 'owner' => $owner,
            'eventId' => null, 'sellerId' => (int) $o->SELLERID,
            'recipient' => (string) ($o->BUYERNAME ?? '-'),
            'address' => $addr,
            'orderno' => (string) $o->ORDERNO,
            'lines' => $lines,
        ]];
    }

    // Hitung IKLAN dari kampanye + aktivasi (banner + kapasitas) di sini.
    private static function calcIklan(int $refId, array $p, string $paidAt, string $actor): array
    {
        $cp = DB::selectOne("SELECT CAMPAIGNID, TITLE, ADVERTISER, CONTACT, LINKTYPE, EVENTID, TOTALCOST FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$refId]);
        if (!$cp) {
            return ['ok' => false, 'message' => 'Data kampanye tidak ditemukan.'];
        }
        if (strtoupper(trim((string) ($cp->STATUS ?? ''))) !== 'MENUNGGU_BAYAR') {
            return ['ok' => false, 'message' => 'Kampanye tidak dalam status menunggu bayar.'];
        }
        $total = Money::r($cp->TOTALCOST);
        $eventId = strtoupper(trim((string) $cp->LINKTYPE)) === 'EVENT' && !empty($cp->EVENTID) ? (int) $cp->EVENTID : null;

        return ['ok' => true, 'calc' => [
            'subtotal' => $total, 'discount' => 0, 'promocode' => '',
            'promoid' => 0, 'email' => '', 'service' => 0,
            'shipping' => 0, 'total' => $total, 'platform' => 0, 'owner' => 0,
            'eventId' => $eventId, 'sellerId' => null,
            'recipient' => (string) ($cp->ADVERTISER ?? '-'),
            'address' => trim((string) ($cp->CONTACT ?? '')),
            'lines' => [[
                'desc' => 'Iklan: ' . (string) $cp->TITLE, 'qty' => 1, 'price' => $total, 'amount' => $total,
            ]],
        ]];
    }

    // Hitung IKLAN baca-saja untuk pratinjau (tanpa aktivasi).
    private static function calcIklanPreview(int $refId): array
    {
        $cp = DB::selectOne("SELECT CAMPAIGNID, TITLE, ADVERTISER, CONTACT, LINKTYPE, EVENTID, TOTALCOST, STATUS, BANNERIMAGE FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$refId]);
        if (!$cp) {
            return ['ok' => false, 'message' => 'Data kampanye tidak ditemukan.'];
        }
        if (strtoupper(trim((string) $cp->STATUS)) !== 'MENUNGGU_BAYAR') {
            return ['ok' => false, 'message' => 'Hanya kampanye MENUNGGU_BAYAR yang bisa dibayar.'];
        }
        if (empty($cp->BANNERIMAGE)) {
            return ['ok' => false, 'message' => 'Upload banner dulu sebelum pembayaran dicatat.'];
        }

        $total = Money::r($cp->TOTALCOST);
        $eventId = strtoupper(trim((string) $cp->LINKTYPE)) === 'EVENT' && !empty($cp->EVENTID) ? (int) $cp->EVENTID : null;

        return ['ok' => true, 'calc' => [
            'subtotal' => $total, 'discount' => 0, 'promocode' => '',
            'promoid' => 0, 'email' => '', 'service' => 0,
            'shipping' => 0, 'total' => $total, 'platform' => 0, 'owner' => 0,
            'eventId' => $eventId, 'sellerId' => null,
            'recipient' => (string) ($cp->ADVERTISER ?? '-'),
            'address' => trim((string) ($cp->CONTACT ?? '')),
            'lines' => [[
                'desc' => 'Iklan: ' . (string) $cp->TITLE, 'qty' => 1, 'price' => $total, 'amount' => $total,
            ]],
        ]];
    }

    // Waktu bayar: datetime valid, tidak di masa depan lebih dari 1 hari.
    private static function parsePaidAt($raw): ?string
    {
        if ($raw === null || trim((string) $raw) === '') {
            return date('Y-m-d H:i:s');
        }
        $ts = strtotime(trim((string) $raw));
        if ($ts === false) {
            return null;
        }
        if ($ts > time() + 86400) {
            return null;
        }
        return date('Y-m-d H:i:s', $ts);
    }

    // --------------------------------------------------------------- refund
    // Sisa yang bisa dikembalikan: TIKET = subtotal-diskon-sudah (biaya
    // layanan tidak dikembalikan); MERCH = total-sudah (termasuk ongkir).
    public static function remaining(int $paymentId): int
    {
        $pay = DB::selectOne("SELECT * FROM T_PAYMENT WHERE PAYMENTID = ?", [$paymentId]);
        if (!$pay || strtoupper(trim((string) $pay->STATUS)) !== 'BERHASIL') {
            return 0;
        }
        $done = DB::selectOne("SELECT ISNULL(SUM(AMOUNT), 0) AS S FROM T_PAYMENT_REFUND WHERE PAYMENTID = ?", [$paymentId]);
        $used = $done ? Money::r($done->S) : 0;
        if (strtoupper(trim((string) $pay->REFTYPE)) === 'MERCH') {
            return max(0, Money::r($pay->TOTALPAID) - $used);
        }
        return max(0, Money::r($pay->SUBTOTAL) - Money::r($pay->DISCOUNT) - $used);
    }

    // Catat refund (dipanggil halaman lain: REFUND_TIKET / BATAL_MERCH).
    // $p: PAYMENTID, AMOUNT, REFUNDTYPE, REFID, ACTOR.
    public static function refund(array $p): array
    {
        $payId = (int) ($p['PAYMENTID'] ?? 0);
        $amount = Money::r($p['AMOUNT'] ?? 0);
        $rtype = strtoupper(trim((string) ($p['REFUNDTYPE'] ?? '')));
        $refId = (int) ($p['REFID'] ?? 0);
        $actor = mb_substr(trim((string) ($p['ACTOR'] ?? '')), 0, 25);

        if ($payId <= 0 || $amount <= 0) {
            return ['ok' => false, 'message' => 'Nominal refund tidak valid.'];
        }
        if (($rtype !== 'REFUND_TIKET' && $rtype !== 'BATAL_MERCH') || $refId <= 0) {
            return ['ok' => false, 'message' => 'Jenis atau referensi refund tidak valid.'];
        }

        try {
            return DB::transaction(function () use ($payId, $amount, $rtype, $refId, $actor) {
                $pay = DB::selectOne("
                    SELECT * FROM T_PAYMENT WITH (UPDLOCK, ROWLOCK)
                    WHERE PAYMENTID = ?
                ", [$payId]);
                if (!$pay || strtoupper(trim((string) $pay->STATUS)) !== 'BERHASIL') {
                    return ['ok' => false, 'message' => 'Pembayaran tidak dalam status BERHASIL.'];
                }
                $left = self::remaining($payId);
                if ($amount > $left) {
                    return ['ok' => false, 'message' => 'Nominal melebihi sisa yang bisa dikembalikan (' . Money::rp($left) . ').'];
                }

                DB::insert("
                    INSERT INTO T_PAYMENT_REFUND
                        (PAYMENTID, AMOUNT, REFUNDTIME, REFUNDTYPE, REFID, ACTOR)
                    VALUES (?, ?, GETDATE(), ?, ?, ?)
                ", [$payId, $amount, $rtype, $refId, $actor !== '' ? $actor : null]);

                // Buku besar MERCH: di bucket tempat dana berada, dibatasi net
                // bucket (selisih biaya platform ditanggung platform, tak
                // membebani penjual). Uang pembeli tercatat penuh di refund.
                if (strtoupper(trim((string) $pay->REFTYPE)) === 'MERCH' && $pay->REFID) {
                    $order = DB::selectOne("SELECT ORDERSTATUS FROM T_MERCH_ORDER WHERE ORDERID = ?", [(int) $pay->REFID]);
                    $st = $order ? strtoupper(trim((string) $order->ORDERSTATUS)) : 'BARU';
                    $bucket = $st === 'SELESAI' ? 'AVAILABLE' : 'PENDING';
                    $net = LedgerService::bucketNet('ORDER', (int) $pay->REFID, $bucket);
                    $leg = min($amount, max(0, $net));
                    if ($leg > 0) {
                        LedgerService::add([
                            'SELLERID' => (int) $pay->SELLERID, 'BUCKET' => $bucket, 'ENTRYTYPE' => 'REFUND',
                            'AMOUNT' => -$leg, 'REFTYPE' => 'ORDER', 'REFID' => (int) $pay->REFID,
                            'NOTE' => 'Refund ' . (string) $pay->PAYNO, 'ACTOR' => $actor,
                        ]);
                    }
                }

                return ['ok' => true, 'message' => 'Refund ' . Money::rp($amount) . ' tercatat.'];
            });
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mpayment', 'Gagal mencatat refund.', [], $e);
            return ['ok' => false, 'message' => 'Gagal mencatat refund, coba lagi.'];
        }
    }

    // ---------------------------------------------------------------- batal
    // Batalkan pembayaran (koreksi salah catat, alasan wajib). Di luar kondisi
    // yang diizinkan -> tolak dan arahkan ke proses refund.
    // $p: PAYMENTID, REASON, ACTOR.
    public static function cancel(array $p): array
    {
        $payId = (int) ($p['PAYMENTID'] ?? 0);
        $reason = mb_substr(trim((string) ($p['REASON'] ?? '')), 0, 200);
        $actor = mb_substr(trim((string) ($p['ACTOR'] ?? '')), 0, 25);

        if ($payId <= 0) {
            return ['ok' => false, 'message' => 'PAYMENTID tidak ditemukan.'];
        }
        if ($reason === '') {
            return ['ok' => false, 'message' => 'Alasan pembatalan wajib diisi.'];
        }

        try {
            return DB::transaction(function () use ($payId, $reason, $actor) {
                $pay = DB::selectOne("
                    SELECT * FROM T_PAYMENT WITH (UPDLOCK, ROWLOCK)
                    WHERE PAYMENTID = ?
                ", [$payId]);
                if (!$pay) {
                    return ['ok' => false, 'message' => 'Data pembayaran tidak ditemukan.'];
                }
                if (strtoupper(trim((string) $pay->STATUS)) !== 'BERHASIL') {
                    return ['ok' => false, 'message' => 'Hanya pembayaran BERHASIL yang bisa dibatalkan.'];
                }
                $hasRefund = DB::selectOne("SELECT COUNT(*) AS C FROM T_PAYMENT_REFUND WHERE PAYMENTID = ?", [$payId]);
                if ($hasRefund && (int) $hasRefund->C > 0) {
                    return ['ok' => false, 'message' => 'Sudah ada refund tercatat, gunakan proses refund.'];
                }

                $type = strtoupper(trim((string) $pay->REFTYPE));
                $refId = (int) $pay->REFID;

                if ($type === 'TIKET') {
                    $a = DB::selectOne("
                        SELECT ATTENDEEID, EVENTID, PAYSTATUS, ATTENDSTATUS, TIKETSTATUS
                        FROM T_ATTENDEE WITH (UPDLOCK, ROWLOCK) WHERE ATTENDEEID = ?
                    ", [$refId]);
                    if (!$a || strtoupper(trim((string) $a->PAYSTATUS)) !== 'LUNAS') {
                        return ['ok' => false, 'message' => 'Status peserta tidak LUNAS.'];
                    }
                    if (strtoupper(trim((string) $a->ATTENDSTATUS)) === 'HADIR') {
                        return ['ok' => false, 'message' => 'Peserta sudah HADIR, gunakan proses refund.'];
                    }
                    // Event yang sudah payout (aktif/berhasil) -> refund, bukan batal.
                    if (self::eventPaidOut((int) $a->EVENTID)) {
                        return ['ok' => false, 'message' => 'Event sudah ada payout aktif/berhasil, gunakan proses refund.'];
                    }
                    DB::update("
                        UPDATE T_ATTENDEE
                        SET PAYSTATUS = 'BELUM_BAYAR', SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                        WHERE ATTENDEEID = ?
                    ", [$actor !== '' ? $actor : null, $refId]);
                    // Pemakaian promo dibatalkan (kuota kembali).
                    if ($pay->PROMOCODE) {
                        self::revertPromoUsage((string) $pay->PAYNO);
                    }
                } elseif ($type === 'MERCH') {
                    $o = DB::selectOne("
                        SELECT ORDERID, ORDERSTATUS, PAYSTATUS, SELLERID FROM T_MERCH_ORDER WITH (UPDLOCK, ROWLOCK)
                        WHERE ORDERID = ?
                    ", [$refId]);
                    if (!$o || strtoupper(trim((string) $o->PAYSTATUS)) !== 'LUNAS') {
                        return ['ok' => false, 'message' => 'Status pesanan tidak LUNAS.'];
                    }
                    $st = strtoupper(trim((string) $o->ORDERSTATUS));
                    if ($st !== 'BARU' && $st !== 'DIPROSES') {
                        return ['ok' => false, 'message' => 'Pesanan sudah ' . strtolower($st) . ', gunakan proses refund/pengembalian.'];
                    }
                    if (LedgerService::entryCount('RELEASE', 'ORDER', $refId) > 0) {
                        return ['ok' => false, 'message' => 'Dana sudah dilepas ke penjual, gunakan proses pengembalian.'];
                    }
                    DB::update("
                        UPDATE T_MERCH_ORDER
                        SET PAYSTATUS = 'BELUM_BAYAR', PAIDAT = NULL,
                            SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                        WHERE ORDERID = ?
                    ", [$actor !== '' ? $actor : null, $refId]);
                    // Lawan SALE di PENDING (dana belum dilepas).
                    $held = self::orderHeld($refId);
                    if ($held > 0) {
                        LedgerService::add([
                            'SELLERID' => (int) $o->SELLERID, 'BUCKET' => 'PENDING', 'ENTRYTYPE' => 'REVERSAL',
                            'AMOUNT' => -$held, 'REFTYPE' => 'ORDER', 'REFID' => $refId,
                            'NOTE' => 'Batal bayar ' . (string) $pay->PAYNO, 'ACTOR' => $actor,
                        ]);
                    }
                } else {
                    $cp = DB::selectOne("SELECT CAMPAIGNID, STATUS, STARTDATE FROM T_AD_CAMPAIGN WITH (UPDLOCK, ROWLOCK) WHERE CAMPAIGNID = ?", [$refId]);
                    if (!$cp) {
                        return ['ok' => false, 'message' => 'Data kampanye tidak ditemukan.'];
                    }
                    $cst = strtoupper(trim((string) $cp->STATUS));
                    if ($cst === 'AKTIF' || $cst === 'DIJEDA') {
                        $today = date('Y-m-d');
                        if (substr((string) $cp->STARTDATE, 0, 10) <= $today) {
                            return ['ok' => false, 'message' => 'Iklan sudah mulai tayang, pembatalan tidak bisa.'];
                        }
                    }
                    if ($cst === 'AKTIF' || $cst === 'DIJEDA') {
                        DB::update("
                            UPDATE T_AD_CAMPAIGN
                            SET STATUS = 'MENUNGGU_BAYAR', PAIDAT = NULL,
                                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                            WHERE CAMPAIGNID = ?
                        ", [$actor !== '' ? $actor : null, $refId]);
                    }
                }

                DB::update("
                    UPDATE T_PAYMENT
                    SET STATUS = 'DIBATALKAN', CANCELREASON = ?, CANCELBY = ?, CANCELAT = GETDATE(),
                        SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                    WHERE PAYMENTID = ?
                ", [$reason, $actor !== '' ? $actor : null, $actor !== '' ? $actor : null, $payId]);
                InvoiceService::cancelByPayment($payId, $reason, $actor);

                return ['ok' => true, 'message' => 'Pembayaran ' . (string) $pay->PAYNO . ' dibatalkan.'];
            });
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mpayment', 'Gagal membatalkan pembayaran.', [], $e);
            return ['ok' => false, 'message' => 'Gagal membatalkan pembayaran, coba lagi.'];
        }
    }

    // Batalkan pemakaian promo milik pembayaran ini (inline, dalam transaksi
    // pemanggil). Dicocokkan lewat REFERENCENO = nomor pembayaran.
    private static function revertPromoUsage(string $payNo): void
    {
        if ($payNo === '') {
            return;
        }
        $use = DB::selectOne("
            SELECT USAGEID FROM T_PROMO_USAGE WITH (UPDLOCK, HOLDLOCK)
            WHERE REFERENCENO = ? AND STATUS = 'DIPAKAI'
        ", [$payNo]);
        if ($use) {
            DB::update("UPDATE T_PROMO_USAGE SET STATUS = 'DIBATALKAN' WHERE USAGEID = ?", [(int) $use->USAGEID]);
        }
    }

    // True bila event punya payout DIAJUKAN/DIPROSES/BERHASIL (tahan batal).
    // T_PAYOUT belum ada (H6) -> OBJECT_ID guard, selalu false untuk sekarang.
    private static function eventPaidOut(int $eventId): bool
    {
        $exists = DB::selectOne(
            "SELECT 1 AS X FROM sys.objects WHERE object_id = OBJECT_ID('dbo.T_PAYOUT') AND type = 'U'"
        );
        if (!$exists || $eventId <= 0) {
            return false;
        }
        $hit = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_PAYOUT
            WHERE EVENTID = ? AND STATUS IN ('DIAJUKAN', 'DIPROSES', 'BERHASIL')
        ", [$eventId]);
        return $hit && (int) $hit->C > 0;
    }

    // Dana tertahan satu pesanan = NET PENDING (SALE dikurangi refund
    // parsial). Dipakai pelepasan/pengembalian.
    public static function orderHeld(int $orderId): int
    {
        return max(0, LedgerService::bucketNet('ORDER', $orderId, 'PENDING'));
    }

    // ------------------------------------------------- gerak dana merchandise
    // Pelepasan saat SELESAI (manual/otomatis): PENDING -> AVAILABLE, sekali
    // per pesanan. Return ['ok','message','released'=>bool].
    public static function releaseOrder(int $orderId, string $actor): array
    {
        try {
            return DB::transaction(function () use ($orderId, $actor) {
                $o = DB::selectOne("
                    SELECT ORDERID, ORDERNO, SELLERID, ORDERSTATUS FROM T_MERCH_ORDER WITH (UPDLOCK, ROWLOCK)
                    WHERE ORDERID = ?
                ", [$orderId]);
                if (!$o) {
                    return ['ok' => false, 'message' => 'Data pesanan tidak ditemukan.'];
                }
                if (LedgerService::entryCount('RELEASE', 'ORDER', $orderId) > 0) {
                    return ['ok' => true, 'message' => 'Dana sudah dilepas sebelumnya.', 'released' => false];
                }
                $held = self::orderHeld($orderId);
                if ($held <= 0) {
                    return ['ok' => true, 'message' => 'Tidak ada dana tertahan untuk dilepas.', 'released' => false];
                }
                LedgerService::add([
                    'SELLERID' => (int) $o->SELLERID, 'BUCKET' => 'PENDING', 'ENTRYTYPE' => 'RELEASE',
                    'AMOUNT' => -$held, 'REFTYPE' => 'ORDER', 'REFID' => $orderId,
                    'NOTE' => 'Lepas ' . (string) $o->ORDERNO, 'ACTOR' => $actor,
                ]);
                LedgerService::add([
                    'SELLERID' => (int) $o->SELLERID, 'BUCKET' => 'AVAILABLE', 'ENTRYTYPE' => 'RELEASE',
                    'AMOUNT' => $held, 'REFTYPE' => 'ORDER', 'REFID' => $orderId,
                    'NOTE' => 'Lepas ' . (string) $o->ORDERNO, 'ACTOR' => $actor,
                ]);
                return ['ok' => true, 'message' => 'Dana ' . Money::rp($held) . ' dilepas ke tersedia.', 'released' => true];
            });
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mpayment', 'Gagal melepas dana pesanan.', [], $e);
            return ['ok' => false, 'message' => 'Gagal melepas dana, coba lagi.'];
        }
    }

    // Batal setelah LUNAS sebelum SELESAI: kembalikan dari PENDING (sekali).
    public static function reversePending(int $orderId, string $actor, string $note = ''): array
    {
        try {
            return DB::transaction(function () use ($orderId, $actor, $note) {
                $o = DB::selectOne("SELECT ORDERID, ORDERNO, SELLERID FROM T_MERCH_ORDER WHERE ORDERID = ?", [$orderId]);
                if (!$o) {
                    return ['ok' => false, 'message' => 'Data pesanan tidak ditemukan.'];
                }
                if (LedgerService::entryCount('REVERSAL', 'ORDER', $orderId) > 0) {
                    return ['ok' => true, 'message' => 'Dana sudah dikembalikan sebelumnya.'];
                }
                $held = self::orderHeld($orderId);
                if ($held > 0) {
                    LedgerService::add([
                        'SELLERID' => (int) $o->SELLERID, 'BUCKET' => 'PENDING', 'ENTRYTYPE' => 'REVERSAL',
                        'AMOUNT' => -$held, 'REFTYPE' => 'ORDER', 'REFID' => $orderId,
                        'NOTE' => $note !== '' ? $note : ('Batal ' . (string) $o->ORDERNO), 'ACTOR' => $actor,
                    ]);
                }
                return ['ok' => true, 'message' => 'Dana tertahan dikembalikan.'];
            });
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'mpayment', 'Gagal mengembalikan dana tertahan.', [], $e);
            return ['ok' => false, 'message' => 'Gagal mengembalikan dana, coba lagi.'];
        }
    }
}
