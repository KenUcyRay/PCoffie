<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Pengaturan umum aplikasi (App Setting, module System).
// Tabel dbo.T_APP_SETTING (satu baris = pengaturan yang berlaku).
// SEGMENT frontend: home/cpsetting/cpsetting. Menu CPMENU MCONTROL = cp_setting.
//
// read_setting/process_update/upload_logo/upload_favicon/send_test_email +
// read_public (identitas publik TANPA login, hanya 4 kolom).
// Password SMTP terenkripsi (dbo.app_encrypt), tidak pernah dikirim ke
// frontend (hanya flag terisi); kosong saat simpan = pertahankan yang lama.
// Password tidak masuk Audit Log maupun System Log.
class Mcpsetting extends Model
{
    const MCODE = 10060002;

    const LOGO_DIR = 'uploads/setting';
    const LOGO_EXTS = ['png', 'jpg', 'jpeg'];
    const LOGO_MIMES = ['image/png', 'image/jpeg'];
    const FAVICON_EXTS = ['png', 'jpg', 'jpeg', 'ico'];
    const FAVICON_MIMES = ['image/png', 'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon'];
    const FILE_MAX = 2097152; // 2MB (sama seperti logo payment)

    // Tolak bila group user tidak punya akses menu General Setting.
    // Return pesan error atau null bila lolos.
    private static function requireAccess($param): ?string
    {
        $res = json_decode(Mhak_akses::menu_akses([
            'VUSERLOGIN' => $param['VUSERLOGIN'] ?? '',
            'vdata' => json_encode(['mcode' => self::MCODE]),
        ]), true) ?: [];
        if (strtolower(trim((string) ($res['success'] ?? 'false'))) !== 'true') {
            return (string) ($res['message'] ?? 'Anda tidak memiliki hak akses untuk membuka menu ini.');
        }
        return null;
    }

    // Kolom non-rahasia (dipakai read_setting + read_public).
    private static function publicCols(): string
    {
        return "APPNAME, SLOGAN, LOGO, FAVICON, CONTACTEMAIL, CONTACTPHONE,
                CONTACTWA, ADDRESS, TIMEZONE, CURRENCY, DATEFORMAT, TERMS,
                PRIVACY, TERMSVERSION, MAILFROMNAME, MAILFROMEMAIL, SMTPHOST,
                SMTPPORT, SMTPENCRYPTION, SMTPUSERNAME";
    }

    public static function read_setting($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $row = DB::selectOne("
            SELECT SETTINGID, " . self::publicCols() . ",
                   CASE WHEN SMTPPASSWORD IS NULL OR SMTPPASSWORD = '' THEN 'NO' ELSE 'YES' END AS HAS_PASSWORD
            FROM T_APP_SETTING ORDER BY SETTINGID
        ");
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan aplikasi belum ada.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Identitas publik TANPA login (nama, slogan, logo, favicon saja).
    // Dipakai halaman login dan judul tab. Tanpa data kontak/internal/email.
    public static function read_public($param)
    {
        $row = DB::selectOne("
            SELECT TOP 1 APPNAME, SLOGAN, LOGO, FAVICON
            FROM T_APP_SETTING ORDER BY SETTINGID
        ");

        return json_encode(['success' => true, 'Rows' => [$row ?: [
            'APPNAME' => 'PCOFFIE', 'SLOGAN' => '', 'LOGO' => null, 'FAVICON' => null,
        ]]]);
    }

    // Validasi form. $vdata = nilai mentah (belum disanitasi). Return pesan atau null.
    private static function validate($vdata): ?string
    {
        $name = trim((string) ($vdata['APPNAME'] ?? ''));
        if ($name === '') {
            return 'Nama aplikasi wajib diisi.';
        }
        if (mb_strlen($name) > 100) {
            return 'Nama aplikasi maksimal 100 karakter.';
        }
        if (mb_strlen(trim((string) ($vdata['SLOGAN'] ?? ''))) > 200) {
            return 'Slogan maksimal 200 karakter.';
        }
        foreach (['CONTACTEMAIL' => 'Email kontak', 'MAILFROMEMAIL' => 'Alamat email pengirim'] as $k => $label) {
            $e = trim((string) ($vdata[$k] ?? ''));
            if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL) === false) {
                return $label . ' tidak valid.';
            }
            if (mb_strlen($e) > 100) {
                return $label . ' maksimal 100 karakter.';
            }
        }
        foreach (['CONTACTPHONE' => 'Nomor telepon', 'CONTACTWA' => 'Nomor WhatsApp'] as $k => $label) {
            $p = trim((string) ($vdata[$k] ?? ''));
            if ($p !== '' && !preg_match('/^[0-9+\-\s]+$/', $p)) {
                return $label . ' hanya boleh angka, spasi, plus, dan strip.';
            }
            if (mb_strlen($p) > 30) {
                return $label . ' maksimal 30 karakter.';
            }
        }
        if (mb_strlen(trim((string) ($vdata['ADDRESS'] ?? ''))) > 500) {
            return 'Alamat maksimal 500 karakter.';
        }
        $tz = strtoupper(trim((string) ($vdata['TIMEZONE'] ?? '')));
        if (!in_array($tz, ['ASIA/JAKARTA', 'ASIA/MAKASSAR', 'ASIA/JAYAPURA'], true)) {
            return 'Zona waktu harus Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura.';
        }
        if (strtoupper(trim((string) ($vdata['CURRENCY'] ?? ''))) !== 'RP') {
            return 'Mata uang hanya RP untuk saat ini.';
        }
        if (mb_strlen(trim((string) ($vdata['DATEFORMAT'] ?? ''))) > 30) {
            return 'Format tanggal maksimal 30 karakter.';
        }
        foreach (['TERMS' => 'Syarat dan ketentuan', 'PRIVACY' => 'Kebijakan privasi'] as $k => $label) {
            if (mb_strlen((string) ($vdata[$k] ?? '')) > 20000) {
                return $label . ' maksimal 20000 karakter.';
            }
        }
        if (mb_strlen(trim((string) ($vdata['TERMSVERSION'] ?? ''))) > 50) {
            return 'Versi teks hukum maksimal 50 karakter.';
        }
        if (mb_strlen(trim((string) ($vdata['MAILFROMNAME'] ?? ''))) > 100) {
            return 'Nama pengirim maksimal 100 karakter.';
        }
        $host = trim((string) ($vdata['SMTPHOST'] ?? ''));
        $portRaw = trim((string) ($vdata['SMTPPORT'] ?? ''));
        $enc = strtoupper(trim((string) ($vdata['SMTPENCRYPTION'] ?? '')));
        if (mb_strlen($host) > 100) {
            return 'Server SMTP maksimal 100 karakter.';
        }
        if ($host !== '') {
            if ($portRaw === '' || filter_var($portRaw, FILTER_VALIDATE_INT) === false
                || (int) $portRaw < 1 || (int) $portRaw > 65535) {
                return 'Port SMTP harus 1 sampai 65535.';
            }
            if (!in_array($enc, ['NONE', 'SSL', 'TLS'], true)) {
                return 'Enkripsi SMTP harus NONE, SSL, atau TLS.';
            }
        }
        if (mb_strlen(trim((string) ($vdata['SMTPUSERNAME'] ?? ''))) > 100) {
            return 'Username SMTP maksimal 100 karakter.';
        }
        return null;
    }

    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $before = DB::selectOne("SELECT TOP 1 * FROM T_APP_SETTING ORDER BY SETTINGID");
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan aplikasi belum ada.']);
        }

        // Teks hukum: teks biasa, tanpa HTML (XSS).
        $terms = mb_substr(trim(strip_tags((string) ($vdata['TERMS'] ?? ''))), 0, 20000);
        $privacy = mb_substr(trim(strip_tags((string) ($vdata['PRIVACY'] ?? ''))), 0, 20000);

        $tzRaw = trim((string) ($vdata['TIMEZONE'] ?? 'Asia/Jakarta'));
        $tz = $tzRaw === '' ? 'Asia/Jakarta' : ucwords(strtolower($tzRaw), '/');

        $newPass = (string) ($vdata['SMTPPASSWORD'] ?? '');
        $passChanged = $newPass !== '';

        $after = [
            'APPNAME' => mb_substr(trim((string) ($vdata['APPNAME'] ?? '')), 0, 100),
            'SLOGAN' => mb_substr(trim((string) ($vdata['SLOGAN'] ?? '')), 0, 200),
            'CONTACTEMAIL' => mb_substr(trim((string) ($vdata['CONTACTEMAIL'] ?? '')), 0, 100),
            'CONTACTPHONE' => mb_substr(trim((string) ($vdata['CONTACTPHONE'] ?? '')), 0, 30),
            'CONTACTWA' => mb_substr(trim((string) ($vdata['CONTACTWA'] ?? '')), 0, 30),
            'ADDRESS' => mb_substr(trim((string) ($vdata['ADDRESS'] ?? '')), 0, 500),
            'TIMEZONE' => $tz,
            'CURRENCY' => 'RP',
            'DATEFORMAT' => mb_substr(trim((string) ($vdata['DATEFORMAT'] ?? '')), 0, 30),
            'TERMS' => $terms,
            'PRIVACY' => $privacy,
            'TERMSVERSION' => mb_substr(trim((string) ($vdata['TERMSVERSION'] ?? '')), 0, 50),
            'MAILFROMNAME' => mb_substr(trim((string) ($vdata['MAILFROMNAME'] ?? '')), 0, 100),
            'MAILFROMEMAIL' => mb_substr(trim((string) ($vdata['MAILFROMEMAIL'] ?? '')), 0, 100),
            'SMTPHOST' => mb_substr(trim((string) ($vdata['SMTPHOST'] ?? '')), 0, 100),
            'SMTPPORT' => trim((string) ($vdata['SMTPPORT'] ?? '')) === '' ? null : (int) trim((string) $vdata['SMTPPORT']),
            'SMTPENCRYPTION' => strtoupper(trim((string) ($vdata['SMTPENCRYPTION'] ?? 'NONE'))),
            'SMTPUSERNAME' => mb_substr(trim((string) ($vdata['SMTPUSERNAME'] ?? '')), 0, 100),
        ];

        if ($passChanged) {
            DB::update("
                UPDATE T_APP_SETTING
                SET APPNAME = ?, SLOGAN = ?, CONTACTEMAIL = ?, CONTACTPHONE = ?,
                    CONTACTWA = ?, ADDRESS = ?, TIMEZONE = ?, CURRENCY = ?,
                    DATEFORMAT = ?, TERMS = ?, PRIVACY = ?, TERMSVERSION = ?,
                    MAILFROMNAME = ?, MAILFROMEMAIL = ?, SMTPHOST = ?, SMTPPORT = ?,
                    SMTPENCRYPTION = ?, SMTPUSERNAME = ?,
                    SMTPPASSWORD = dbo.app_encrypt(?),
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE SETTINGID = ?
            ", [
                $after['APPNAME'], $after['SLOGAN'], $after['CONTACTEMAIL'], $after['CONTACTPHONE'],
                $after['CONTACTWA'], $after['ADDRESS'], $after['TIMEZONE'], $after['CURRENCY'],
                $after['DATEFORMAT'], $after['TERMS'], $after['PRIVACY'], $after['TERMSVERSION'],
                $after['MAILFROMNAME'], $after['MAILFROMEMAIL'], $after['SMTPHOST'], $after['SMTPPORT'],
                $after['SMTPENCRYPTION'], $after['SMTPUSERNAME'],
                $newPass,
                $param['VUSERLOGIN'] ?? '', $before->SETTINGID,
            ]);
        } else {
            // Password dikosongkan -> pertahankan yang lama (kolom tak disentuh).
            DB::update("
                UPDATE T_APP_SETTING
                SET APPNAME = ?, SLOGAN = ?, CONTACTEMAIL = ?, CONTACTPHONE = ?,
                    CONTACTWA = ?, ADDRESS = ?, TIMEZONE = ?, CURRENCY = ?,
                    DATEFORMAT = ?, TERMS = ?, PRIVACY = ?, TERMSVERSION = ?,
                    MAILFROMNAME = ?, MAILFROMEMAIL = ?, SMTPHOST = ?, SMTPPORT = ?,
                    SMTPENCRYPTION = ?, SMTPUSERNAME = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE SETTINGID = ?
            ", [
                $after['APPNAME'], $after['SLOGAN'], $after['CONTACTEMAIL'], $after['CONTACTPHONE'],
                $after['CONTACTWA'], $after['ADDRESS'], $after['TIMEZONE'], $after['CURRENCY'],
                $after['DATEFORMAT'], $after['TERMS'], $after['PRIVACY'], $after['TERMSVERSION'],
                $after['MAILFROMNAME'], $after['MAILFROMEMAIL'], $after['SMTPHOST'], $after['SMTPPORT'],
                $after['SMTPENCRYPTION'], $after['SMTPUSERNAME'],
                $param['VUSERLOGIN'] ?? '', $before->SETTINGID,
            ]);
        }

        // Audit: password tampil sebagai status ("diubah"), TANPA nilai.
        // Key 'SMTP_AUTH_CHANGED' sengaja tidak mengandung substring sensitif
        // supaya tidak disamarkan AuditTrail::mask menjadi '***'.
        $beforeArr = (array) $before;
        unset($beforeArr['SMTPPASSWORD']);
        $beforeArr['SMTP_AUTH_CHANGED'] = ($before->SMTPPASSWORD ?? '') !== '' ? 'terisi' : 'kosong';
        $after['SMTP_AUTH_CHANGED'] = $passChanged ? 'diubah' : 'tidak diubah';

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_setting', 'page' => 'General Setting',
            'table' => 'T_APP_SETTING', 'dataId' => (string) $before->SETTINGID, 'summary' => 'SETTINGID ' . $before->SETTINGID,
            'before' => $beforeArr, 'after' => $after,
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Pengaturan aplikasi berhasil disimpan.']);
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen). Sama seperti Mcppaymentmethod.
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload file gambar pengaturan (logo/favicon). $field = nama field file,
    // $prefix = awalan nama file. SVG tidak diizinkan sama sekali.
    private static function uploadImage($param, string $field, string $prefix, array $exts, array $mimes, string $col): string
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $file = $param[$field] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File tidak ditemukan.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, $exts, true)) {
            return json_encode(['success' => 'false', 'message' => 'Tipe file harus ' . strtoupper(implode(', ', $exts)) . '.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, $mimes, true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file bukan gambar yang valid.']);
        }
        if ($file->getSize() > self::FILE_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran file maksimal 2MB.']);
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, self::LOGO_DIR);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $name = $prefix . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $file->move($dir, $name);
        $path = self::LOGO_DIR . '/' . $name;

        $before = DB::selectOne("SELECT TOP 1 SETTINGID, LOGO, FAVICON FROM T_APP_SETTING ORDER BY SETTINGID");
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan aplikasi belum ada.']);
        }
        $old = (string) ($before->$col ?? '');
        DB::update("
            UPDATE T_APP_SETTING SET " . $col . " = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE SETTINGID = ?
        ", [$path, $param['VUSERLOGIN'] ?? '', $before->SETTINGID]);

        // Hapus file lama (best-effort, hanya dalam folder upload).
        if ($old !== '' && $old !== $path && strpos($old, self::LOGO_DIR . '/') === 0 && strpos($old, '..') === false) {
            $f = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $old);
            if (is_file($f)) {
                @unlink($f);
            }
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_setting', 'page' => 'General Setting',
            'table' => 'T_APP_SETTING', 'dataId' => (string) $before->SETTINGID,
            'summary' => strtoupper($col) . ' diperbarui',
            'before' => [$col => $old !== '' ? 'terisi' : 'kosong'],
            'after' => [$col => 'diperbarui'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'path' => $path, 'message' => 'File berhasil diupload.']);
    }

    public static function upload_logo($param)
    {
        return self::uploadImage($param, 'logo', 'set_logo', self::LOGO_EXTS, self::LOGO_MIMES, 'LOGO');
    }

    public static function upload_favicon($param)
    {
        return self::uploadImage($param, 'favicon', 'set_favicon', self::FAVICON_EXTS, self::FAVICON_MIMES, 'FAVICON');
    }

    // Kirim email uji memakai pengaturan SMTP yang sedang diisi di form
    // (belum harus disimpan). Password diambil dari form; bila kosong, pakai
    // yang tersimpan. Dibatasi 5x/menit, dicatat SysLog tanpa password.
    public static function send_test_email($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $by = $param['VUSERLOGIN'] ?? '';
        $to = trim((string) ($vdata['TESTEMAIL'] ?? ''));

        if ($to === '' || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            return json_encode(['success' => 'false', 'message' => 'Alamat email tujuan tidak valid.']);
        }
        if (!SmtpMailer::checkTestRate($by)) {
            return json_encode(['success' => 'false', 'message' => 'Terlalu sering. Coba lagi setelah 1 menit.']);
        }

        $cfg = [
            'HOST' => trim((string) ($vdata['SMTPHOST'] ?? '')),
            'PORT' => trim((string) ($vdata['SMTPPORT'] ?? '')),
            'ENCRYPTION' => trim((string) ($vdata['SMTPENCRYPTION'] ?? 'NONE')),
            'USERNAME' => trim((string) ($vdata['SMTPUSERNAME'] ?? '')),
            'PASSWORD' => (string) ($vdata['SMTPPASSWORD'] ?? ''),
            'FROMEMAIL' => trim((string) ($vdata['MAILFROMEMAIL'] ?? '')),
            'FROMNAME' => trim((string) ($vdata['MAILFROMNAME'] ?? '')),
        ];

        // Password kosong di form -> pakai yang tersimpan (dekripsi sesaat).
        if ($cfg['PASSWORD'] === '') {
            $row = DB::selectOne("SELECT TOP 1 dbo.app_decrypt(SMTPPASSWORD) AS PLAIN FROM T_APP_SETTING ORDER BY SETTINGID");
            $cfg['PASSWORD'] = trim((string) ($row->PLAIN ?? ''));
        }

        $sent = SmtpMailer::send(
            $cfg, $to,
            'Email Uji - ' . trim((string) ($vdata['APPNAME'] ?? 'PCOFFIE')),
            "Ini email uji dari halaman General Setting.\n\nPengaturan SMTP Anda berfungsi dengan baik."
        );

        SysLog::log($sent['ok'] ? 'INFO' : 'WARNING', 'API', 'Email uji General Setting: ' . ($sent['ok'] ? 'terkirim' : 'gagal') . '.', [
            'to' => $to, 'host' => $cfg['HOST'], 'port' => $cfg['PORT'], 'encryption' => $cfg['ENCRYPTION'],
        ]);

        return json_encode($sent['ok']
            ? ['success' => 'true', 'message' => $sent['message']]
            : ['success' => 'false', 'message' => $sent['message']]);
    }
}
