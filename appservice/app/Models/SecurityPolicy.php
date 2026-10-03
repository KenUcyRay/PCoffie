<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Pembaca pengaturan keamanan pusat (satu-satunya pintu baca T_SECURITY_SETTING)
// + pemeriksa kebijakan password.
//
// Dipakai di: Mcpsecurity (tampil/simpan), Mcpuser, Mcpuserlogin (validasi
// password baru), Mlogin/Mcpsession/Mcpblocked (batas gagal, durasi blokir,
// batas idle/maksimum sesi).
//
// - current(): satu baris pengaturan + default bila tabel/baris belum ada.
//   Hasil di-cache per request (pengaturan hanya dibaca ulang tiap request).
// - checkPassword(): return pesan error (Indonesia) atau null bila lolos.
//   Bila pengaturan tidak terbaca, kebijakan dilewati (fail-open) supaya admin
//   tidak terkunci, dan dicatat ke SysLog.
class SecurityPolicy
{
    private static $cache = null;

    // Nilai bawaan = sama dengan seed t_security_setting.sql.
    public static function defaults(): array
    {
        return [
            'PWDMINLEN' => 8,
            'PWDREQUIREUPPER' => 'YES',
            'PWDREQUIREDIGIT' => 'YES',
            'PWDREQUIRESYMBOL' => 'NO',
            'PWDEXPIRYDAYS' => 0,
            'MAXFAILCOUNT' => 5,
            'BLOCKDURATIONMIN' => 15,
            'SESIDLEMIN' => 30,
            'SESMAXHOURS' => 12,
            'MAXSESSION' => 3,
        ];
    }

    public static function current(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $out = self::defaults();
        try {
            $row = DB::selectOne("SELECT TOP 1 * FROM T_SECURITY_SETTING ORDER BY SETTINGID");
            if ($row) {
                $r = (array) $row;
                $out['PWDMINLEN'] = isset($r['PWDMINLEN']) ? (int) $r['PWDMINLEN'] : $out['PWDMINLEN'];
                foreach (['PWDREQUIREUPPER', 'PWDREQUIREDIGIT', 'PWDREQUIRESYMBOL'] as $k) {
                    if (isset($r[$k])) {
                        $out[$k] = strtoupper(trim((string) $r[$k])) === 'NO' ? 'NO' : 'YES';
                    }
                }
                foreach (['PWDEXPIRYDAYS', 'MAXFAILCOUNT', 'BLOCKDURATIONMIN', 'SESIDLEMIN', 'SESMAXHOURS', 'MAXSESSION'] as $k) {
                    if (isset($r[$k]) && $r[$k] !== null && $r[$k] !== '') {
                        $out[$k] = (int) $r[$k];
                    }
                }
            }
        } catch (\Throwable $e) {
            SysLog::log('WARNING', 'AUTH', 'Gagal membaca T_SECURITY_SETTING, pakai bawaan.', [], $e);
        }
        self::$cache = $out;
        return $out;
    }

    // Paksa baca ulang dari DB (dipakai setelah process_update).
    public static function refresh(): array
    {
        self::$cache = null;
        return self::current();
    }

    // Validasi password baru terhadap kebijakan aktif. Return pesan atau null.
    public static function checkPassword($password): ?string
    {
        $pwd = (string) ($password ?? '');
        $s = self::current();

        $min = max(1, (int) $s['PWDMINLEN']);
        if (mb_strlen($pwd) < $min) {
            return 'Password minimal ' . $min . ' karakter.';
        }
        if ($s['PWDREQUIREUPPER'] === 'YES' && !preg_match('/[A-Z]/', $pwd)) {
            return 'Password wajib mengandung huruf besar.';
        }
        if ($s['PWDREQUIREDIGIT'] === 'YES' && !preg_match('/[0-9]/', $pwd)) {
            return 'Password wajib mengandung angka.';
        }
        if ($s['PWDREQUIRESYMBOL'] === 'YES' && !preg_match('/[^A-Za-z0-9]/', $pwd)) {
            return 'Password wajib mengandung simbol.';
        }
        return null;
    }
}
