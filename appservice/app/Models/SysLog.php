<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Pencatat system log pusat (satu-satunya pintu tulis ke T_SYSTEM_LOG).
//
// Cara pakai dari kode mana pun:
//   SysLog::log('ERROR', 'API', 'Gagal simpan order', ['order' => $id]);
//
// - level: INFO|WARNING|ERROR|CRITICAL (selain itu -> INFO).
// - source: API|AUTH|DATABASE|JOB (bebas, maks 20 char).
// - $context array (disamarkan pakai AuditTrail::mask) | $e Throwable opsional.
// - user/IP/URL/method/status diambil dari request bila ada (bukan parameter).
// - Gagal mencatat TIDAK PERNAH menggagalkan proses utama dan TIDAK memicu
//   pencatatan lagi: fallback hanya ke error_log() (file), tanpa SysLog ulang.
class SysLog
{
    public static function log(string $level, string $source, string $message, $context = [], $e = null, ?int $httpStatus = null): void
    {
        try {
            $level = strtoupper(trim($level));
            if (!in_array($level, ['INFO', 'WARNING', 'ERROR', 'CRITICAL'], true)) {
                $level = 'INFO';
            }
            $source = strtoupper(substr(trim((string) $source), 0, 20));
            if ($source === '') {
                $source = 'API';
            }

            $ctxJson = null;
            if (!empty($context)) {
                $ctx = is_array($context) ? $context : ['value' => $context];
                $enc = json_encode(AuditTrail::mask($ctx), JSON_UNESCAPED_UNICODE);
                $ctxJson = $enc === false ? null : mb_substr($enc, 0, 8000);
            }

            $stack = null;
            if ($e instanceof \Throwable) {
                $stack = mb_substr(
                    get_class($e) . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString(),
                    0, 8000
                );
            }

            $url = null;
            $method = null;
            $ip = null;
            $login = '';
            try {
                if (function_exists('request')) {
                    $req = request();
                    $full = (string) ($req->fullUrl() ?? '');
                    $url = $full !== '' ? mb_substr($full, 0, 255) : null;
                    $m = strtoupper((string) ($req->method() ?? ''));
                    $method = $m !== '' ? substr($m, 0, 10) : null;
                    $rip = (string) ($req->ip() ?? '');
                    $ip = $rip !== '' ? $rip : null;
                }
            } catch (\Throwable $ignored) {
                // CLI / tanpa request HTTP
            }
            // User login dari JWT (sub) bila ada — tanpa mengganggu request.
            try {
                if (class_exists('Tymon\JWTAuth\Facades\JWTAuth')) {
                    $payload = \Tymon\JWTAuth\Facades\JWTAuth::parseToken()->getPayload()->toArray();
                    if (!empty($payload['sub'])) {
                        $login = (string) $payload['sub'];
                    }
                }
            } catch (\Throwable $ignored) {
                // tanpa token / token invalid: biarkan kosong
            }

            $user = null;
            if ($login !== '') {
                $user = DB::selectOne(
                    "SELECT USERID, USERNAME FROM CPUSER WHERE USERLOGIN = ?",
                    [$login]
                );
            }

            DB::insert("
                INSERT INTO T_SYSTEM_LOG
                    (LOGLEVEL, LOGSOURCE, MESSAGE, CONTEXTJSON, STACKTRACE,
                     URL, METHOD, HTTPSTATUS, USERID, USERLOGIN, USERIP)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ", [
                $level,
                $source !== '' ? $source : null,
                mb_substr($message, 0, 500),
                $ctxJson,
                $stack,
                $url,
                $method,
                $httpStatus,
                $user ? (int) $user->USERID : null,
                $login !== '' ? $login : null,
                $ip,
            ]);
        } catch (\Throwable $ex) {
            // Fallback ke file saja — JANGAN panggil SysLog lagi (anti perulangan).
            error_log('[SysLog] gagal mencatat: ' . $ex->getMessage());
        }
    }
}
