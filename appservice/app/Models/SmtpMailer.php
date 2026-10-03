<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Pengirim SMTP native (tanpa library tambahan): soket mentah + AUTH LOGIN.
// Dipakai email uji General Setting & Notification Template.
// Password TIDAK PERNAH ditulis ke log/konteks mana pun.
class SmtpMailer
{
    // Batas laju email uji: 5x/menit/user (dihitung dari T_SYSTEM_LOG).
    const TEST_LIMIT = 5;

    public static function checkTestRate(string $userlogin): bool
    {
        try {
            $row = DB::selectOne("
                SELECT COUNT(*) AS C FROM T_SYSTEM_LOG
                WHERE USERLOGIN = ? AND MESSAGE LIKE 'Email uji%'
                  AND LOGTIME >= DATEADD(MINUTE, -1, GETDATE())
            ", [$userlogin]);
            return $row && (int) $row->C < self::TEST_LIMIT;
        } catch (\Throwable $e) {
            return true;
        }
    }

    private static function readLine($fp): string
    {
        $out = '';
        $tries = 0;
        while ($tries < 20) {
            $tries++;
            $line = fgets($fp, 1024);
            if ($line === false) {
                break;
            }
            $out .= $line;
            // Respons multi-baris: '250-...' lanjut, '250 ...' selesai.
            if (preg_match('/^\d{3} /', $line)) {
                break;
            }
        }
        return $out;
    }

    private static function code(string $resp): int
    {
        if (preg_match('/^(\d{3})/', $resp, $m)) {
            return (int) $m[1];
        }
        return 0;
    }

    private static function cmd($fp, string $cmd): string
    {
        fwrite($fp, $cmd . "\r\n");
        return self::readLine($fp);
    }

    // Kirim satu email teks polos. $cfg: HOST, PORT, ENCRYPTION(NONE/SSL/TLS),
    // USERNAME, PASSWORD(plain), FROMEMAIL, FROMNAME.
    // Return ['ok'=>bool, 'message'=>pesan aman untuk user].
    public static function send(array $cfg, string $to, string $subject, string $body): array
    {
        $host = trim((string) ($cfg['HOST'] ?? ''));
        $port = (int) ($cfg['PORT'] ?? 0);
        $enc = strtoupper(trim((string) ($cfg['ENCRYPTION'] ?? 'NONE')));
        $user = (string) ($cfg['USERNAME'] ?? '');
        $pass = (string) ($cfg['PASSWORD'] ?? '');
        $from = trim((string) ($cfg['FROMEMAIL'] ?? ''));
        $fromName = trim((string) ($cfg['FROMNAME'] ?? ''));

        if ($host === '' || $port < 1 || $port > 65535) {
            return ['ok' => false, 'message' => 'Pengaturan SMTP belum lengkap (server/port).'];
        }
        if ($from === '') {
            return ['ok' => false, 'message' => 'Alamat email pengirim belum diisi.'];
        }

        try {
            $remote = ($enc === 'SSL' ? 'ssl://' : '') . $host . ':' . $port;
            $fp = @fsockopen($remote, $port, $errno, $errstr, 15);
            if (!$fp) {
                return ['ok' => false, 'message' => 'Gagal terhubung ke server SMTP.'];
            }
            stream_set_timeout($fp, 15);
            $greet = self::readLine($fp);
            if (self::code($greet) !== 220) {
                fclose($fp);
                return ['ok' => false, 'message' => 'Server SMTP tidak merespons dengan benar.'];
            }

            $ehlo = self::cmd($fp, 'EHLO localhost');
            if (self::code($ehlo) !== 250) {
                fclose($fp);
                return ['ok' => false, 'message' => 'Server SMTP menolak koneksi.'];
            }

            if ($enc === 'TLS') {
                $tls = self::cmd($fp, 'STARTTLS');
                if (self::code($tls) !== 220) {
                    fclose($fp);
                    return ['ok' => false, 'message' => 'Server SMTP tidak mendukung TLS.'];
                }
                if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    fclose($fp);
                    return ['ok' => false, 'message' => 'Gagal mengaktifkan enkripsi TLS.'];
                }
                $ehlo = self::cmd($fp, 'EHLO localhost');
                if (self::code($ehlo) !== 250) {
                    fclose($fp);
                    return ['ok' => false, 'message' => 'Server SMTP menolak koneksi.'];
                }
            }

            if ($user !== '') {
                $auth = self::cmd($fp, 'AUTH LOGIN');
                if (self::code($auth) !== 334) {
                    fclose($fp);
                    return ['ok' => false, 'message' => 'Server SMTP tidak mendukung login.'];
                }
                $u = self::cmd($fp, base64_encode($user));
                if (self::code($u) !== 334) {
                    fclose($fp);
                    return ['ok' => false, 'message' => 'Autentikasi SMTP ditolak.'];
                }
                $p = self::cmd($fp, base64_encode($pass));
                if (self::code($p) !== 235) {
                    fclose($fp);
                    return ['ok' => false, 'message' => 'Username atau password SMTP salah.'];
                }
            }

            $mf = self::cmd($fp, 'MAIL FROM:<' . $from . '>');
            if (self::code($mf) !== 250) {
                fclose($fp);
                return ['ok' => false, 'message' => 'Alamat pengirim ditolak server SMTP.'];
            }
            $rt = self::cmd($fp, 'RCPT TO:<' . $to . '>');
            if (self::code($rt) !== 250 && self::code($rt) !== 251) {
                fclose($fp);
                return ['ok' => false, 'message' => 'Alamat tujuan ditolak server SMTP.'];
            }
            $dt = self::cmd($fp, 'DATA');
            if (self::code($dt) !== 354) {
                fclose($fp);
                return ['ok' => false, 'message' => 'Server SMTP menolak isi email.'];
            }

            $encSubj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
            $encName = $fromName !== '' ? '=?UTF-8?B?' . base64_encode($fromName) . '?=' : '';
            $lines = [
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                'From: ' . ($encName !== '' ? $encName . ' <' . $from . '>' : $from),
                'To: <' . $to . '>',
                'Subject: ' . $encSubj,
                'Date: ' . date('r'),
                '',
            ];
            // Dot-stuffing: baris diawali titik harus digandakan.
            foreach (preg_split('/\r\n|\n|\r/', $body) as $bl) {
                $lines[] = (isset($bl[0]) && $bl[0] === '.') ? '.' . $bl : $bl;
            }
            fwrite($fp, implode("\r\n", $lines) . "\r\n.\r\n");
            $sent = self::readLine($fp);
            self::cmd($fp, 'QUIT');
            fclose($fp);

            if (self::code($sent) !== 250) {
                return ['ok' => false, 'message' => 'Server SMTP menolak pengiriman email.'];
            }
            return ['ok' => true, 'message' => 'Email uji terkirim ke ' . $to . '.'];
        } catch (\Throwable $e) {
            // Pesan teknis hanya ke SysLog (tanpa password), user dapat pesan aman.
            SysLog::log('ERROR', 'API', 'Gagal mengirim email uji.', ['to' => $to, 'host' => $host], $e);
            return ['ok' => false, 'message' => 'Gagal mengirim email uji. Periksa pengaturan SMTP.'];
        }
    }
}
