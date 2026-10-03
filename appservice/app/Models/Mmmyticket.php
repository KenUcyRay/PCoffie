<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Tiket saya (Ticket Order, module Ticketing). Baca dari dbo.T_ATTENDEE
// (satu baris = satu tiket) + info event/tipe. Tanpa tabel baru.
// SEGMENT frontend: home/mmyticket/mmyticket. Menu CPMENU MCONTROL = mmyticket.
//
// read_data/read_detail/read_token/process_regen/process_resend/process_cancel.
// Token QR dibuat ulang dari kode+ID+event+versi + HMAC (tidak disimpan).
// Batal memakai Mmattendee::process_cancel (pakai ulang, bukan duplikat).
class Mmmyticket extends Model
{
    use ColumnFilter;

    const MCODE = 40010002;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'ATTENDEEID' => 'A.ATTENDEEID',
            'TICKETCODE' => 'A.TICKETCODE',
            'NAME' => 'A.NAME',
            'PAYSTATUS' => 'A.PAYSTATUS',
            'ATTENDSTATUS' => 'A.ATTENDSTATUS',
            'TIKETSTATUS' => 'A.TIKETSTATUS',
            'REGDATE' => 'A.REGDATE',
        ];
    }

    // Tolak bila group user tidak punya akses menu My Ticket.
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

    // Samarkan email/phone untuk Audit Log (pakai ulang helper Attendee).
    private static function maskContact(?string $email, ?string $phone): array
    {
        $e = trim((string) $email);
        $p = trim((string) $phone);
        $me = $e;
        if ($e !== '' && strpos($e, '@') !== false) {
            [$u, $d] = explode('@', $e, 2);
            $me = substr($u, 0, 2) . '****@' . $d;
        }
        $mp = $p;
        if (strlen($p) > 6) {
            $mp = substr($p, 0, 4) . '****' . substr($p, -2);
        }
        return [$me, $mp];
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = trim((string) ($vdata['EVENTID'] ?? ($param['eventid'] ?? '')));
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $pay = strtoupper(trim((string) ($param['paystatus'] ?? '')));
        $attend = strtoupper(trim((string) ($param['attendstatus'] ?? '')));
        $tstatus = strtoupper(trim((string) ($param['tiketstatus'] ?? '')));
        $typeid = trim((string) ($param['tickettypeid'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($eventid !== '' && filter_var($eventid, FILTER_VALIDATE_INT) !== false) {
            $where = " WHERE A.EVENTID = ?";
            $args[] = (int) $eventid;
        }
        $and = function () use (&$where) { return $where === '' ? ' WHERE ' : ' AND '; };
        if ($q !== '') {
            $where .= $and() . '(A.NAME LIKE ? OR A.EMAIL LIKE ? OR A.TICKETCODE LIKE ?)';
            $like = '%' . $q . '%';
            $args[] = $like;
            $args[] = $like;
            $args[] = $like;
        }
        if ($pay !== '' && in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            $where .= $and() . 'A.PAYSTATUS = ?';
            $args[] = $pay;
        }
        if ($attend !== '' && in_array($attend, ['BELUM_HADIR', 'HADIR'], true)) {
            $where .= $and() . 'A.ATTENDSTATUS = ?';
            $args[] = $attend;
        }
        if ($tstatus !== '' && in_array($tstatus, ['AKTIF', 'DIBATALKAN'], true)) {
            $where .= $and() . 'A.TIKETSTATUS = ?';
            $args[] = $tstatus;
        }
        if ($typeid !== '' && filter_var($typeid, FILTER_VALIDATE_INT) !== false) {
            $where .= $and() . 'A.TICKETTYPEID = ?';
            $args[] = (int) $typeid;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa kondisi harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_ATTENDEE A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.REGDATE DESC, A.ATTENDEEID DESC';

        $sql = "
            SELECT A.ATTENDEEID, A.EVENTID, E.TITLE AS EVENTTITLE, A.TICKETTYPEID,
                   T.NAME AS TYPENAME, A.NAME, A.EMAIL, A.PHONE, A.TICKETCODE,
                   A.PAYSTATUS, A.ATTENDSTATUS, A.CHECKINTIME, A.TIKETSTATUS,
                   A.QRVERSION, A.LASTSENTAT, A.REGDATE,
                   E.STATUS AS EVENTSTATUS, E.STARTAT, E.ENDAT
            FROM T_ATTENDEE A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
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

    // Ringkasan: total, aktif, sudah dipakai (HADIR), dibatalkan.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = trim((string) ($vdata['EVENTID'] ?? ($param['eventid'] ?? '')));

        $where = '';
        $args = [];
        if ($eventid !== '' && filter_var($eventid, FILTER_VALIDATE_INT) !== false) {
            $where = " WHERE A.EVENTID = ?";
            $args[] = (int) $eventid;
        }

        $row = DB::selectOne("
            SELECT COUNT(*) AS TOTAL,
                   SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' THEN 1 ELSE 0 END) AS AKTIF,
                   SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.ATTENDSTATUS = 'HADIR' THEN 1 ELSE 0 END) AS DIPAKAI,
                   SUM(CASE WHEN A.TIKETSTATUS = 'DIBATALKAN' THEN 1 ELSE 0 END) AS BATAL
            FROM T_ATTENDEE A" . $where, $args);

        return json_encode(['success' => true, 'Rows' => [[
            'TOTAL' => $row ? (int) $row->TOTAL : 0,
            'AKTIF' => $row ? (int) $row->AKTIF : 0,
            'DIPAKAI' => $row ? (int) $row->DIPAKAI : 0,
            'BATAL' => $row ? (int) $row->BATAL : 0,
        ]]]);
    }

    // Detail tiket + token QR (dibuat ulang saat diminta, tidak disimpan).
    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ATTENDEEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ATTENDEEID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, E.TITLE AS EVENTTITLE, E.STATUS AS EVENTSTATUS,
                   E.STARTAT, E.ENDAT, E.VENUE, T.NAME AS TYPENAME, T.PRICE
            FROM T_ATTENDEE A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
            WHERE A.ATTENDEEID = ?
        ", [$id]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tiket tidak ditemukan.']);
        }

        $arr = (array) $row;
        $token = TicketQr::issue((int) $row->ATTENDEEID, (string) ($row->TICKETCODE ?? ''), (int) ($row->QRVERSION ?? 1));
        $arr['QRTOKEN'] = $token ?: '';
        // QR nonaktif bila tiket sudah dipakai/dibatalkan atau event berakhir.
        $evst = strtoupper(trim((string) ($row->EVENTSTATUS ?? '')));
        $arr['QRACTIVE'] = (
            strtoupper(trim((string) $row->TIKETSTATUS)) === 'AKTIF'
            && strtoupper(trim((string) $row->ATTENDSTATUS)) !== 'HADIR'
            && $evst !== 'ENDED' && $evst !== 'CANCELLED' && $token !== null
        ) ? 'YES' : 'NO';

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    public static function read_token($param)
    {
        return self::read_detail($param);
    }

    // Buat ulang QR: naikkan versi (QR lama mati), alasan wajib.
    // Tiket HADIR/DIBATALKAN atau event ENDED/CANCELLED ditolak.
    public static function process_regen($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ATTENDEEID'] ?? null;
        $reason = trim((string) ($vdata['REASON'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ATTENDEEID tidak ditemukan.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan buat ulang QR wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $row = DB::selectOne("
            SELECT A.ATTENDEEID, A.TICKETCODE, A.NAME, A.EMAIL, A.PHONE,
                   A.TIKETSTATUS, A.ATTENDSTATUS, A.QRVERSION,
                   E.STATUS AS EVENTSTATUS
            FROM T_ATTENDEE A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            WHERE A.ATTENDEEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tiket tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->TIKETSTATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dibatalkan.']);
        }
        if (strtoupper(trim((string) $row->ATTENDSTATUS)) === 'HADIR') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dipakai, tidak bisa dibuat ulang QR-nya.']);
        }
        $evst = strtoupper(trim((string) ($row->EVENTSTATUS ?? '')));
        if ($evst === 'ENDED' || $evst === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Event ' . $evst . ', QR tidak bisa dibuat ulang.']);
        }

        $newVer = max(1, (int) ($row->QRVERSION ?? 1)) + 1;
        DB::update("
            UPDATE T_ATTENDEE
            SET QRVERSION = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ATTENDEEID = ?
        ", [$newVer, $by, $id]);

        [$me, $mp] = self::maskContact((string) ($row->EMAIL ?? ''), (string) ($row->PHONE ?? ''));
        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mmyticket', 'page' => 'My Ticket',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'QR ULANG ' . (string) ($row->TICKETCODE ?? $id) . ': ' . mb_substr($reason, 0, 100),
            'before' => ['NAME' => (string) ($row->NAME ?? ''), 'EMAIL' => $me, 'PHONE' => $mp, 'QRVERSION' => (string) ($row->QRVERSION ?? 1)],
            'after' => ['QRVERSION' => (string) $newVer],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'QR baru diterbitkan. QR lama tidak berlaku lagi.']);
    }

    // Kirim ulang tiket via template TICKET_ISSUED (EMAIL). Rate-limit 5/menit.
    // SMTP/template bermasalah -> pesan jelas, tanpa error.
    public static function process_resend($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ATTENDEEID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ATTENDEEID tidak ditemukan.']);
        }
        if (!SmtpMailer::checkTestRate($by)) {
            return json_encode(['success' => 'false', 'message' => 'Terlalu sering. Coba lagi setelah 1 menit.']);
        }

        $row = DB::selectOne("
            SELECT A.ATTENDEEID, A.TICKETCODE, A.NAME, A.EMAIL, A.TIKETSTATUS,
                   A.QRVERSION, E.TITLE AS EVENTTITLE, E.STATUS AS EVENTSTATUS,
                   E.STARTAT, T.NAME AS TYPENAME
            FROM T_ATTENDEE A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
            WHERE A.ATTENDEEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tiket tidak ditemukan.']);
        }
        $to = trim((string) ($row->EMAIL ?? ''));
        if ($to === '' || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            return json_encode(['success' => 'false', 'message' => 'Email peserta tidak valid.']);
        }
        if (strtoupper(trim((string) $row->TIKETSTATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dibatalkan.']);
        }

        $r = NotificationTemplate::render('TICKET_ISSUED', 'EMAIL', [
            'nama' => (string) ($row->NAME ?? ''),
            'event' => (string) ($row->EVENTTITLE ?? ''),
            'nomor_order' => (string) ($row->TICKETCODE ?? ''),
            'jadwal' => (string) ($row->STARTAT ?? ''),
        ]);
        if (!$r['ok']) {
            return json_encode(['success' => 'false', 'message' => $r['message']]);
        }

        $smtp = DB::selectOne("
            SELECT TOP 1 MAILFROMNAME, MAILFROMEMAIL, SMTPHOST, SMTPPORT, SMTPENCRYPTION,
                           SMTPUSERNAME, dbo.app_decrypt(SMTPPASSWORD) AS PLAIN
            FROM T_APP_SETTING ORDER BY SETTINGID
        ");
        if (!$smtp || trim((string) ($smtp->SMTPHOST ?? '')) === '') {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan SMTP belum diisi di General Setting.']);
        }

        $sent = SmtpMailer::send([
            'HOST' => (string) ($smtp->SMTPHOST ?? ''),
            'PORT' => (string) ($smtp->SMTPPORT ?? ''),
            'ENCRYPTION' => (string) ($smtp->SMTPENCRYPTION ?? 'NONE'),
            'USERNAME' => (string) ($smtp->SMTPUSERNAME ?? ''),
            'PASSWORD' => trim((string) ($smtp->PLAIN ?? '')),
            'FROMEMAIL' => (string) ($smtp->MAILFROMEMAIL ?? ''),
            'FROMNAME' => (string) ($smtp->MAILFROMNAME ?? ''),
        ], $to, $r['subject'], $r['body']);

        // Catat waktu kirim hanya bila benar terkirim (best-effort).
        if ($sent['ok']) {
            try {
                DB::update("UPDATE T_ATTENDEE SET LASTSENTAT = GETDATE() WHERE ATTENDEEID = ?", [$id]);
            } catch (\Throwable $e) {
                // abaikan
            }
        }

        SysLog::log($sent['ok'] ? 'INFO' : 'WARNING', 'API', 'Kirim ulang tiket: ' . ($sent['ok'] ? 'terkirim' : 'gagal') . '.', [
            'to' => $to, 'ticket' => (string) ($row->TICKETCODE ?? $id),
        ]);

        if (!$sent['ok']) {
            return json_encode(['success' => 'false', 'message' => $sent['message']]);
        }

        [$me, $mp] = self::maskContact($to, '');
        AuditTrail::log([
            'action' => 'LAINNYA', 'mcontrol' => 'mmyticket', 'page' => 'My Ticket',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'KIRIM ULANG ' . (string) ($row->TICKETCODE ?? $id),
            'before' => [],
            'after' => ['EMAIL' => $me],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => $sent['message']]);
    }

    // Batalkan tiket: pakai ulang Mmattendee::cancelTicket (aturan sama:
    // alasan wajib, kuota kembali, tanpa hapus permanen) dengan konteks audit
    // halaman ini. Akses yang dicek = mmyticket (bukan mattendee).
    public static function process_cancel($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ATTENDEEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ATTENDEEID tidak ditemukan.']);
        }

        return Mmattendee::cancelTicket(
            (int) $id,
            (string) ($vdata['REASON'] ?? ''),
            $param['VUSERLOGIN'] ?? '',
            'mmyticket',
            'My Ticket'
        );
    }
}
