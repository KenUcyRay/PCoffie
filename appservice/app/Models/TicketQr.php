<?php

namespace App\Models;

// Token QR tiket bertanda tangan digital (HMAC-SHA256).
// Format: v{versi}.{attendeeid}.{ticketcode}.{sig12}
//   - sig = 12 char base64url(HMAC_SHA256(payload, QR_SECRET)) — pendek
//     agar QR mudah dipindai, tidak berurutan, tidak bisa ditebak.
//   - Token TIDAK disimpan (dibuat ulang saat dibutuhkan); QRVERSION di
//     T_ATTENDEE yang menentukan versi berlaku (naik = QR lama mati).
// Kunci dari env QR_SECRET (bukan di kode). Tanpa kunci -> fail-closed.
class TicketQr
{
    private static function secret(): ?string
    {
        try {
            $s = trim((string) (getenv('QR_SECRET') ?: ''));
            if ($s === '' && function_exists('config')) {
                // Lumen: env() terbaca via LoadEnvironmentVariables.
                $s = trim((string) (env('QR_SECRET') ?: ''));
            }
            return $s !== '' ? $s : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private static function b64u(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    // Buat token untuk satu tiket. Return token atau null bila kunci kosong.
    public static function issue(int $attendeeid, string $ticketcode, int $version): ?string
    {
        $key = self::secret();
        if ($key === null) {
            return null;
        }
        $payload = 'v' . max(1, $version) . '.' . $attendeeid . '.' . trim($ticketcode);
        $sig = self::b64u(hash_hmac('sha256', $payload, $key, true));
        return $payload . '.' . substr($sig, 0, 12);
    }

    // Verifikasi token. Return ['ok'=>bool,'attendeeid'=>int,'ticketcode'=>string,
    // 'version'=>int] — ok=false tanpa bocoran detail (TIDAK_VALID generik).
    public static function verify(string $token): array
    {
        $bad = ['ok' => false, 'attendeeid' => 0, 'ticketcode' => '', 'version' => 0];
        $key = self::secret();
        if ($key === null) {
            return $bad;
        }
        $t = trim($token);
        if (!preg_match('/^v(\d{1,3})\.(\d{1,10})\.([A-Za-z0-9\-]{1,30})\.([A-Za-z0-9\-_]{12})$/', $t, $m)) {
            return $bad;
        }
        $payload = 'v' . $m[1] . '.' . $m[2] . '.' . $m[3];
        $expect = substr(self::b64u(hash_hmac('sha256', $payload, $key, true)), 0, 12);
        if (!hash_equals($expect, $m[4])) {
            return $bad;
        }
        return ['ok' => true, 'attendeeid' => (int) $m[2], 'ticketcode' => $m[3], 'version' => (int) $m[1]];
    }
}
