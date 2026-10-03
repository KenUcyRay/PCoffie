<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Blokir akses login (Security Center, module System). Tabel dbo.T_BLOCKED_ACCESS.
// SEGMENT frontend: home/cpblocked/cpblocked. Menu CPMENU MCONTROL = cp_blocked.
//
// Jenis: USERNAME/IP. Sumber: AUTO/MANUAL. Status: AKTIF/DIBUKA/KEDALUWARSA.
// Data tidak dihapus: buka blokir = STATUS DIBUKA; lewat waktu = KEDALUWARSA
// otomatis (lazy, saat dicek/dibaca).
//
// Mesin blokir (dipakai Mlogin):
//   isBlocked(), evaluateAuto(), createAuto(), expireDue().
class Mcpblocked extends Model
{
    use ColumnFilter;

    const MCODE = 10030004;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'BLOCKID' => 'A.BLOCKID',
            'BLOCKTYPE' => 'A.BLOCKTYPE',
            'BLOCKVALUE' => 'A.BLOCKVALUE',
            'SOURCE' => 'A.SOURCE',
            'STATUS' => 'A.STATUS',
            'STARTIME' => 'A.STARTIME',
            'ENDTIME' => 'A.ENDTIME',
        ];
    }

    // Tolak bila group user tidak punya akses menu Blocked Access.
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

    // Tandai KEDALUWARSA semua blokir AKTIF yang waktunya sudah lewat.
    public static function expireDue(): void
    {
        try {
            DB::update("
                UPDATE T_BLOCKED_ACCESS
                SET STATUS = 'KEDALUWARSA', SYSUPDATEDATE = GETDATE()
                WHERE STATUS = 'AKTIF' AND ENDTIME IS NOT NULL AND ENDTIME <= GETDATE()
            ");
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal menandai blokir kedaluwarsa.', [], $e);
        }
    }

    // Cek apakah username/IP sedang diblokir AKTIF (belum berakhir).
    // Return baris blokir (array) atau null.
    public static function isBlocked(string $typedUser, string $ip): ?array
    {
        try {
            self::expireDue();
            $t = trim($typedUser);
            if ($t !== '') {
                $row = DB::selectOne("
                    SELECT TOP 1 BLOCKID, BLOCKTYPE, BLOCKVALUE, SOURCE, REASON, STARTIME, ENDTIME
                    FROM T_BLOCKED_ACCESS
                    WHERE STATUS = 'AKTIF' AND BLOCKTYPE = 'USERNAME'
                      AND UPPER(BLOCKVALUE) = UPPER(?)
                      AND (ENDTIME IS NULL OR ENDTIME > GETDATE())
                    ORDER BY BLOCKID DESC
                ", [$t]);
                if ($row) {
                    return (array) $row;
                }
            }
            $pip = trim($ip);
            if ($pip !== '') {
                $row = DB::selectOne("
                    SELECT TOP 1 BLOCKID, BLOCKTYPE, BLOCKVALUE, SOURCE, REASON, STARTIME, ENDTIME
                    FROM T_BLOCKED_ACCESS
                    WHERE STATUS = 'AKTIF' AND BLOCKTYPE = 'IP'
                      AND BLOCKVALUE = ?
                      AND (ENDTIME IS NULL OR ENDTIME > GETDATE())
                    ORDER BY BLOCKID DESC
                ", [$pip]);
                if ($row) {
                    return (array) $row;
                }
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal memeriksa blokir akses.', [], $e);
        }
        return null;
    }

    // true bila sudah ada blokir AKTIF untuk jenis+nilai (abaikan beda kapital).
    private static function hasActive(string $type, string $value): bool
    {
        $hit = DB::selectOne("
            SELECT 1 AS X FROM T_BLOCKED_ACCESS
            WHERE STATUS = 'AKTIF' AND BLOCKTYPE = ?
              AND UPPER(BLOCKVALUE) = UPPER(?)
              AND (ENDTIME IS NULL OR ENDTIME > GETDATE())
        ", [$type, $value]);
        return !empty($hit);
    }

    // Buat blokir AUTO (dipakai login gagal beruntun / manual terprogram).
    // Return BLOCKID baru atau null bila sudah ada yang AKTIF. Mencatat audit
    // dan (untuk USERNAME) mencabut sesi aktif user tersebut.
    public static function createAuto(string $type, string $value, string $reason, int $minutes, string $by = 'SYSTEM'): ?int
    {
        try {
            if (self::hasActive($type, $value)) {
                return null;
            }
            DB::insert("
                INSERT INTO T_BLOCKED_ACCESS
                    (BLOCKTYPE, BLOCKVALUE, SOURCE, REASON, STARTIME, ENDTIME, STATUS,
                     SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, 'AUTO', ?, GETDATE(), DATEADD(MINUTE, ?, GETDATE()), 'AKTIF',
                     ?, GETDATE())
            ", [
                $type, mb_substr($value, 0, 45), mb_substr($reason, 0, 200),
                max(1, $minutes), mb_substr($by, 0, 25),
            ]);
            $id = (int) DB::getPdo()->lastInsertId();

            if ($type === 'USERNAME') {
                Mcpsession::revokeUserSessions($value, 'Akun diblokir otomatis.', $by);
            }

            AuditTrail::log([
                'action' => 'CREATE', 'mcontrol' => 'cp_blocked', 'page' => 'Blocked Access',
                'table' => 'T_BLOCKED_ACCESS', 'dataId' => (string) $id,
                'summary' => 'BLOKIR AUTO ' . $type . ' ' . $value,
                'before' => [],
                'after' => ['BLOCKTYPE' => $type, 'BLOCKVALUE' => $value, 'SOURCE' => 'AUTO', 'REASON' => $reason],
                'userlogin' => $by !== 'SYSTEM' ? $by : '',
            ]);
            return $id;
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal membuat blokir otomatis.', ['type' => $type, 'value' => $value], $e);
            return null;
        }
    }

    // Evaluasi blokir otomatis setelah login GAGAL. Hitungan gagal beruntun
    // = sejak SUCCESS/LOGOUT terakhir (reset otomatis setelah login berhasil).
    public static function evaluateAuto(string $typedUser, string $ip): void
    {
        try {
            $s = SecurityPolicy::current();
            $max = max(1, (int) $s['MAXFAILCOUNT']);
            $dur = max(1, (int) $s['BLOCKDURATIONMIN']);

            $t = trim($typedUser);
            if ($t !== '') {
                $row = DB::selectOne("
                    SELECT COUNT(*) AS C FROM T_LOGIN_HISTORY
                    WHERE TYPEDUSER = ? AND RESULT = 'FAILED'
                      AND LOGTIME > COALESCE((
                          SELECT MAX(LOGTIME) FROM T_LOGIN_HISTORY
                          WHERE TYPEDUSER = ? AND RESULT IN ('SUCCESS', 'LOGOUT')
                      ), '2000-01-01')
                ", [$t, $t]);
                if ($row && (int) $row->C >= $max) {
                    self::createAuto('USERNAME', $t, 'Gagal login ' . (int) $row->C . ' kali berturut-turut (otomatis).', $dur);
                }
            }

            $pip = trim($ip);
            if ($pip !== '') {
                $row = DB::selectOne("
                    SELECT COUNT(*) AS C, COUNT(DISTINCT TYPEDUSER) AS U FROM T_LOGIN_HISTORY
                    WHERE USERIP = ? AND RESULT = 'FAILED'
                      AND LOGTIME > COALESCE((
                          SELECT MAX(LOGTIME) FROM T_LOGIN_HISTORY
                          WHERE USERIP = ? AND RESULT IN ('SUCCESS', 'LOGOUT')
                      ), '2000-01-01')
                ", [$pip, $pip]);
                // IP diblokir bila banyak username gagal dari IP yang sama
                // (lindungi NAT kantor dari salah ketik satu user).
                if ($row && (int) $row->C >= $max && (int) $row->U >= 2) {
                    self::createAuto('IP', $pip, 'Gagal login ' . (int) $row->C . ' kali dari IP ini untuk ' . (int) $row->U . ' username (otomatis).', $dur);
                }
            }
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'AUTH', 'Gagal mengevaluasi blokir otomatis.', [], $e);
        }
    }

    // Susun WHERE dari filter bar + filter kolom. Return [$where, $args].
    private static function buildWhere($param): array
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $type = strtoupper(trim((string) ($param['type'] ?? '')));
        $source = strtoupper(trim((string) ($param['source'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $value = trim((string) ($param['value'] ?? ''));
        $reason = trim((string) ($param['reason'] ?? ''));
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
        $and = function () use (&$where) { return $where === '' ? ' WHERE ' : ' AND '; };
        if ($dateFrom !== '') {
            $where .= $and() . 'CAST(A.STARTIME AS DATE) >= ?';
            $args[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where .= $and() . 'CAST(A.STARTIME AS DATE) <= ?';
            $args[] = $dateTo;
        }
        if ($type !== '' && in_array($type, ['USERNAME', 'IP'], true)) {
            $where .= $and() . 'A.BLOCKTYPE = ?';
            $args[] = $type;
        }
        if ($source !== '' && in_array($source, ['AUTO', 'MANUAL'], true)) {
            $where .= $and() . 'A.SOURCE = ?';
            $args[] = $source;
        }
        if ($status !== '' && in_array($status, ['AKTIF', 'DIBUKA', 'KEDALUWARSA'], true)) {
            $where .= $and() . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($value !== '') {
            $where .= $and() . 'A.BLOCKVALUE LIKE ?';
            $args[] = '%' . $value . '%';
        }
        if ($reason !== '') {
            $where .= $and() . 'A.REASON LIKE ?';
            $args[] = '%' . $reason . '%';
        }
        if ($q !== '') {
            $where .= $and() . '(A.BLOCKVALUE LIKE ? OR A.REASON LIKE ?)';
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

        self::expireDue();

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;

        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_BLOCKED_ACCESS A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.BLOCKID DESC';

        $sql = "
            SELECT A.BLOCKID, A.BLOCKTYPE, A.BLOCKVALUE, A.SOURCE, A.REASON,
                   A.STARTIME, A.ENDTIME, A.STATUS, A.UNBLOCKTIME, A.UNBLOCKBY
            FROM T_BLOCKED_ACCESS A
            " . $where . "
            ORDER BY " . $order . "
        ";

        // OFFSET/FETCH nilai integer di-inline karena sudah di-cast aman (hindari isu binding int).
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);

        return json_encode([
            'success' => true,
            'Rows' => $result,
            'TotalRows' => $totalRows
        ]);
    }

    // Ringkasan: blokir aktif per jenis + blokir otomatis 24 jam terakhir.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::expireDue();

        $row = DB::selectOne("
            SELECT
                ISNULL(SUM(CASE WHEN A.STATUS = 'AKTIF' AND A.BLOCKTYPE = 'USERNAME' THEN 1 ELSE 0 END), 0) AS ACTIVE_USER,
                ISNULL(SUM(CASE WHEN A.STATUS = 'AKTIF' AND A.BLOCKTYPE = 'IP' THEN 1 ELSE 0 END), 0) AS ACTIVE_IP,
                ISNULL(SUM(CASE WHEN A.SOURCE = 'AUTO' AND A.STARTIME >= DATEADD(HOUR, -24, GETDATE()) THEN 1 ELSE 0 END), 0) AS AUTO_24H
            FROM T_BLOCKED_ACCESS A
        ");

        return json_encode(['success' => true, 'Rows' => [$row ?: ['ACTIVE_USER' => 0, 'ACTIVE_IP' => 0, 'AUTO_24H' => 0]]]);
    }

    // IP request HTTP ini (untuk pengaman blokir IP sendiri). '' bila tak ada.
    private static function requestIp(): string
    {
        try {
            if (function_exists('request')) {
                $rip = (string) (request()->ip() ?? '');
                return $rip !== '' ? mb_substr($rip, 0, 45) : '';
            }
        } catch (\Throwable $ignored) {
            // CLI / tanpa request HTTP
        }
        return '';
    }

    // Tambah blokir manual. Pengaman: tidak boleh memblokir akun sendiri, IP
    // sendiri, atau akun admin aktif terakhir.
    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $by = $param['VUSERLOGIN'] ?? '';

        $type = strtoupper(trim((string) ($vdata['BLOCKTYPE'] ?? '')));
        $value = trim((string) ($vdata['BLOCKVALUE'] ?? ''));
        $reason = trim((string) ($vdata['REASON'] ?? ''));
        $endRaw = trim((string) ($vdata['ENDTIME'] ?? ''));

        if ($type !== 'USERNAME' && $type !== 'IP') {
            return json_encode(['success' => 'false', 'message' => 'Jenis blokir harus USERNAME atau IP.']);
        }
        if ($value === '') {
            return json_encode(['success' => 'false', 'message' => 'Nilai blokir wajib diisi.']);
        }
        if (mb_strlen($value) > 45) {
            return json_encode(['success' => 'false', 'message' => 'Nilai blokir maksimal 45 karakter.']);
        }
        if ($type === 'IP' && filter_var($value, FILTER_VALIDATE_IP) === false) {
            return json_encode(['success' => 'false', 'message' => 'Nilai IP tidak valid (IPv4/IPv6).']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan blokir wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $endtime = null;
        if ($endRaw !== '') {
            $ts = strtotime($endRaw);
            if ($ts === false) {
                return json_encode(['success' => 'false', 'message' => 'Format waktu berakhir tidak valid.']);
            }
            if ($ts <= time()) {
                return json_encode(['success' => 'false', 'message' => 'Waktu berakhir harus di masa depan.']);
            }
            $endtime = date('Y-m-d H:i:s', $ts);
        }

        if (self::hasActive($type, $value)) {
            return json_encode(['success' => 'false', 'message' => 'Sudah ada blokir AKTIF untuk nilai ini.']);
        }

        // Pengaman 1: tidak boleh memblokir akun sendiri.
        if ($type === 'USERNAME' && $by !== '' && strtoupper($value) === strtoupper($by)) {
            return json_encode(['success' => 'false', 'message' => 'Tidak boleh memblokir akun sendiri.']);
        }
        // Pengaman 2: tidak boleh memblokir IP yang sedang dipakai.
        $myIp = self::requestIp();
        if ($type === 'IP' && $myIp !== '' && $value === $myIp) {
            return json_encode(['success' => 'false', 'message' => 'Tidak boleh memblokir IP yang sedang dipakai.']);
        }
        // Pengaman 3: akun admin aktif terakhir tidak boleh diblokir.
        if ($type === 'USERNAME') {
            $target = DB::selectOne("SELECT USERID, USERGROUP, USERACTIVE FROM CPUSER WHERE UPPER(USERLOGIN) = UPPER(?)", [$value]);
            if ($target && strtoupper(trim((string) ($target->USERACTIVE ?? ''))) === 'YES'
                && strtoupper(trim((string) ($target->USERGROUP ?? ''))) === 'GROUP_ADMIN') {
                $cnt = DB::selectOne("
                    SELECT COUNT(*) AS C FROM CPUSER
                    WHERE UPPER(USERGROUP) = 'GROUP_ADMIN' AND UPPER(USERACTIVE) = 'YES'
                ");
                if ($cnt && (int) $cnt->C <= 1) {
                    return json_encode(['success' => 'false', 'message' => 'Akun admin aktif terakhir tidak boleh diblokir.']);
                }
            }
        }

        DB::insert("
            INSERT INTO T_BLOCKED_ACCESS
                (BLOCKTYPE, BLOCKVALUE, SOURCE, REASON, STARTIME, ENDTIME, STATUS,
                 SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, 'MANUAL', ?, GETDATE(), ?, 'AKTIF', ?, GETDATE())
        ", [$type, $value, $reason, $endtime, $by]);
        $id = (int) DB::getPdo()->lastInsertId();

        // Username diblokir -> sesi aktifnya ikut dicabut.
        if ($type === 'USERNAME') {
            Mcpsession::revokeUserSessions($value, 'Akun diblokir oleh ' . ($by !== '' ? $by : 'admin') . '.', $by !== '' ? $by : 'SYSTEM');
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'cp_blocked', 'page' => 'Blocked Access',
            'table' => 'T_BLOCKED_ACCESS', 'dataId' => (string) $id,
            'summary' => 'BLOKIR MANUAL ' . $type . ' ' . $value,
            'before' => [],
            'after' => ['BLOCKTYPE' => $type, 'BLOCKVALUE' => $value, 'SOURCE' => 'MANUAL', 'REASON' => $reason, 'ENDTIME' => $endtime],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Blokir berhasil ditambahkan.']);
    }

    // Buka blokir AKTIF (STATUS -> DIBUKA). Tanpa hapus fisik.
    public static function process_unblock($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $blockid = $vdata['BLOCKID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($blockid)) {
            return json_encode(['success' => 'false', 'message' => 'BLOCKID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT BLOCKID, BLOCKTYPE, BLOCKVALUE, SOURCE, STATUS FROM T_BLOCKED_ACCESS WHERE BLOCKID = ?
        ", [$blockid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data blokir tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Hanya blokir AKTIF yang bisa dibuka.']);
        }

        DB::update("
            UPDATE T_BLOCKED_ACCESS
            SET STATUS = 'DIBUKA', UNBLOCKTIME = GETDATE(), UNBLOCKBY = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE BLOCKID = ?
        ", [$by, $by, $blockid]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'cp_blocked', 'page' => 'Blocked Access',
            'table' => 'T_BLOCKED_ACCESS', 'dataId' => (string) $blockid,
            'summary' => 'BUKA BLOKIR ' . (string) $row->BLOCKTYPE . ' ' . (string) $row->BLOCKVALUE,
            'before' => ['STATUS' => (string) $row->STATUS],
            'after' => ['STATUS' => 'DIBUKA'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Blokir berhasil dibuka.']);
    }
}
