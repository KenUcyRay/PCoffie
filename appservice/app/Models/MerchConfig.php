<?php

namespace App\Models;

// Konfigurasi merchandise terpusat (satu tempat, mudah diubah).
// Angka batas via env (ikut pola REFUND_DEADLINE_HOURS); daftar tetap
// (kategori, kurir, alasan keluhan) sebagai konstanta tervalidasi.
//
// Env (appservice/.env):
//   MERCH_PAY_DEADLINE_HOURS=24  (batas bayar sejak pesanan dibuat)
//   MERCH_SHIP_DEADLINE_DAYS=3   (batas kirim sejak LUNAS)
//   MERCH_AUTO_DONE_DAYS=7        (auto-SELESAI sejak dikirim)
//   MERCH_COMPLAINT_DAYS=7        (batas keluhan sejak dikirim/selesai)
//   MERCH_LOW_STOCK=5             (batas stok menipis)
class MerchConfig
{
    const CATEGORIES = [
        'Lightstick', 'Photocard', 'Figure', 'Apparel',
        'Poster', 'Aksesori', 'Lainnya',
    ];

    const COURIERS = [
        'JNE', 'J&T', 'SiCepat', 'AnterAja', 'Pos Indonesia', 'Lainnya',
    ];

    const COMPLAINT_REASONS = [
        'BARANG_RUSAK', 'TIDAK_SESUAI', 'TIDAK_DITERIMA', 'LAINNYA',
    ];

    private static function envInt(string $key, int $def): int
    {
        try {
            $v = getenv($key);
            if (($v === false || $v === '') && function_exists('env')) {
                $v = env($key, $def);
            }
            $n = (int) $v;
            return $n > 0 ? $n : $def;
        } catch (\Throwable $e) {
            return $def;
        }
    }

    public static function payDeadlineHours(): int
    {
        return self::envInt('MERCH_PAY_DEADLINE_HOURS', 24);
    }

    public static function shipDeadlineDays(): int
    {
        return self::envInt('MERCH_SHIP_DEADLINE_DAYS', 3);
    }

    public static function autoDoneDays(): int
    {
        return self::envInt('MERCH_AUTO_DONE_DAYS', 7);
    }

    public static function complaintDays(): int
    {
        return self::envInt('MERCH_COMPLAINT_DAYS', 7);
    }

    public static function lowStock(): int
    {
        return self::envInt('MERCH_LOW_STOCK', 5);
    }

    // Samarkan data pembeli untuk Audit Log (sebagian, tanpa nilai penuh).
    // Return [nama, telepon, alamat].
    public static function maskBuyer(?string $name, ?string $phone, ?string $address): array
    {
        $n = trim((string) $name);
        $p = trim((string) $phone);
        $a = trim((string) $address);
        $mn = $n !== '' && mb_strlen($n) > 3 ? mb_substr($n, 0, 3) . '****' : '****';
        $mp = strlen($p) > 6 ? substr($p, 0, 4) . '****' . substr($p, -2) : '****';
        $ma = $a !== '' && mb_strlen($a) > 10 ? mb_substr($a, 0, 10) . '****' : '****';
        return [$mn, $mp, $ma];
    }
}
