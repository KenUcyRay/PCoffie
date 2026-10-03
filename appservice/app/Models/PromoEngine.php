<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Mesin validasi + hitung promo untuk module lain (tanpa halaman).
// Dipakai juga oleh Mmpromocode (uji kode, catat/batal pemakaian).
//
// Cara pakai dari module lain (contoh: saat bayar order tiket):
//   $r = \App\Models\PromoEngine::check('HEMAT10', $eventid, 150000.0, 'budi@contoh.test');
//   if ($r['ok']) { $diskon = (float) $r['discount']; ...catat... }
//   \App\Models\PromoEngine::record($r['promoid'], $eventid, 'budi@contoh.test', 150000.0, $diskon);
//   // bila order dibatalkan:
//   \App\Models\PromoEngine::revert($r['promoid'], 'budi@contoh.test');
//
// Alasan penolakan: KODE_TIDAK_ADA, NONAKTIF, BELUM_BERLAKU, KEDALUWARSA,
// KUOTA_HABIS, BATAS_PEMBELI_TERCAPAI, DI_BAWAH_MINIMUM, CAKUPAN_TIDAK_SESUAI.
class PromoEngine
{
    // Jumlah terpakai (DIPAKAI) satu promo.
    public static function usedCount(int $promoid): int
    {
        try {
            $row = DB::selectOne("
                SELECT COUNT(*) AS C FROM T_PROMO_USAGE
                WHERE PROMOID = ? AND STATUS = 'DIPAKAI'
            ", [$promoid]);
            return $row ? (int) $row->C : 0;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    // Jumlah dipakai satu email pada satu promo.
    public static function buyerCount(int $promoid, string $email): int
    {
        try {
            $row = DB::selectOne("
                SELECT COUNT(*) AS C FROM T_PROMO_USAGE
                WHERE PROMOID = ? AND UPPER(BUYEREMAIL) = UPPER(?)
                  AND STATUS = 'DIPAKAI'
            ", [$promoid, trim($email)]);
            return $row ? (int) $row->C : 0;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    // Validasi + hitung potongan. Return ['ok'=>bool,'reason'=>string,
    // 'discount'=>string,'promoid'=>int]. reason '' bila ok.
    public static function check(string $code, $eventid, $amount, string $email): array
    {
        $no = ['ok' => false, 'reason' => '', 'discount' => '0', 'promoid' => 0];
        try {
            $code = strtoupper(trim($code));
            $amount = (float) $amount;
            if ($code === '') {
                $no['reason'] = 'KODE_TIDAK_ADA';
                return $no;
            }
            $p = DB::selectOne("SELECT * FROM T_PROMO WHERE UPPER(PROMOCODE) = UPPER(?)", [$code]);
            if (!$p) {
                $no['reason'] = 'KODE_TIDAK_ADA';
                return $no;
            }
            $no['promoid'] = (int) $p->PROMOID;
            if (strtoupper(trim((string) $p->ISACTIVE)) !== 'YES') {
                $no['reason'] = 'NONAKTIF';
                return $no;
            }
            $now = time();
            if (!empty($p->STARTAT) && $now < strtotime((string) $p->STARTAT)) {
                $no['reason'] = 'BELUM_BERLAKU';
                return $no;
            }
            if (!empty($p->ENDAT) && $now > strtotime((string) $p->ENDAT)) {
                $no['reason'] = 'KEDALUWARSA';
                return $no;
            }
            if ($p->QUOTA !== null && (int) $p->QUOTA > 0 && self::usedCount((int) $p->PROMOID) >= (int) $p->QUOTA) {
                $no['reason'] = 'KUOTA_HABIS';
                return $no;
            }
            $maxBuyer = max(1, (int) ($p->MAXPERBUYER ?? 1));
            if (trim($email) !== '' && self::buyerCount((int) $p->PROMOID, $email) >= $maxBuyer) {
                $no['reason'] = 'BATAS_PEMBELI_TERCAPAI';
                return $no;
            }
            if ($amount < (float) ($p->MINPURCHASE ?? 0)) {
                $no['reason'] = 'DI_BAWAH_MINIMUM';
                return $no;
            }
            // Cakupan: SEMUA lolos; KATEGORI/EVENT cocokkan target.
            $scope = strtoupper(trim((string) ($p->SCOPETYPE ?? 'SEMUA')));
            if ($scope === 'KATEGORI' || $scope === 'EVENT') {
                $ev = DB::selectOne("SELECT EVENTID, CATCODE FROM T_EVENT WHERE EVENTID = ?", [(int) $eventid]);
                if (!$ev) {
                    $no['reason'] = 'CAKUPAN_TIDAK_SESUAI';
                    return $no;
                }
                $col = $scope === 'KATEGORI' ? (string) ($ev->CATCODE ?? '') : (string) ($ev->EVENTCODE ?? '');
                if ($scope === 'EVENT') {
                    $evc = DB::selectOne("SELECT EVENTCODE FROM T_EVENT WHERE EVENTID = ?", [(int) $eventid]);
                    $col = $evc ? (string) $evc->EVENTCODE : '';
                }
                $hit = DB::selectOne("
                    SELECT 1 AS X FROM T_PROMO_SCOPE
                    WHERE PROMOID = ? AND TARGETTYPE = ? AND UPPER(TARGETCODE) = UPPER(?)
                ", [(int) $p->PROMOID, $scope, $col]);
                if (!$hit) {
                    $no['reason'] = 'CAKUPAN_TIDAK_SESUAI';
                    return $no;
                }
            }

            // Hitung potongan (PERSEN dibatasi maksimum; tak melebihi nominal).
            $disc = 0.0;
            if (strtoupper(trim((string) $p->DISCTYPE)) === 'PERSEN') {
                $disc = $amount * ((float) $p->DISCVALUE) / 100.0;
                if ($p->MAXDISC !== null && (float) $p->MAXDISC > 0) {
                    $disc = min($disc, (float) $p->MAXDISC);
                }
            } else {
                $disc = (float) $p->DISCVALUE;
            }
            $disc = min(max(0.0, $disc), max(0.0, $amount));

            return ['ok' => true, 'reason' => '', 'discount' => number_format($disc, 2, '.', ''), 'promoid' => (int) $p->PROMOID];
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal validasi promo.', ['code' => $code], $e);
            $no['reason'] = 'KODE_TIDAK_ADA';
            return $no;
        }
    }

    // Catat pemakaian (kunci kuota: cek + tulis dalam transaksi pemanggil
    // bila perlu; di sini cek ulang kuota + batas pembeli sebelum tulis).
    // Return true bila tercatat.
    public static function record(int $promoid, $eventid, string $email, $before, $discount, string $ref = ''): bool
    {
        try {
            $pdo = DB::getPdo();
            $pdo->beginTransaction();

            $p = DB::selectOne("
                SELECT PROMOID, QUOTA, MAXPERBUYER FROM T_PROMO WITH (UPDLOCK, HOLDLOCK)
                WHERE PROMOID = ?
            ", [$promoid]);
            if (!$p) {
                $pdo->rollBack();
                return false;
            }
            if ($p->QUOTA !== null && (int) $p->QUOTA > 0 && self::usedCount($promoid) >= (int) $p->QUOTA) {
                $pdo->rollBack();
                return false;
            }
            $maxBuyer = max(1, (int) ($p->MAXPERBUYER ?? 1));
            if (trim($email) !== '' && self::buyerCount($promoid, $email) >= $maxBuyer) {
                $pdo->rollBack();
                return false;
            }

            DB::insert("
                INSERT INTO T_PROMO_USAGE
                    (PROMOID, EVENTID, BUYEREMAIL, BEFOREAMOUNT, DISCAMOUNT,
                     USEDATETIME, STATUS, REFERENCENO)
                VALUES (?, ?, ?, ?, ?,
                     GETDATE(), 'DIPAKAI', ?)
            ", [
                $promoid, $eventid ? (int) $eventid : null,
                mb_substr(trim($email), 0, 100),
                (float) $before, (float) $discount,
                $ref !== '' ? mb_substr($ref, 0, 50) : null,
            ]);

            $pdo->commit();
            return true;
        } catch (\Throwable $e) {
            try {
                DB::getPdo()->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal mencatat pemakaian promo.', [], $e);
            return false;
        }
    }

    // Batalkan SATU pemakaian terakhir (DIPAKAI -> DIBATALKAN). Return true
    // bila ada yang dibatalkan. Kuota kembali karena hitungan hanya DIPAKAI.
    public static function revert(int $promoid, string $email): bool
    {
        try {
            $row = DB::selectOne("
                SELECT TOP 1 USAGEID FROM T_PROMO_USAGE
                WHERE PROMOID = ? AND UPPER(BUYEREMAIL) = UPPER(?)
                  AND STATUS = 'DIPAKAI'
                ORDER BY USEDATETIME DESC, USAGEID DESC
            ", [$promoid, trim($email)]);
            if (!$row) {
                return false;
            }
            DB::update("
                UPDATE T_PROMO_USAGE SET STATUS = 'DIBATALKAN' WHERE USAGEID = ?
            ", [(int) $row->USAGEID]);
            return true;
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal membatalkan pemakaian promo.', [], $e);
            return false;
        }
    }
}
