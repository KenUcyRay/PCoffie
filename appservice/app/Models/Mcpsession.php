<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
use Tymon\JWTAuth\Facades\JWTAuth;

// Daftar sesi login (Security Center, module System). Tabel dbo.T_USER_SESSION.
// SEGMENT frontend: home/cpsession/cpsession. Menu CPMENU MCONTROL = cp_session.
//
// Satu baris = satu token login. SESSIONID = ID unik token (jti), BUKAN token
// mentah. Status AKTIF/LOGOUT/DICABUT/KEDALUWARSA berubah-ubah, jadi tabel ini
// memang boleh di-UPDATE (tanpa trigger append-only). Tanpa hapus permanen.
//
// Mesin sesi (dipakai middleware + login/logout):
//   sessionIdFromToken(), createFromLogin(), enforceLimit(),
//   assertActive(), markLogoutBySid(), revokeUserSessions(), currentSid().
class Mcpsession extends Model
{
    use ColumnFilter;

    const MCODE = 10030003;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'SESSIONID' => 'A.SESSIONID',
            'USERLOGIN' => 'A.USERLOGIN',
            'LOGINTIME' => 'A.LOGINTIME',
            'LASTACTIVE' => 'A.LASTACTIVE',
            'EXPIRESAT' => 'A.EXPIRESAT',
            'STATUS' => 'A.STATUS',
            'USERIP' => 'A.USERIP',
        ];
    }

    // Tolak bila group user tidak punya akses menu Session List.
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

    // sid (jti) token pada request HTTP ini, atau null (CLI/token rusak).
    public static function currentSid(): ?string
    {
        try {
            $p = JWTAuth::parseToken()->getPayload()->toArray();
            $sid = trim((string) ($p['jti'] ?? ''));
            return $sid !== '' ? $sid : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    // Ambil ID unik dari token yang baru dibuat. Fallback hash token bila
    // payload tidak terbaca (sesi tetap unik, token mentah tidak disimpan).
    public static function sessionIdFromToken(string $token): string
    {
        try {
            $p = JWTAuth::setToken($token)->getPayload()->toArray();
            $sid = trim((string) ($p['jti'] ?? ''));
            if ($sid !== '') {
                return $sid;
            }
        } catch (\Throwable $e) {
            // lanjut ke fallback di bawah
        }
        return 'h' . hash('sha256', $token);
    }

    // Waktu kedaluwarsa absolut token (unix). Fallback konfigurasi jwt.ttl.
    public static function expiryFromToken(string $token): int
    {
        try {
            $p = JWTAuth::setToken($token)->getPayload()->toArray();
            $exp = (int) ($p['exp'] ?? 0);
            if ($exp > 0) {
                return $exp;
            }
        } catch (\Throwable $e) {
            // lanjut ke fallback di bawah
        }
        $ttl = 60;
        try {
            $ttl = (int) config('jwt.ttl', 60);
        } catch (\Throwable $e) {
            // abaikan
        }
        return time() + max(1, $ttl) * 60;
    }

    // Buat baris sesi AKTIF untuk login yang baru berhasil. Snapshot batas
    // idle/maksimum dari pengaturan SAAT login (perubahan setting kemudian
    // tidak mengubah sesi berjalan). Gagal di sini tidak boleh menggagalkan
    // login (dicatat ke SysLog saja).
    public static function createFromLogin(string $userlogin, ?int $userid, string $sid, int $tokenExp): void
    {
        try {
            $s = SecurityPolicy::current();
            $idleMin = max(1, (int) $s['SESIDLEMIN']);
            $maxHours = max(1, (int) $s['SESMAXHOURS']);
            // EXPIRESAT = min(sisa umur token JWT, login + batas maksimum sesi).
            // Dihitung RELATIF terhadap GETDATE() (DATEADD(MINUTE, ..., GETDATE()))
            // supaya tidak skew zona waktu antara unix-time PHP (UTC) dan
            // GETDATE() SQL Server (waktu lokal).

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
            [$device, $browser] = LoginTrail::parseAgent((string) ($ua ?? ''));

            DB::insert("
                INSERT INTO T_USER_SESSION
                    (SESSIONID, USERID, USERLOGIN, LOGINTIME, LASTACTIVE, EXPIRESAT,
                     USERIP, USERAGENT, DEVICE, BROWSER, STATUS, SESIDLEMIN, SESMAXHOURS,
                     SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, GETDATE(), GETDATE(), DATEADD(MINUTE, ?, GETDATE()),
                     ?, ?, ?, ?, 'AKTIF', ?, ?,
                     ?, GETDATE())
            ", [
                mb_substr($sid, 0, 64), $userid, mb_substr($userlogin, 0, 25),
                min(max(1, (int) (($tokenExp - time()) / 60)), $maxHours * 60),
                $ip, $ua, $device, $browser,
                $idleMin, $maxHours,
                mb_substr($userlogin, 0, 25),
            ]);
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal membuat baris sesi login.', ['user' => $userlogin], $e);
        }
    }

    // Tegakkan batas sesi per user: bila sesi AKTIF melebihi batas, akhiri
    // yang paling lama tidak aktif (DICABUT). MAXSESSION 0 = tanpa batas.
    public static function enforceLimit(?int $userid, string $userlogin, string $excludeSid, string $by = 'SYSTEM'): void
    {
        try {
            $s = SecurityPolicy::current();
            $max = max(0, (int) $s['MAXSESSION']);
            if ($max <= 0) {
                return;
            }
            $rows = DB::select("
                SELECT SESSIONID FROM T_USER_SESSION
                WHERE STATUS = 'AKTIF' AND USERLOGIN = ? AND SESSIONID <> ?
                ORDER BY LASTACTIVE ASC, LOGINTIME ASC
            ", [$userlogin, $excludeSid]);
            // +1 = sesi yang baru saja dibuat.
            $over = count($rows) + 1 - $max;
            for ($i = 0; $i < $over && $i < count($rows); $i++) {
                self::setStatus($rows[$i]->SESSIONID, 'DICABUT', 'Batas sesi per user tercapai.', $by);
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal menegakkan batas sesi.', ['user' => $userlogin], $e);
        }
    }

    // Ubah status satu sesi. Return true bila baris berubah.
    private static function setStatus(string $sid, string $status, ?string $reason, ?string $by): bool
    {
        $n = DB::update("
            UPDATE T_USER_SESSION
            SET STATUS = ?, REVOKETIME = GETDATE(), REVOKEDBY = ?, REASON = ?
            WHERE SESSIONID = ? AND STATUS = 'AKTIF'
        ", [$status, $by ? mb_substr($by, 0, 25) : null, $reason ? mb_substr($reason, 0, 200) : null, $sid]);
        return $n > 0;
    }

    // Validasi sesi untuk request berjalan. Return ['ok'=>bool,'code'=>string].
    // Sesi lewat masa berlaku / idle otomatis menjadi KEDALUWARSA (lazy).
    // LASTACTIVE diperbarui bila sudah lewat >= 60 detik (hemat tulis).
    public static function assertActive(string $sid): array
    {
        try {
            $row = DB::selectOne("
                SELECT SESSIONID, STATUS, LASTACTIVE, EXPIRESAT, SESIDLEMIN
                FROM T_USER_SESSION WHERE SESSIONID = ?
            ", [$sid]);
            if (!$row) {
                return ['ok' => false, 'code' => 'NOSESSION'];
            }
            if (strtoupper(trim((string) $row->STATUS)) !== 'AKTIF') {
                return ['ok' => false, 'code' => (string) $row->STATUS];
            }
            $idleMin = (int) ($row->SESIDLEMIN ?: SecurityPolicy::current()['SESIDLEMIN']);

            $st = DB::selectOne("
                SELECT
                    CASE WHEN A.EXPIRESAT <= GETDATE() THEN 1 ELSE 0 END AS ISEXPIRED,
                    DATEDIFF(MINUTE, A.LASTACTIVE, GETDATE()) AS IDLEMIN,
                    DATEDIFF(SECOND, A.LASTACTIVE, GETDATE()) AS IDLESEC
                FROM T_USER_SESSION A WHERE A.SESSIONID = ?
            ", [$sid]);
            if ($st && (int) $st->ISEXPIRED === 1) {
                self::setStatus($sid, 'KEDALUWARSA', 'Masa berlaku sesi habis.', null);
                return ['ok' => false, 'code' => 'EXPIRED'];
            }
            if ($st && (int) $st->IDLEMIN > $idleMin) {
                self::setStatus($sid, 'KEDALUWARSA', 'Sesi habis karena tidak aktif.', null);
                return ['ok' => false, 'code' => 'IDLE'];
            }
            if ($st && (int) $st->IDLESEC >= 60) {
                DB::update("UPDATE T_USER_SESSION SET LASTACTIVE = GETDATE() WHERE SESSIONID = ? AND STATUS = 'AKTIF'", [$sid]);
            }
            return ['ok' => true, 'code' => 'AKTIF'];
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal memvalidasi sesi.', [], $e);
            return ['ok' => false, 'code' => 'ERROR'];
        }
    }

    // Tandai sesi LOGOUT (dipakai saat logout). Best-effort: gagal tidak
    // menggagalkan logout.
    public static function markLogoutBySid(?string $sid, string $by): void
    {
        if ($sid === null || $sid === '') {
            return;
        }
        try {
            DB::update("
                UPDATE T_USER_SESSION
                SET STATUS = 'LOGOUT', REVOKETIME = GETDATE(), REVOKEDBY = ?, REASON = 'Logout'
                WHERE SESSIONID = ? AND STATUS = 'AKTIF'
            ", [mb_substr($by !== '' ? $by : 'SYSTEM', 0, 25), $sid]);
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal menandai sesi LOGOUT.', [], $e);
        }
    }

    // Cabut SEMUA sesi aktif satu user (dipakai saat username diblokir).
    public static function revokeUserSessions(string $userlogin, string $reason, string $by): int
    {
        try {
            return DB::update("
                UPDATE T_USER_SESSION
                SET STATUS = 'DICABUT', REVOKETIME = GETDATE(), REVOKEDBY = ?, REASON = ?
                WHERE USERLOGIN = ? AND STATUS = 'AKTIF'
            ", [mb_substr($by, 0, 25), mb_substr($reason, 0, 200), $userlogin]);
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal mencabut sesi user.', ['user' => $userlogin], $e);
            return 0;
        }
    }

    // Susun WHERE dari filter bar + filter kolom. Return [$where, $args].
    private static function buildWhere($param): array
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $user = trim((string) ($param['user'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $ip = trim((string) ($param['ip'] ?? ''));
        $q = trim((string) ($param['q'] ?? ''));

        if ($dateFrom !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) {
            return ['__ERROR__Format tanggal harus YYYY-MM-DD.', []];
        }
        if ($dateTo !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return ['__ERROR__Format tanggal harus YYYY-MM-DD.', []];
        }
        if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) {
            return ['__ERROR__Tanggal mulai tidak boleh sesudah tanggal akhir.', []];
        }

        $where = '';
        $args = [];
        if ($dateFrom !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'CAST(A.LOGINTIME AS DATE) >= ?';
            $args[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'CAST(A.LOGINTIME AS DATE) <= ?';
            $args[] = $dateTo;
        }
        if ($user !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.USERLOGIN LIKE ?';
            $args[] = '%' . $user . '%';
        }
        $statuses = ['AKTIF', 'LOGOUT', 'DICABUT', 'KEDALUWARSA'];
        if ($status !== '' && in_array($status, $statuses, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($ip !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.USERIP LIKE ?';
            $args[] = '%' . $ip . '%';
        }
        if ($q !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . '(A.USERLOGIN LIKE ? OR A.DEVICE LIKE ? OR A.BROWSER LIKE ?)';
            $args[] = '%' . $q . '%';
            $args[] = '%' . $q . '%';
            $args[] = '%' . $q . '%';
        }

        // Filter per kolom grid (DataTable) digabung.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        if ($fWhere !== '') {
            $where .= ($where === '' ? ' WHERE 1=1' : '') . $fWhere;
            $args = array_merge($args, $fArgs);
        }

        return [$where, $args];
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;

        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_USER_SESSION A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default aktivitas terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.LASTACTIVE DESC, A.LOGINTIME DESC';

        $sql = "
            SELECT A.SESSIONID, A.USERID, A.USERLOGIN, A.LOGINTIME, A.LASTACTIVE,
                   A.EXPIRESAT, A.USERIP, A.USERAGENT, A.DEVICE, A.BROWSER,
                   A.STATUS, A.REVOKETIME, A.REVOKEDBY, A.REASON
            FROM T_USER_SESSION A
            " . $where . "
            ORDER BY " . $order . "
        ";

        // OFFSET/FETCH nilai integer di-inline karena sudah di-cast aman (hindari isu binding int).
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);

        // Tandai baris sesi milik request ini ("Sesi Anda").
        $self = self::currentSid();
        $rows = [];
        foreach ($result as $r) {
            $arr = (array) $r;
            $arr['ISSELF'] = ($self !== null && (string) $r->SESSIONID === $self) ? 'YES' : 'NO';
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Ringkasan: sesi aktif + user yang sedang aktif.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $row = DB::selectOne("
            SELECT COUNT(*) AS ACTIVE,
                   COUNT(DISTINCT A.USERLOGIN) AS USERS
            FROM T_USER_SESSION A WHERE A.STATUS = 'AKTIF'
        ");

        return json_encode(['success' => true, 'Rows' => [$row ?: ['ACTIVE' => 0, 'USERS' => 0]]]);
    }

    // Cabut sesi milik user lain. Sesi sendiri tidak boleh dicabut dari sini.
    public static function process_revoke($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $sid = trim((string) ($vdata['SESSIONID'] ?? ''));

        if ($sid === '') {
            return json_encode(['success' => 'false', 'message' => 'SESSIONID tidak ditemukan.']);
        }

        $self = self::currentSid();
        if ($self !== null && $sid === $self) {
            return json_encode(['success' => 'false', 'message' => 'Sesi Anda sendiri tidak bisa dicabut dari sini. Pakai logout biasa.']);
        }

        $row = DB::selectOne("
            SELECT SESSIONID, USERLOGIN, STATUS FROM T_USER_SESSION WHERE SESSIONID = ?
        ", [$sid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data sesi tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Hanya sesi AKTIF yang bisa dicabut.']);
        }

        $by = $param['VUSERLOGIN'] ?? '';
        self::setStatus($sid, 'DICABUT', 'Dicabut oleh ' . ($by !== '' ? $by : 'admin') . '.', $by !== '' ? $by : 'SYSTEM');

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'cp_session', 'page' => 'Session List',
            'table' => 'T_USER_SESSION', 'dataId' => $sid, 'summary' => 'SESI ' . (string) ($row->USERLOGIN ?? $sid) . ' -> DICABUT',
            'before' => ['STATUS' => (string) $row->STATUS],
            'after' => ['STATUS' => 'DICABUT'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Sesi berhasil dicabut. User diminta login ulang.']);
    }
}
