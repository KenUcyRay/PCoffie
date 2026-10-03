<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Scan tiket / check-in resmi (Ticket Check-in, module Ticketing).
// SEGMENT frontend: home/mscanticket/mscanticket. Menu CPMENU MCONTROL = mscanticket.
//
// process_scan: validasi berurutan -> hasil VALID/SUDAH_DIPAKAI/TIDAK_VALID/
// SALAH_EVENT/BELUM_DIBAYAR/REFUND/DIBATALKAN/DI_LUAR_JADWAL. Check-in atomik
// (update bersyarat + rowcount). Setiap percobaan dicatat ke T_SCAN_LOG
// (gagal catat tidak menggagalkan check-in, tapi masuk System Log).
// Rate-limit per IP+user; respons body error HTTP 200 (konvensi project:
// apiPost hanya melempar pada 401).
class Mmscanticket extends Model
{
    const MCODE = 40020002;

    // Batas scan: 30x/menit per IP+petugas.
    const SCAN_LIMIT = 30;

    // Rentang diizinkan: jam sebelum mulai s.d. selesai (env SCAN_WINDOW_HOURS).
    private static function windowHours(): int
    {
        try {
            $h = (int) (getenv('SCAN_WINDOW_HOURS') ?: 0);
            if ($h <= 0 && function_exists('env')) {
                $h = (int) (env('SCAN_WINDOW_HOURS', 2));
            }
            return $h > 0 ? $h : 2;
        } catch (\Throwable $e) {
            return 2;
        }
    }

    // Tolak bila group user tidak punya akses menu Scan Ticket.
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

    // Catat percobaan scan (best-effort). Tanpa PII ke System Log bila gagal.
    private static function logScan($eventid, $attendeeid, string $code, string $result, string $method, string $by): void
    {
        try {
            $user = null;
            if ($by !== '') {
                $user = DB::selectOne("SELECT USERID FROM CPUSER WHERE USERLOGIN = ?", [$by]);
            }
            DB::insert("
                INSERT INTO T_SCAN_LOG
                    (EVENTID, ATTENDEEID, SCANCODE, RESULT, USERID, USERLOGIN, METHOD, USERIP)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ", [
                $eventid, $attendeeid, mb_substr($code, 0, 100), $result,
                $user ? (int) $user->USERID : null,
                $by !== '' ? mb_substr($by, 0, 25) : null,
                $method, self::requestIp() !== '' ? self::requestIp() : null,
            ]);
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal mencatat scan tiket.', ['result' => $result], $e);
        }
    }

    // Daftar event untuk dipilih: PUBLISHED, yang hari ini/terdekat di atas.
    public static function read_events($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $result = DB::select("
            SELECT EVENTID, EVENTCODE, TITLE, STARTAT, STATUS
            FROM T_EVENT
            WHERE STATUS = 'PUBLISHED'
            ORDER BY CASE WHEN CAST(STARTAT AS DATE) = CAST(GETDATE() AS DATE) THEN 0 ELSE 1 END,
                     STARTAT, EVENTID
        ");

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    // Ringkasan per event: masuk vs berhak masuk.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = $vdata['EVENTID'] ?? ($param['eventid'] ?? null);

        if (empty($eventid)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT
                ISNULL(SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.PAYSTATUS = 'LUNAS' THEN 1 ELSE 0 END), 0) AS ELIGIBLE,
                ISNULL(SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.ATTENDSTATUS = 'HADIR' THEN 1 ELSE 0 END), 0) AS MASUK
            FROM T_ATTENDEE A WHERE A.EVENTID = ?
        ", [(int) $eventid]);

        $elig = $row ? (int) $row->ELIGIBLE : 0;
        $masuk = $row ? (int) $row->MASUK : 0;

        return json_encode(['success' => true, 'Rows' => [[
            'ELIGIBLE' => $elig,
            'MASUK' => $masuk,
            'PCT' => $elig > 0 ? (int) round($masuk * 100 / $elig) : 0,
        ]]]);
    }

    // Validasi + check-in satu tiket (token QR atau kode manual).
    // vdata: {EVENTID, TOKEN?, CODE?, METHOD: KAMERA|MANUAL}.
    public static function process_scan($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = $vdata['EVENTID'] ?? null;
        $token = trim((string) ($vdata['TOKEN'] ?? ''));
        $code = trim((string) ($vdata['CODE'] ?? ''));
        $method = strtoupper(trim((string) ($vdata['METHOD'] ?? 'MANUAL')));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($eventid)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        if ($method !== 'KAMERA' && $method !== 'MANUAL') {
            $method = 'MANUAL';
        }
        if ($token === '' && $code === '') {
            return json_encode(['success' => 'false', 'message' => 'Token atau kode tiket wajib diisi.']);
        }

        // Rate-limit: hitung percobaan 1 menit terakhir (IP + petugas).
        try {
            $cnt = DB::selectOne("
                SELECT COUNT(*) AS C FROM T_SCAN_LOG
                WHERE USERIP = ? AND USERLOGIN = ?
                  AND SCANTIME >= DATEADD(MINUTE, -1, GETDATE())
            ", [self::requestIp(), $by]);
            if ($cnt && (int) $cnt->C >= self::SCAN_LIMIT) {
                return json_encode(['success' => 'false', 'message' => 'Terlalu sering. Tunggu sebentar lalu coba lagi.']);
            }
        } catch (\Throwable $e) {
            // lanjut (fail-open untuk baca)
        }

        $shown = $token !== '' ? $token : $code;
        $fail = function (string $result, string $message, $attid = null) use ($eventid, $shown, $method, $by) {
            self::logScan((int) $eventid, $attid, $shown, $result, $method, $by);
            return json_encode([
                'success' => 'false', 'message' => $message,
                'Rows' => [['RESULT' => $result]],
            ]);
        };

        // 1) Tanda tangan + versi QR.
        $attid = 0;
        $tcode = '';
        if ($token !== '') {
            $v = TicketQr::verify($token);
            if (!$v['ok']) {
                return $fail('TIDAK_VALID', 'Tiket tidak valid.');
            }
            $attid = $v['attendeeid'];
            $tcode = $v['ticketcode'];
            $row = DB::selectOne("
                SELECT A.ATTENDEEID, A.TICKETCODE, A.QRVERSION
                FROM T_ATTENDEE A WHERE A.ATTENDEEID = ?
            ", [$attid]);
            if (!$row || strtoupper(trim((string) $row->TICKETCODE)) !== strtoupper($tcode)) {
                return $fail('TIDAK_VALID', 'Tiket tidak valid.');
            }
            if ((int) ($row->QRVERSION ?? 1) !== (int) $v['version']) {
                return $fail('TIDAK_VALID', 'Tiket tidak valid.');
            }
        } else {
            $row = DB::selectOne("
                SELECT ATTENDEEID FROM T_ATTENDEE WHERE UPPER(TICKETCODE) = UPPER(?)
            ", [$code]);
            if (!$row) {
                return $fail('TIDAK_VALID', 'Tiket tidak valid.');
            }
            $attid = (int) $row->ATTENDEEID;
        }

        // 2) Tiket + event-nya.
        $t = DB::selectOne("
            SELECT A.ATTENDEEID, A.TICKETCODE, A.NAME, A.EVENTID,
                   A.PAYSTATUS, A.ATTENDSTATUS, A.TIKETSTATUS,
                   A.CHECKINTIME, A.SYSUPDATEUSER AS CHECKBY,
                   T.NAME AS TYPENAME,
                   E.STATUS AS EVENTSTATUS, E.STARTAT, E.ENDAT
            FROM T_ATTENDEE A
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            WHERE A.ATTENDEEID = ?
        ", [$attid]);
        if (!$t) {
            return $fail('TIDAK_VALID', 'Tiket tidak valid.');
        }

        // 3) Milik event yang dipilih?
        if ((int) ($t->EVENTID ?? 0) !== (int) $eventid) {
            return $fail('SALAH_EVENT', 'Tiket bukan untuk event ini.', $attid);
        }

        // 4) Event CANCELLED/DRAFT -> generik (tanpa bocor detail).
        $evst = strtoupper(trim((string) ($t->EVENTSTATUS ?? '')));
        if ($evst === 'CANCELLED' || $evst === 'DRAFT') {
            return $fail('TIDAK_VALID', 'Tiket tidak valid.', $attid);
        }

        // 5-7) Status tiket/pembayaran.
        if (strtoupper(trim((string) $t->TIKETSTATUS)) !== 'AKTIF') {
            return $fail('DIBATALKAN', 'Tiket sudah dibatalkan.', $attid);
        }
        if (strtoupper(trim((string) $t->PAYSTATUS)) === 'REFUND') {
            return $fail('REFUND', 'Tiket sudah direfund.', $attid);
        }
        if (strtoupper(trim((string) $t->PAYSTATUS)) !== 'LUNAS') {
            return $fail('BELUM_DIBAYAR', 'Tiket belum dibayar.', $attid);
        }

        // 8) Sudah dipakai? Sertakan waktu + petugas sebelumnya.
        if (strtoupper(trim((string) $t->ATTENDSTATUS)) === 'HADIR') {
            self::logScan((int) $eventid, $attid, $shown, 'SUDAH_DIPAKAI', $method, $by);
            return json_encode([
                'success' => 'false', 'message' => 'Tiket sudah dipakai.',
                'Rows' => [[
                    'RESULT' => 'SUDAH_DIPAKAI',
                    'NAME' => (string) ($t->NAME ?? ''),
                    'TYPENAME' => (string) ($t->TYPENAME ?? ''),
                    'TICKETCODE' => (string) ($t->TICKETCODE ?? ''),
                    'CHECKINTIME' => (string) ($t->CHECKINTIME ?? ''),
                    'CHECKBY' => (string) ($t->CHECKBY ?? ''),
                ]],
            ]);
        }

        // 9) Window: [STARTAT - N jam, ENDAT].
        if (!empty($t->STARTAT) && !empty($t->ENDAT)) {
            $now = time();
            $open = strtotime((string) $t->STARTAT) - self::windowHours() * 3600;
            $close = strtotime((string) $t->ENDAT);
            if ($now < $open || $now > $close) {
                return $fail('DI_LUAR_JADWAL', 'Di luar jadwal check-in.', $attid);
            }
        }

        // 10) Check-in atomik: hanya satu yang menang bila scan bersamaan.
        $n = DB::update("
            UPDATE T_ATTENDEE
            SET ATTENDSTATUS = 'HADIR', CHECKINTIME = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ATTENDEEID = ? AND ATTENDSTATUS = 'BELUM_HADIR'
              AND TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
        ", [$by !== '' ? mb_substr($by, 0, 25) : null, $attid]);

        if ($n < 1) {
            return $fail('SUDAH_DIPAKAI', 'Tiket sudah dipakai.', $attid);
        }

        self::logScan((int) $eventid, $attid, $shown, 'VALID', $method, $by);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mscanticket', 'page' => 'Scan Ticket',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($t->TICKETCODE ?? $attid),
            'summary' => 'SCAN HADIR ' . (string) ($t->TICKETCODE ?? $attid) . ' (' . $method . ')',
            'before' => ['ATTENDSTATUS' => 'BELUM_HADIR'],
            'after' => ['ATTENDSTATUS' => 'HADIR'],
            'userlogin' => $by,
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Check-in berhasil.',
            'Rows' => [[
                'RESULT' => 'VALID',
                'NAME' => (string) ($t->NAME ?? ''),
                'TYPENAME' => (string) ($t->TYPENAME ?? ''),
                'TICKETCODE' => (string) ($t->TICKETCODE ?? ''),
            ]],
        ]);
    }
}
