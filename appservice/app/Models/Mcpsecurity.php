<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Pengaturan keamanan login dan sesi (Security Center, module System).
// Tabel dbo.T_SECURITY_SETTING (satu baris = pengaturan yang berlaku).
// SEGMENT frontend: home/cpsecurity/cpsecurity. Menu CPMENU MCONTROL = cp_security.
//
// Hanya read_setting + process_update. Perubahan hanya berlaku untuk kejadian
// berikutnya (sesi berjalan tidak disentuh). Setiap perubahan dicatat ke
// Audit Log (before/after). Masa berlaku password (PWDEXPIRYDAYS) disimpan dan
// divalidasi rentangnya, tetapi TIDAK dienforce karena CPUSER tidak punya
// kolom tanggal ganti password dan strukturnya tidak boleh diubah.
class Mcpsecurity extends Model
{
    const MCODE = 10030002;

    // Tolak bila group user tidak punya akses menu Security Setting.
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

    public static function read_setting($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $row = DB::selectOne("SELECT TOP 1 * FROM T_SECURITY_SETTING ORDER BY SETTINGID");
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan keamanan belum ada.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. Return pesan error atau null bila lolos.
    private static function validate($vdata): ?string
    {
        $int = function ($key, $label, $min, $max) use ($vdata): ?string {
            $raw = trim((string) ($vdata[$key] ?? ''));
            if ($raw === '') {
                return $label . ' wajib diisi.';
            }
            if (filter_var($raw, FILTER_VALIDATE_INT) === false) {
                return $label . ' harus angka bulat.';
            }
            $n = (int) $raw;
            if ($n < $min || $n > $max) {
                return $label . ' harus antara ' . $min . ' dan ' . $max . '.';
            }
            return null;
        };

        foreach ([
            ['PWDMINLEN', 'Panjang password minimum', 6, 64],
            ['PWDEXPIRYDAYS', 'Masa berlaku password', 0, 365],
            ['MAXFAILCOUNT', 'Batas gagal login', 3, 10],
            ['BLOCKDURATIONMIN', 'Durasi blokir otomatis', 1, 1440],
            ['SESIDLEMIN', 'Sesi habis karena tidak aktif', 5, 480],
            ['SESMAXHOURS', 'Masa berlaku maksimum sesi', 1, 72],
            ['MAXSESSION', 'Maksimum sesi per user', 0, 20],
        ] as $rule) {
            $err = $int($rule[0], $rule[1], $rule[2], $rule[3]);
            if ($err !== null) {
                return $err;
            }
        }

        foreach (['PWDREQUIREUPPER', 'PWDREQUIREDIGIT', 'PWDREQUIRESYMBOL'] as $flag) {
            $v = strtoupper(trim((string) ($vdata[$flag] ?? '')));
            if ($v !== 'YES' && $v !== 'NO') {
                return 'Pilihan wajib hanya YES atau NO.';
            }
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

        $before = DB::selectOne("SELECT TOP 1 * FROM T_SECURITY_SETTING ORDER BY SETTINGID");
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan keamanan belum ada.']);
        }

        $cols = [
            'PWDMINLEN', 'PWDREQUIREUPPER', 'PWDREQUIREDIGIT', 'PWDREQUIRESYMBOL',
            'PWDEXPIRYDAYS', 'MAXFAILCOUNT', 'BLOCKDURATIONMIN',
            'SESIDLEMIN', 'SESMAXHOURS', 'MAXSESSION',
        ];
        $after = [];
        foreach ($cols as $c) {
            $after[$c] = in_array($c, ['PWDREQUIREUPPER', 'PWDREQUIREDIGIT', 'PWDREQUIRESYMBOL'], true)
                ? strtoupper(trim((string) ($vdata[$c] ?? 'NO')))
                : (int) trim((string) ($vdata[$c] ?? '0'));
        }

        DB::update("
            UPDATE T_SECURITY_SETTING
            SET PWDMINLEN = ?, PWDREQUIREUPPER = ?, PWDREQUIREDIGIT = ?, PWDREQUIRESYMBOL = ?,
                PWDEXPIRYDAYS = ?, MAXFAILCOUNT = ?, BLOCKDURATIONMIN = ?,
                SESIDLEMIN = ?, SESMAXHOURS = ?, MAXSESSION = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE SETTINGID = ?
        ", [
            $after['PWDMINLEN'], $after['PWDREQUIREUPPER'], $after['PWDREQUIREDIGIT'], $after['PWDREQUIRESYMBOL'],
            $after['PWDEXPIRYDAYS'], $after['MAXFAILCOUNT'], $after['BLOCKDURATIONMIN'],
            $after['SESIDLEMIN'], $after['SESMAXHOURS'], $after['MAXSESSION'],
            $param['VUSERLOGIN'] ?? '', $before->SETTINGID,
        ]);

        SecurityPolicy::refresh();

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_security', 'page' => 'Security Setting',
            'table' => 'T_SECURITY_SETTING', 'dataId' => (string) $before->SETTINGID, 'summary' => 'SETTINGID ' . $before->SETTINGID,
            'before' => (array) $before, 'after' => $after,
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Pengaturan keamanan berhasil disimpan.']);
    }
}
