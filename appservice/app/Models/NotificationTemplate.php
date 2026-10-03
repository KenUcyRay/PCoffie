<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Fungsi bantu pusat template notifikasi (dipakai modul lain + halaman).
//
// Cara pakai dari modul (contoh: setelah tiket terbit):
//   $r = \App\Models\NotificationTemplate::render('TICKET_ISSUED', 'EMAIL', [
//       'nama' => $nama, 'event' => $event,
//       'nomor_order' => $order, 'jadwal' => $jadwal,
//   ]);
//   if ($r['ok']) { kirimEmail($to, $r['subject'], $r['body']); }
//
// - Template mati/tidak ada -> hasil kosong yang jelas (ok=false), bukan error.
// - Nilai penanda di-escape (htmlspecialchars) supaya aman dari XSS.
// - Penanda tanpa nilai -> teks kosong + dicatat ke SysLog.
// - Hanya penanda {{nama}} (huruf/angka/underscore) yang diproses.
class NotificationTemplate
{
    // Ambil daftar penanda yang diizinkan dari kolom PLACEHOLDERS (JSON).
    // Return [nama => ['contoh'=>, 'deskripsi'=>], ...].
    public static function allowedOf($row): array
    {
        $raw = is_array($row) ? ($row['PLACEHOLDERS'] ?? '') : ($row->PLACEHOLDERS ?? '');
        $json = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : []);
        if (!is_array($json)) {
            return [];
        }
        $out = [];
        foreach ($json as $k => $v) {
            $name = trim((string) $k);
            if ($name === '' || !preg_match('/^[A-Za-z0-9_]+$/', $name)) {
                continue;
            }
            if (is_array($v)) {
                $out[$name] = [
                    'contoh' => (string) ($v['contoh'] ?? ''),
                    'deskripsi' => (string) ($v['deskripsi'] ?? ''),
                ];
            } else {
                $out[$name] = ['contoh' => (string) $v, 'deskripsi' => ''];
            }
        }
        return $out;
    }

    // Semua nama penanda {{...}} di dalam teks.
    public static function usedIn(string $text): array
    {
        preg_match_all('/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/', $text, $m);
        return array_values(array_unique($m[1] ?? []));
    }

    // Isi penanda dengan nilai (di-escape). $missing diisi nama tanpa nilai.
    public static function fill(string $text, array $allowed, array $values, array &$missing = []): string
    {
        return preg_replace_callback(
            '/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/',
            function ($m) use ($allowed, $values, &$missing) {
                $name = $m[1];
                if (!isset($allowed[$name])) {
                    return $m[0];
                }
                if (!array_key_exists($name, $values) || $values[$name] === null) {
                    $missing[] = $name;
                    return '';
                }
                return htmlspecialchars((string) $values[$name], ENT_QUOTES, 'UTF-8');
            },
            $text
        );
    }

    // Render template untuk modul lain. Return ['ok', 'subject', 'body', 'message'].
    public static function render(string $code, string $channel, array $values = []): array
    {
        try {
            $code = strtoupper(trim($code));
            $channel = strtoupper(trim($channel));
            $row = DB::selectOne("
                SELECT TOP 1 SUBJECT, BODY, ISACTIVE, PLACEHOLDERS
                FROM T_NOTIFICATION_TEMPLATE
                WHERE CODE = ? AND CHANNEL = ?
            ", [$code, $channel]);

            if (!$row) {
                return ['ok' => false, 'subject' => '', 'body' => '', 'message' => 'Template ' . $code . '/' . $channel . ' tidak ditemukan.'];
            }
            if (strtoupper(trim((string) $row->ISACTIVE)) !== 'YES') {
                return ['ok' => false, 'subject' => '', 'body' => '', 'message' => 'Template ' . $code . '/' . $channel . ' sedang nonaktif.'];
            }

            $allowed = self::allowedOf($row);
            $missing = [];
            $subject = self::fill((string) $row->SUBJECT, $allowed, $values, $missing);
            $body = self::fill((string) $row->BODY, $allowed, $values, $missing);
            $missing = array_values(array_unique($missing));
            if (!empty($missing)) {
                SysLog::log('INFO', 'API', 'Penanda template tanpa nilai.', [
                    'code' => $code, 'channel' => $channel, 'missing' => implode(',', $missing),
                ]);
            }

            return ['ok' => true, 'subject' => $subject, 'body' => $body, 'message' => 'OK'];
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal merender template notifikasi.', ['code' => $code], $e);
            return ['ok' => false, 'subject' => '', 'body' => '', 'message' => 'Gagal merender template.'];
        }
    }
}
