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

    public static function warnetPakets($param)
    {
        $rows = DB::select("SELECT PAKETID, KODE, NAMA, ZONA, DURASI_MENIT, HARGA, DESKRIPSI, SORTNO FROM T_WARNET_PAKET WHERE ISAKTIF='YES' ORDER BY SORTNO, KODE");
        if (!$rows && DB::selectOne("SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='T_WARNET_PAKET'") === null) {
            $rows = [
                (object)['PAKETID'=>1,'KODE'=>'PKT-REG-1J','NAMA'=>'Reguler 1 Jam','ZONA'=>'REGULER','DURASI_MENIT'=>60,'HARGA'=>6000,'DESKRIPSI'=>'Reguler per jam','SORTNO'=>1],
                (object)['PAKETID'=>2,'KODE'=>'PKT-VIP-1J','NAMA'=>'VIP 1 Jam','ZONA'=>'VIP','DURASI_MENIT'=>60,'HARGA'=>10000,'DESKRIPSI'=>'VIP RTX 4090','SORTNO'=>2],
                (object)['PAKETID'=>3,'KODE'=>'PKT-MALAM','NAMA'=>'Paket Malam 8 Jam','ZONA'=>'VIP','DURASI_MENIT'=>480,'HARGA'=>40000,'DESKRIPSI'=>'22:00-06:00','SORTNO'=>3],
            ];
        }
        return self::ok(['Rows' => $rows ?: []]);
    }

    public static function warnetPcs($param)
    {
        $tgl = trim((string)($param['tgl'] ?? ''));
        $jam = trim((string)($param['jam'] ?? ''));
        $dur = (int)($param['dur'] ?? 0);
        $zona = strtoupper(trim((string)($param['zona'] ?? '')));
        if (DB::selectOne("SELECT 1 AS X FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='T_WARNET_PC'") === null) {
            return self::ok(['Rows' => []]);
        }
        $where = "WHERE A.ISAKTIF='YES'";
        $args = [];
        if (in_array($zona, ['REGULER','VIP','VVIP'])) { $where .= " AND A.ZONA=?"; $args[] = $zona; }
        $rows = DB::select("SELECT A.PCID,A.PCNO,A.ZONA,A.SPEK,A.HARGA_PERJAM,A.STATUS FROM T_WARNET_PC A $where ORDER BY A.SORTNO,A.PCNO", $args);
        if ($tgl !== '' && $jam !== '' && $dur > 0) {
            $end = date('H:i:s', strtotime($jam) + $dur*60);
            $busy = DB::select("SELECT PCID FROM T_WARNET_BOOKING WHERE TGL_BOOKING=? AND STATUS IN ('pending','approved','running') AND ? < JAM_SELESAI AND ? > JAM_MULAI", [$tgl, $jam, $end]) ?: [];
            $busyIds = array_map(fn($r)=>(int)$r->PCID, $busy);
            foreach ($rows as $r) { $r->AVAILABLE = (in_array((int)$r->PCID, $busyIds) || $r->STATUS!=='ready') ? 'NO' : 'YES'; $r->BUSY_REASON = in_array((int)$r->PCID,$busyIds)?'booked':($r->STATUS!=='ready'?$r->STATUS:''); }
        }
        return self::ok(['Rows' => $rows ?: []]);
    }

    public static function warnetBookingRequest($param)
    {
        $u = self::who();
        if (!$u) return self::failJson('Silakan masuk terlebih dahulu.', 401);
        $login = (string)$u['USERLOGIN'];
        if (!self::rate('warnet_req_'.$login, 10, 600)) return self::failJson('Terlalu banyak permintaan booking.', 429);
        $pcid = (int)($param['pcid'] ?? 0);
        $paketId = isset($param['paketid']) && $param['paketid']!=='' && $param['paketid']!==null ? (int)$param['paketid'] : null;
        $tgl = trim((string)($param['tgl'] ?? ''));
        $jam = trim((string)($param['jam'] ?? ''));
        $dur = (int)($param['dur'] ?? 0);
        $pay = strtolower(trim((string)($param['paymethod'] ?? 'qris')));
        if (!in_array($pay, ['qris','transfer'])) $pay='qris';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$tgl)) return self::fail('Tanggal tidak valid.');
        if (!preg_match('/^\d{2}:\d{2}(:\d{2})?$/',$jam)) return self::fail('Jam tidak valid.');
        $jam = substr($jam,0,5).':00';
        if ($dur<15||$dur>720) return self::fail('Durasi 15-720 menit.');
        $pc = DB::selectOne("SELECT PCID,HARGA_PERJAM,STATUS FROM T_WARNET_PC WHERE PCID=? AND ISAKTIF='YES'", [$pcid]);
        if (!$pc) return self::fail('PC tidak ditemukan / tidak aktif.');
        if ($pc->STATUS!=='ready') return self::fail('PC tidak ready.');
        $total = 0;
        if ($paketId) {
            $pk = DB::selectOne("SELECT HARGA FROM T_WARNET_PAKET WHERE PAKETID=? AND ISAKTIF='YES'", [$paketId]);
            if (!$pk) return self::fail('Paket tidak ditemukan.');
            $total=(float)$pk->HARGA;
        } else {
            $total=(float)$pc->HARGA_PERJAM * ceil($dur/60);
        }
        $end = date('H:i:s', strtotime($jam)+$dur*60);
        if (DB::select("SELECT 1 AS X FROM T_WARNET_BOOKING WHERE PCID=? AND TGL_BOOKING=? AND STATUS IN ('pending','approved','running') AND ? < JAM_SELESAI AND ? > JAM_MULAI", [$pcid,$tgl,$jam,$end])) {
            return self::fail('PC bentrok pada jadwal tersebut.');
        }
        $bookNo = sprintf('BK-%s-%04d', date('Ymd'), ((int)(DB::selectOne("SELECT COUNT(*) AS C FROM T_WARNET_BOOKING WHERE BOOKNO LIKE ?", ['BK-'.date('Ymd').'-%'])->C ?? 0))+1);
        DB::insert("INSERT INTO T_WARNET_BOOKING (BOOKNO,USERLOGIN,PCID,PAKETID,TGL_BOOKING,JAM_MULAI,JAM_SELESAI,DURASI_MENIT,TOTAL,PAYMETHOD,PAYSTATUS,STATUS,SYSCREATEUSER,SYSCREATEDATE) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,GETDATE())",
            [$bookNo,$login,$pcid,$paketId,$tgl,$jam,$end,$dur,$total,$pay,'pending','pending',$login]);
        self::audit('WARNET_REQUEST', $login, ['table'=>'T_WARNET_BOOKING','dataId'=>$bookNo]);
        return self::ok(['bookno'=>$bookNo,'total'=>$total], 'Request booking pending — menunggu approve operator.');
    }

    public static function warnetMyBookings($param)
    {
        $u = self::who();
        if (!$u) return self::failJson('Silakan masuk terlebih dahulu.', 401);
        $login = (string)$u['USERLOGIN'];
        $rows = DB::select("SELECT A.BOOKINGID,A.BOOKNO,A.USERLOGIN,A.PCID,C.PCNO,C.ZONA AS PCZONA,A.PAKETID,P.NAMA AS PAKETNAMA,A.TGL_BOOKING,A.JAM_MULAI,A.JAM_SELESAI,A.DURASI_MENIT,A.TOTAL,A.PAYMETHOD,A.PAYSTATUS,A.STATUS,A.SYSCREATEDATE FROM T_WARNET_BOOKING A LEFT JOIN T_WARNET_PC C ON C.PCID=A.PCID LEFT JOIN T_WARNET_PAKET P ON P.PAKETID=A.PAKETID WHERE A.USERLOGIN=? ORDER BY A.TGL_BOOKING DESC, A.JAM_MULAI DESC", [$login]) ?: [];
        return self::ok(['Rows'=>$rows]);
    }

    public static function warnetBookingCancel($param)
    {
        $u = self::who();
        if (!$u) return self::failJson('Silakan masuk terlebih dahulu.', 401);
        $login = (string)$u['USERLOGIN'];
        $id = (int)($param['bookingid'] ?? 0);
        $row = DB::selectOne("SELECT BOOKINGID,BOOKNO,USERLOGIN,STATUS FROM T_WARNET_BOOKING WHERE BOOKINGID=?", [$id]);
        if (!$row) return self::fail('Booking tidak ditemukan.');
        if ((string)$row->USERLOGIN !== $login) return self::fail('Bukan booking Anda.');
        if (!in_array(strtolower($row->STATUS), ['pending'])) return self::fail('Hanya pending yang bisa dibatalkan user.');
        DB::update("UPDATE T_WARNET_BOOKING SET STATUS='cancel', PAYSTATUS='cancel', SYSUPDATEUSER=?, SYSUPDATEDATE=GETDATE() WHERE BOOKINGID=?", [$login,$id]);
        return self::ok([], 'Booking dibatalkan.');
    }
}
