<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
use Tymon\JWTAuth\Facades\JWTAuth;

class Mportal extends Model
{
    const BUYER_GROUP = 'GROUP_USER';

    private static function ok(array $extra = [], string $msg = 'OK'): array
    {
        return array_merge(['success' => 'true', 'message' => $msg], $extra);
    }

    private static function fail(string $msg, int $code = 200): array
    {
        return ['success' => 'false', 'message' => $msg, 'code' => $code];
    }

    private static function failJson(string $msg, int $code = 200): array
    {
        return ['__http' => $code, 'success' => 'false', 'message' => $msg];
    }

    private static function who(): array
    {
        try {
            $p = JWTAuth::parseToken()->getPayload()->toArray();
            $login = trim((string) ($p['sub'] ?? ''));
            if ($login === '') return [];
        } catch (\Throwable $e) {
            return [];
        }
        $u = DB::selectOne("SELECT USERID, USERLOGIN, USERNAME, USEREMAIL, USERGROUP FROM CPUSER WHERE USERLOGIN = ?", [$login]);
        return $u ? (array) $u : [];
    }

    private static function rate(string $bucket, int $max, int $windowSec): bool
    {
        $file = sys_get_temp_dir() . '/portal_rl_' . preg_replace('/[^a-z0-9_]+/i', '_', $bucket) . '.json';
        $now = time();
        $hits = [];
        if (is_readable($file)) {
            $raw = @file_get_contents($file);
            $arr = $raw ? json_decode($raw, true) : [];
            if (is_array($arr)) foreach ($arr as $ts) if (is_int($ts) && ($now - $ts) < $windowSec) $hits[] = $ts;
        }
        if (count($hits) >= $max) return false;
        $hits[] = $now;
        @file_put_contents($file, json_encode($hits), LOCK_EX);
        return true;
    }

    private static function clientIp(): string
    {
        try { return mb_substr((string) (request()->ip() ?? ''), 0, 45); } catch (\Throwable $e) { return ''; }
    }

    private static function audit(string $action, string $actor, array $meta = []): void
    {
        try {
            AuditTrail::log([
                'userlogin' => $actor,
                'action' => 'LAINNYA',
                'mcontrol' => 'portal',
                'page' => 'Portal',
                'table' => $meta['table'] ?? '',
                'dataId' => (string) ($meta['dataId'] ?? ''),
                'summary' => $action,
            ]);
        } catch (\Throwable $e) {}
    }

    public static function home($param)
    {
        if (!self::rate('pub_home_' . self::clientIp(), 60, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        return self::ok([
            'app' => DB::selectOne("SELECT TOP 1 APPNAME, SLOGAN FROM T_APP_SETTING ORDER BY SETTINGID") ?: null,
        ]);
    }

    public static function cities($param)
    {
        if (!self::rate('pub_city_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        $rows = DB::select("SELECT CITYID, CITYCODE, CITYNAME, CITYPROV FROM T_CITY WHERE ISNULL(CITYACTIVE,'YES') <> 'NO' ORDER BY CITYNAME");
        return self::ok(['rows' => array_map(function ($r) {
            return ['CITYCODE' => (string) $r->CITYCODE, 'CITYNAME' => (string) $r->CITYNAME, 'CITYPROV' => (string) ($r->CITYPROV ?? '')];
        }, $rows ?: [])]);
    }

    public static function register($param)
    {
        if (!self::rate('reg_' . self::clientIp(), 5, 600)) {
            return self::failJson('Terlalu banyak percobaan pendaftaran.', 429);
        }
        $login = mb_strtolower(trim((string) ($param['userlogin'] ?? '')));
        $pass = (string) ($param['userpassword'] ?? '');
        $name = trim((string) ($param['username'] ?? ''));
        $email = mb_strtolower(trim((string) ($param['useremail'] ?? '')));
        if ($login === '' || !preg_match('/^[a-z0-9._-]{3,30}$/', $login)) return self::fail('Username 3-30 karakter.');
        if ($name === '') return self::fail('Nama wajib diisi.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return self::fail('Format email tidak valid.');
        $perr = SecurityPolicy::checkPassword($pass);
        if ($perr !== null && $perr !== '') return self::fail($perr);
        if (DB::selectOne("SELECT TOP 1 USERID FROM CPUSER WHERE USERLOGIN = ?", [$login])) return self::fail('Username sudah dipakai.');
        if (DB::selectOne("SELECT TOP 1 USERID FROM CPUSER WHERE USEREMAIL = ?", [$email])) return self::fail('Email sudah terdaftar.');
        try {
            DB::insert("INSERT INTO CPUSER (USERLOGIN, USERNAME, USERPASSWORD, USERGROUP, USERACTIVE, USEREMAIL, GROUPMODEL, SYSCREATEUSER, SYSCREATEDATE) VALUES (?, ?, dbo.app_encrypt(?), ?, 'YES', ?, 'mode_standard', ?, GETDATE())", [$login, $name, $pass, self::BUYER_GROUP, $email, 'portal-register']);
        } catch (\Exception $e) {
            SysLog::log('ERROR', 'PORTAL', 'Gagal membuat akun.', ['login' => $login]);
            return self::fail('Pendaftaran gagal.');
        }
        LoginTrail::record('REGISTER', $login);
        self::audit('PORTAL_REGISTER', $login, ['dataId' => $login]);
        return self::ok(['userlogin' => $login], 'Pendaftaran berhasil. Silakan masuk.');
    }

    public static function whoami($param)
    {
        $u = self::who();
        if (!$u) return self::fail('Belum login.');
        return self::ok(['profile' => [
            'USERLOGIN' => $u['USERLOGIN'],
            'USERNAME' => $u['USERNAME'],
            'USERGROUP' => $u['USERGROUP'],
            'USEREMAIL' => $u['USEREMAIL'],
            'IS_BUYER' => strtoupper(trim((string) $u['USERGROUP'])) === self::BUYER_GROUP,
        ]]);
    }

    public static function profile($param)
    {
        $u = self::who();
        if (!$u) return self::failJson('Silakan masuk terlebih dahulu.', 401);
        $action = strtolower(trim((string) ($param['action'] ?? 'read')));
        $login = (string) $u['USERLOGIN'];
        if ($action === 'update') {
            $name = trim((string) ($param['username'] ?? ''));
            $email = mb_strtolower(trim((string) ($param['useremail'] ?? '')));
            if ($name === '') return self::fail('Nama wajib diisi.');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return self::fail('Format email tidak valid.');
            $dup = DB::selectOne("SELECT TOP 1 USERID FROM CPUSER WHERE USEREMAIL = ? AND USERLOGIN <> ?", [$email, $login]);
            if ($dup) return self::fail('Email sudah dipakai akun lain.');
            DB::update("UPDATE CPUSER SET USERNAME = ?, USEREMAIL = ? WHERE USERLOGIN = ?", [$name, $email, $login]);
            self::audit('PORTAL_PROFILE_UPDATE', $login, ['dataId' => $login]);
            return self::ok([], 'Profil diperbarui.');
        }
        if ($action === 'password') {
            $old = (string) ($param['oldpassword'] ?? '');
            $new = (string) ($param['newpassword'] ?? '');
            $plain = DB::selectOne("SELECT dbo.app_decrypt(USERPASSWORD) AS P FROM CPUSER WHERE USERLOGIN = ?", [$login]);
            if (!$plain || trim((string) ($plain->P ?? '')) !== $old) return self::fail('Password lama salah.');
            $perr = SecurityPolicy::checkPassword($new);
            if ($perr !== null && $perr !== '') return self::fail($perr);
            DB::update("UPDATE CPUSER SET USERPASSWORD = dbo.app_encrypt(?), SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE() WHERE USERLOGIN = ?", [$new, $login, $login]);
            self::audit('PORTAL_PASSWORD_CHANGE', $login, ['dataId' => $login]);
            return self::ok([], 'Password berhasil diganti.');
        }
        $sessions = DB::select("SELECT SESSIONID, STATUS, LOGINTIME, EXPIRESAT, LASTACTIVE, USERIP, BROWSER, DEVICE FROM T_USER_SESSION WHERE USERLOGIN = ? AND STATUS = 'AKTIF' ORDER BY LOGINTIME DESC", [$login]);
        $inbox = DB::select("SELECT TOP 20 M.MSGID, M.TITLE, M.BODY, M.PRIORITY, M.SENTAT FROM T_MESSAGE_RECIPIENT R JOIN T_MESSAGE M ON M.MSGID = R.MSGID WHERE R.USERLOGIN = ? OR R.USERID = ? ORDER BY M.SENTAT DESC", [$login, (int) $u['USERID']]);
        return self::ok([
            'profile' => ['USERLOGIN' => $u['USERLOGIN'], 'USERNAME' => $u['USERNAME'], 'USEREMAIL' => $u['USEREMAIL'], 'USERGROUP' => $u['USERGROUP']],
            'sessions' => array_map(function ($s) { $s = (array) $s; return ['SESSIONID' => (string) ($s['SESSIONID'] ?? ''), 'STATUS' => (string) $s['STATUS'], 'LOGINTIME' => (string) ($s['LOGINTIME'] ?? ''), 'LASTACTIVE' => (string) ($s['LASTACTIVE'] ?? ''), 'EXPIRESAT' => (string) ($s['EXPIRESAT'] ?? ''), 'USERIP' => (string) ($s['USERIP'] ?? ''), 'BROWSER' => (string) ($s['BROWSER'] ?? ''), 'DEVICE' => (string) ($s['DEVICE'] ?? '')]; }, $sessions ?: []),
            'inbox' => array_map(function ($m) { $m = (array) $m; return ['MSGID' => (int) $m->MSGID, 'TITLE' => (string) $m->TITLE, 'BODY' => (string) ($m->BODY ?? ''), 'PRIORITY' => (string) ($m->PRIORITY ?? ''), 'SENTAT' => (string) ($m->SENTAT ?? '')]; }, $inbox ?: []),
        ]);
    }
}
