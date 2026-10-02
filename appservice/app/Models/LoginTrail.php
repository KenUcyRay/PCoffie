<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Pencatat riwayat login pusat (satu-satunya pintu tulis ke T_LOGIN_HISTORY).
//
// Cara pakai dari Mlogin (jangan dari tempat lain):
//   LoginTrail::record('SUCCESS', 'adi');
//   LoginTrail::record('FAILED', 'adi', 'WRONG_PASSWORD');
//   LoginTrail::record('LOGOUT', 'adi');
//
// - Password TIDAK PERNAH disimpan (tidak ada parameternya, tidak ada kolomnya).
// - result: SUCCESS|FAILED|BLOCKED|LOGOUT; reason: WRONG_PASSWORD|USER_NOT_FOUND|
//   INACTIVE|BLOCKED (atau kosong). Selain itu -> ditolak (return tanpa tulis).
// - USERID diisi bila username ketemu di CPUSER (salinan; tetap terbaca walau
//   user dihapus nanti). IP/UA/device/browser/waktu otomatis dari request.
// - Gagal mencatat TIDAK PERNAH menggagalkan login/logout (try/catch + error_log),
//   dan TIDAK memicu pencatatan lagi (tanpa SysLog/AuditTrail di sini).
class LoginTrail
{
    public static function record(string $result, string $typedUser, string $reason = ''): void
    {
        try {
            $result = strtoupper(trim($result));
            if (!in_array($result, ['SUCCESS', 'FAILED', 'BLOCKED', 'LOGOUT'], true)) {
                return;
            }
            $reason = strtoupper(trim($reason));
            if ($reason !== '' && !in_array($reason, ['WRONG_PASSWORD', 'USER_NOT_FOUND', 'INACTIVE', 'BLOCKED'], true)) {
                return;
            }
            // LOGOUT dan SUCCESS tidak pakai alasan.
            if (($result === 'SUCCESS' || $result === 'LOGOUT') && $reason !== '') {
                return;
            }
            // FAILED/BLOCKED tanpa alasan tetap dicatat (alasan boleh kosong).

            $typed = trim($typedUser);
            $user = null;
            if ($typed !== '') {
                $user = DB::selectOne(
                    "SELECT USERID FROM CPUSER WHERE USERLOGIN = ?",
                    [$typed]
                );
            }

            $ip = null;
            $ua = null;
            try {
                if (function_exists('request')) {
                    $req = request();
                    $rip = (string) ($req->ip() ?? '');
                    $ip = $rip !== '' ? mb_substr($rip, 0, 45) : null;
                    $rua = (string) ($req->userAgent() ?? '');
                    $ua = $rua !== '' ? mb_substr($rua, 0, 255) : null;
                }
            } catch (\Throwable $ignored) {
                // CLI / tanpa request HTTP
            }

            [$device, $browser] = self::parseAgent((string) ($ua ?? ''));

            DB::insert("
                INSERT INTO T_LOGIN_HISTORY
                    (TYPEDUSER, USERID, RESULT, FAILREASON, USERIP, USERAGENT, DEVICE, BROWSER)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ", [
                $typed !== '' ? mb_substr($typed, 0, 25) : null,
                $user ? (int) $user->USERID : null,
                $result,
                $reason !== '' ? $reason : null,
                $ip,
                $ua,
                $device,
                $browser,
            ]);
        } catch (\Throwable $e) {
            // Kegagalan mencatat tidak boleh menggagalkan login/logout,
            // dan tidak boleh memicu pencatatan lagi (anti perulangan).
            error_log('[LoginTrail] gagal mencatat: ' . $e->getMessage());
        }
    }

    // Tebak perangkat + browser dari user agent (boleh kosong, best-effort).
    // Return [device, browser], masing-masing string|null.
    public static function parseAgent(string $ua): array
    {
        if ($ua === '') {
            return [null, null];
        }
        $l = strtolower($ua);
        $device = null;
        if (strpos($l, 'mobile') !== false || strpos($l, 'android') !== false || strpos($l, 'iphone') !== false) {
            $device = 'Mobile';
        } elseif (strpos($l, 'tablet') !== false || strpos($l, 'ipad') !== false) {
            $device = 'Tablet';
        } elseif (strpos($l, 'windows') !== false || strpos($l, 'macintosh') !== false || strpos($l, 'linux') !== false) {
            $device = 'Desktop';
        }
        $browser = null;
        if (strpos($l, 'edg/') !== false || strpos($l, 'edge/') !== false) {
            $browser = 'Edge';
        } elseif (strpos($l, 'opr/') !== false || strpos($l, 'opera') !== false) {
            $browser = 'Opera';
        } elseif (strpos($l, 'chrome/') !== false) {
            $browser = 'Chrome';
        } elseif (strpos($l, 'firefox/') !== false || strpos($l, 'fxios/') !== false) {
            $browser = 'Firefox';
        } elseif (strpos($l, 'safari/') !== false) {
            $browser = 'Safari';
        }
        return [$device, $browser];
    }
}
