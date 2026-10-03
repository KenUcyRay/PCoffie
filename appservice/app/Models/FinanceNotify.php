<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Notifikasi Finance (withdrawal/payout): render template EMAIL + kirim via
// SMTP General Setting. Gagal kirim TIDAK menggagalkan perubahan status
// (dicatat SysLog WARNING saja). Tanpa throw ke pemanggil.
class FinanceNotify extends Model
{
    // $values: ['nama'=>..., 'jumlah'=>...] sesuai placeholder template.
    public static function send(string $code, string $to, array $values, string $source): bool
    {
        $to = trim($to);
        if ($to === '' || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            return false;
        }

        try {
            $rendered = NotificationTemplate::render($code, 'EMAIL', $values);
            if (!$rendered['ok']) {
                SysLog::log('WARNING', $source, 'Template ' . $code . ' nonaktif/tak ada, email dilewati.', ['to' => $to]);
                return false;
            }

            $smtp = DB::selectOne("
                SELECT TOP 1 MAILFROMNAME, MAILFROMEMAIL, SMTPHOST, SMTPPORT, SMTPENCRYPTION,
                               SMTPUSERNAME, dbo.app_decrypt(SMTPPASSWORD) AS PLAIN
                FROM T_APP_SETTING ORDER BY SETTINGID
            ");
            if (!$smtp || trim((string) ($smtp->SMTPHOST ?? '')) === '') {
                SysLog::log('WARNING', $source, 'SMTP belum diisi, email ' . $code . ' dilewati.', ['to' => $to]);
                return false;
            }

            $sent = SmtpMailer::send([
                'HOST' => (string) ($smtp->SMTPHOST ?? ''),
                'PORT' => (string) ($smtp->SMTPPORT ?? ''),
                'ENCRYPTION' => (string) ($smtp->SMTPENCRYPTION ?? 'NONE'),
                'USERNAME' => (string) ($smtp->SMTPUSERNAME ?? ''),
                'PASSWORD' => trim((string) ($smtp->PLAIN ?? '')),
                'FROMEMAIL' => (string) ($smtp->MAILFROMEMAIL ?? ''),
                'FROMNAME' => (string) ($smtp->MAILFROMNAME ?? ''),
            ], $to, (string) ($rendered['subject'] ?? $code), (string) ($rendered['body'] ?? ''));

            SysLog::log($sent['ok'] ? 'INFO' : 'WARNING', $source, 'Email ' . $code . ': ' . ($sent['ok'] ? 'terkirim' : 'gagal') . '.', ['to' => $to]);
            return (bool) $sent['ok'];
        } catch (\Throwable $e) {
            SysLog::log('WARNING', $source, 'Email ' . $code . ' gagal (exception).', ['to' => $to], $e);
            return false;
        }
    }
}
