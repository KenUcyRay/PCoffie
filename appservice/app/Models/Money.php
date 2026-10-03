<?php

namespace App\Models;

// Uang pusat Finance: SEMUA perhitungan dalam rupiah penuh (integer).
// Jangan floating point untuk uang. NUMERIC(18,2) di DB diisi nilai bulat.
//
// Konvensi: fungsi terima int|numeric-string, kembalikan int (rupiah penuh,
// dibulatkan half-up). Untuk binding ke NUMERIC(18,2), int boleh langsung.
class Money
{
    // Bulatkan ke rupiah penuh (half-up). Null/bukan-angka -> 0.
    // Hati-hati: "50000.00" (desimal DB) = 50000; "150.000" (ribuan id-ID)
    // = 150000; "1.234.567,89" = 1234568.
    public static function r($v): int
    {
        if ($v === null || $v === '') {
            return 0;
        }
        if (is_int($v) || is_float($v)) {
            return (int) round($v, 0, PHP_ROUND_HALF_UP);
        }
        $s = str_replace(['Rp', 'rp', ' '], '', trim((string) $v));
        if ($s === '') {
            return 0;
        }
        // Pola ribuan id-ID murni (1-3 digit + grup .000) -> buang titik.
        if (preg_match('/^\d{1,3}(\.\d{3})+$/', $s)) {
            $s = str_replace('.', '', $s);
        }
        if (is_numeric($s)) {
            return (int) round((float) $s, 0, PHP_ROUND_HALF_UP);
        }
        // Desimal koma id-ID: titik = ribuan, koma = desimal.
        if (strpos($s, ',') !== false) {
            $t = str_replace('.', '', $s);
            $t = str_replace(',', '.', $t);
            if (is_numeric($t)) {
                return (int) round((float) $t, 0, PHP_ROUND_HALF_UP);
            }
        }
        return 0;
    }

    // Persen dari dasar: round(base * pct / 100). pct mis. 5 atau 5.00.
    public static function pct(int $base, $pct): int
    {
        if ($base <= 0) {
            return 0;
        }
        $p = is_numeric($pct) ? (float) $pct : 0.0;
        if ($p <= 0) {
            return 0;
        }
        return (int) round($base * $p / 100.0, 0, PHP_ROUND_HALF_UP);
    }

    // Biaya platform = pct * dasar + fix, dibatasi tidak melebihi dasar.
    public static function platformFee(int $base, $pct, $fix): int
    {
        if ($base <= 0) {
            return 0;
        }
        $fee = self::pct($base, $pct) + self::r($fix);
        if ($fee < 0) {
            $fee = 0;
        }
        if ($fee > $base) {
            $fee = $base;
        }
        return $fee;
    }

    // Format Rupiah Indonesia, mis. 150000 -> Rp150.000 (negatif: -Rp...).
    public static function rp(int $v): string
    {
        $neg = $v < 0 ? '-' : '';
        return $neg . 'Rp' . number_format(abs($v), 0, ',', '.');
    }
}
