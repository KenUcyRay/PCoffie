<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Daftar peserta per event (Event Management, module Event). Tabel dbo.T_ATTENDEE.
// SEGMENT frontend: home/mattendee/mattendee. Menu CPMENU MCONTROL = mattendee.
//
// Satu baris = satu tiket. Terjual = TIKETSTATUS AKTIF + PAYSTATUS LUNAS.
// ORDERID/ORDERCODE disiapkan NULL untuk dipakai ulang module Ticketing.
// Email/phone TIDAK masuk System Log; di Audit Log disamarkan sebagian.
class Mmattendee extends Model
{
    use ColumnFilter;

    const MCODE = 30010004;
    const EXPORT_LIMIT = 10000;
    const IMPORT_LIMIT = 1000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'ATTENDEEID' => 'A.ATTENDEEID',
            'TICKETCODE' => 'A.TICKETCODE',
            'NAME' => 'A.NAME',
            'EMAIL' => 'A.EMAIL',
            'PAYSTATUS' => 'A.PAYSTATUS',
            'ATTENDSTATUS' => 'A.ATTENDSTATUS',
            'CHECKINTIME' => 'A.CHECKINTIME',
            'TIKETSTATUS' => 'A.TIKETSTATUS',
            'REGDATE' => 'A.REGDATE',
        ];
    }

    // Tolak bila group user tidak punya akses menu Attendee List.
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

    // Samarkan email/phone untuk Audit Log (sebagian, tanpa nilai penuh).
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

    // Kode tiket acak non-urutan (10 char alfanumerik). Retry bila tabrakan.
    private static function genTicketCode(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $code = 'T-' . strtoupper(substr(bin2hex(random_bytes(8)), 0, 10));
            $hit = DB::selectOne("SELECT 1 AS X FROM T_ATTENDEE WHERE TICKETCODE = ?", [$code]);
            if (!$hit) {
                return $code;
            }
        }
        return 'T-' . strtoupper(bin2hex(random_bytes(8)));
    }

    // Cek kuota tipe (dipanggil DALAM transaksi + kunci UPDLOCK/HOLDLOCK).
    // Return sisa kuota (>= 0) atau pesan error bila $need melebihi sisa.
    private static function quotaLeft(int $typeid, int $need): array
    {
        $t = DB::selectOne("
            SELECT QUOTA FROM T_TICKET_TYPE WITH (UPDLOCK, HOLDLOCK)
            WHERE TICKETTYPEID = ?
        ", [$typeid]);
        if (!$t) {
            return [0, 'Data tipe tiket tidak ditemukan.'];
        }
        $sold = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_ATTENDEE WITH (UPDLOCK, HOLDLOCK)
            WHERE TICKETTYPEID = ? AND TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
        ", [$typeid]);
        $left = (int) $t->QUOTA - ($sold ? (int) $sold->C : 0);
        if ($left < $need) {
            return [$left, 'Kuota tipe tiket tidak mencukupi (sisa ' . max(0, $left) . ').'];
        }
        return [$left, null];
    }

    // Ambil tipe + event-nya, pastikan milik event itu dan aktif.
    // Return [typeRow, eventRow] atau [null, pesanError].
    private static function typeForEvent(int $typeid, int $eventid): array
    {
        $t = DB::selectOne("SELECT * FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [$typeid]);
        if (!$t) {
            return [null, 'Data tipe tiket tidak ditemukan.'];
        }
        if ((int) $t->EVENTID !== $eventid) {
            return [null, 'Tipe tiket bukan milik event ini.'];
        }
        if (strtoupper(trim((string) $t->ISACTIVE)) !== 'YES') {
            return [null, 'Tipe tiket sudah nonaktif.'];
        }
        return [$t, null];
    }

    // Validasi nama/email/phone. Return pesan atau null.
    private static function validatePerson(string $name, string $email, string $phone): ?string
    {
        if ($name === '') {
            return 'Nama wajib diisi.';
        }
        if (mb_strlen($name) > 100) {
            return 'Nama maksimal 100 karakter.';
        }
        if ($email === '') {
            return 'Email wajib diisi.';
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return 'Format email tidak valid.';
        }
        if (mb_strlen($email) > 100) {
            return 'Email maksimal 100 karakter.';
        }
        if ($phone !== '' && !preg_match('/^[0-9+\-\s]+$/', $phone)) {
            return 'Telepon hanya boleh angka, plus, spasi, dan strip.';
        }
        if (mb_strlen($phone) > 30) {
            return 'Telepon maksimal 30 karakter.';
        }
        return null;
    }

    public static function read_data($param)
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

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $pay = strtoupper(trim((string) ($param['paystatus'] ?? '')));
        $attend = strtoupper(trim((string) ($param['attendstatus'] ?? '')));
        $tstatus = strtoupper(trim((string) ($param['tiketstatus'] ?? '')));
        $typeid = trim((string) ($param['tickettypeid'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.EVENTID = ?";
        $args = [(int) $eventid];
        if ($q !== '') {
            $where .= " AND (A.NAME LIKE ? OR A.EMAIL LIKE ? OR A.TICKETCODE LIKE ?)";
            $like = '%' . $q . '%';
            $args[] = $like;
            $args[] = $like;
            $args[] = $like;
        }
        if ($pay !== '' && in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            $where .= " AND A.PAYSTATUS = ?";
            $args[] = $pay;
        }
        if ($attend !== '' && in_array($attend, ['BELUM_HADIR', 'HADIR'], true)) {
            $where .= " AND A.ATTENDSTATUS = ?";
            $args[] = $attend;
        }
        if ($tstatus !== '' && in_array($tstatus, ['AKTIF', 'DIBATALKAN'], true)) {
            $where .= " AND A.TIKETSTATUS = ?";
            $args[] = $tstatus;
        }
        if ($typeid !== '' && filter_var($typeid, FILTER_VALIDATE_INT) !== false) {
            $where .= " AND A.TICKETTYPEID = ?";
            $args[] = (int) $typeid;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_ATTENDEE A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.REGDATE DESC, A.ATTENDEEID DESC';

        $sql = "
            SELECT A.ATTENDEEID, A.EVENTID, A.TICKETTYPEID, T.NAME AS TYPENAME,
                   A.NAME, A.EMAIL, A.PHONE, A.TICKETCODE, A.SOURCE,
                   A.PAYSTATUS, A.ATTENDSTATUS, A.CHECKINTIME, A.TIKETSTATUS, A.REGDATE
            FROM T_ATTENDEE A
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

    // Ringkasan per event: total, lunas, belum bayar, hadir, persen hadir.
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
            SELECT COUNT(*) AS TOTAL,
                   SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.PAYSTATUS = 'LUNAS' THEN 1 ELSE 0 END) AS LUNAS,
                   SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.PAYSTATUS = 'BELUM_BAYAR' THEN 1 ELSE 0 END) AS BELUMBAYAR,
                   SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.ATTENDSTATUS = 'HADIR' THEN 1 ELSE 0 END) AS HADIR
            FROM T_ATTENDEE A WHERE A.EVENTID = ?
        ", [(int) $eventid]);

        $total = $row ? (int) $row->TOTAL : 0;
        $hadir = $row ? (int) $row->HADIR : 0;

        return json_encode(['success' => true, 'Rows' => [[
            'TOTAL' => $total,
            'LUNAS' => $row ? (int) $row->LUNAS : 0,
            'BELUMBAYAR' => $row ? (int) $row->BELUMBAYAR : 0,
            'HADIR' => $hadir,
            'HADIRPCT' => $total > 0 ? (int) round($hadir * 100 / $total) : 0,
        ]]]);
    }

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
            SELECT A.*, T.NAME AS TYPENAME
            FROM T_ATTENDEE A
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
            WHERE A.ATTENDEEID = ?
        ", [$id]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data peserta tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Tambah manual: kuota dikunci dalam transaksi supaya penambahan
    // bersamaan tidak melebihi kuota.
    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = $vdata['EVENTID'] ?? null;
        $typeid = $vdata['TICKETTYPEID'] ?? null;
        $name = trim((string) ($vdata['NAME'] ?? ''));
        $email = trim((string) ($vdata['EMAIL'] ?? ''));
        $phone = trim((string) ($vdata['PHONE'] ?? ''));
        $pay = strtoupper(trim((string) ($vdata['PAYSTATUS'] ?? 'BELUM_BAYAR')));

        if (empty($eventid)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        if (empty($typeid)) {
            return json_encode(['success' => 'false', 'message' => 'Tipe tiket wajib dipilih.']);
        }
        if (!in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            return json_encode(['success' => 'false', 'message' => 'Status pembayaran tidak valid.']);
        }

        $err = self::validatePerson($name, $email, $phone);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        [$t, $terr] = self::typeForEvent((int) $typeid, (int) $eventid);
        if ($terr !== null) {
            return json_encode(['success' => 'false', 'message' => $terr]);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            // Kunci kuota dulu; LUNAS langsung mengurangi sisa.
            if ($pay === 'LUNAS') {
                [, $qerr] = self::quotaLeft((int) $typeid, 1);
                if ($qerr !== null) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => $qerr]);
                }
            }

            $code = self::genTicketCode();
            DB::insert("
                INSERT INTO T_ATTENDEE
                    (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE,
                     SOURCE, PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, REGDATE,
                     SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, ?, ?, ?,
                     'MANUAL', ?, 'BELUM_HADIR', 'AKTIF', GETDATE(),
                     ?, GETDATE())
            ", [
                (int) $eventid, (int) $typeid,
                mb_substr($name, 0, 100), mb_substr($email, 0, 100),
                $phone !== '' ? mb_substr($phone, 0, 30) : null, $code,
                $pay, $param['VUSERLOGIN'] ?? '',
            ]);
            $id = (int) $pdo->lastInsertId();

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal menambah peserta.', ['event' => $eventid], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal menambah peserta. Silakan coba lagi.']);
        }

        [$me, $mp] = self::maskContact($email, $phone);
        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => $code, 'summary' => 'PESERTA ' . $name . ' (' . $code . ')',
            'before' => [],
            'after' => ['NAME' => $name, 'EMAIL' => $me, 'PHONE' => $mp, 'PAYSTATUS' => $pay],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Peserta berhasil ditambahkan.',
            'Rows' => [['ATTENDEEID' => $id, 'TICKETCODE' => $code]],
        ]);
    }

    // Ubah data kontak peserta.
    public static function process_update_contact($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ATTENDEEID'] ?? null;
        $name = trim((string) ($vdata['NAME'] ?? ''));
        $email = trim((string) ($vdata['EMAIL'] ?? ''));
        $phone = trim((string) ($vdata['PHONE'] ?? ''));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ATTENDEEID tidak ditemukan.']);
        }

        $err = self::validatePerson($name, $email, $phone);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $row = DB::selectOne("SELECT ATTENDEEID, TICKETCODE, NAME, EMAIL, PHONE FROM T_ATTENDEE WHERE ATTENDEEID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data peserta tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_ATTENDEE
            SET NAME = ?, EMAIL = ?, PHONE = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ATTENDEEID = ?
        ", [
            mb_substr($name, 0, 100), mb_substr($email, 0, 100),
            $phone !== '' ? mb_substr($phone, 0, 30) : null,
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        [$meOld, $mpOld] = self::maskContact((string) ($row->EMAIL ?? ''), (string) ($row->PHONE ?? ''));
        [$me, $mp] = self::maskContact($email, $phone);
        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'KONTAK ' . (string) ($row->TICKETCODE ?? $id),
            'before' => ['NAME' => (string) ($row->NAME ?? ''), 'EMAIL' => $meOld, 'PHONE' => $mpOld],
            'after' => ['NAME' => $name, 'EMAIL' => $me, 'PHONE' => $mp],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kontak peserta berhasil diupdate.']);
    }

    // Ubah status pembayaran. Ke LUNAS dicek kuota (dalam transaksi + kunci).
    public static function process_paystatus($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['ATTENDEEID'] ?? null;
        $pay = strtoupper(trim((string) ($vdata['PAYSTATUS'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'ATTENDEEID tidak ditemukan.']);
        }
        if (!in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            return json_encode(['success' => 'false', 'message' => 'Status pembayaran tidak valid.']);
        }

        $row = DB::selectOne("
            SELECT ATTENDEEID, TICKETTYPEID, TICKETCODE, PAYSTATUS, TIKETSTATUS
            FROM T_ATTENDEE WHERE ATTENDEEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data peserta tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->TIKETSTATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dibatalkan.']);
        }
        if (strtoupper(trim((string) $row->PAYSTATUS)) === $pay) {
            return json_encode(['success' => 'true', 'message' => 'Status pembayaran tidak berubah.']);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            // Masuk LUNAS = menambah hunian kuota -> kunci + cek.
            if ($pay === 'LUNAS') {
                [, $qerr] = self::quotaLeft((int) $row->TICKETTYPEID, 1);
                if ($qerr !== null) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => $qerr]);
                }
            }

            DB::update("
                UPDATE T_ATTENDEE
                SET PAYSTATUS = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE ATTENDEEID = ?
            ", [$pay, $param['VUSERLOGIN'] ?? '', $id]);

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal mengubah status pembayaran.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengubah status pembayaran.']);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'BAYAR ' . (string) ($row->TICKETCODE ?? $id) . ' -> ' . $pay,
            'before' => ['PAYSTATUS' => (string) $row->PAYSTATUS],
            'after' => ['PAYSTATUS' => $pay],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Status pembayaran berhasil diupdate.']);
    }

    // Tandai hadir: tiket AKTIF+LUNAS, belum HADIR, dalam window check-in
    // [STARTAT-24 jam, ENDAT], event tidak CANCELLED. Penanda manual.
    public static function process_checkin($param)
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
            SELECT A.ATTENDEEID, A.TICKETCODE, A.PAYSTATUS, A.ATTENDSTATUS, A.TIKETSTATUS,
                   E.STATUS AS EVENTSTATUS, E.STARTAT, E.ENDAT
            FROM T_ATTENDEE A
            JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            WHERE A.ATTENDEEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data peserta tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->TIKETSTATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dibatalkan.']);
        }
        if (strtoupper(trim((string) $row->PAYSTATUS)) !== 'LUNAS') {
            return json_encode(['success' => 'false', 'message' => 'Hanya tiket LUNAS yang bisa ditandai hadir.']);
        }
        if (strtoupper(trim((string) $row->ATTENDSTATUS)) === 'HADIR') {
            return json_encode(['success' => 'false', 'message' => 'Peserta sudah ditandai hadir.']);
        }
        if (strtoupper(trim((string) ($row->EVENTSTATUS ?? ''))) === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Event dibatalkan.']);
        }
        if (!empty($row->STARTAT) && !empty($row->ENDAT)) {
            $now = time();
            $open = strtotime((string) $row->STARTAT) - 24 * 3600;
            $close = strtotime((string) $row->ENDAT);
            if ($now < $open || $now > $close) {
                return json_encode(['success' => 'false', 'message' => 'Di luar window check-in (H-1 sampai event selesai).']);
            }
        }

        // Update bersyarat (atomik, sama seperti check-in Scan Ticket):
        // dua penanda bersamaan hanya satu yang berhasil.
        $n = DB::update("
            UPDATE T_ATTENDEE
            SET ATTENDSTATUS = 'HADIR', CHECKINTIME = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ATTENDEEID = ? AND ATTENDSTATUS = 'BELUM_HADIR'
        ", [$param['VUSERLOGIN'] ?? '', $id]);
        if ($n < 1) {
            return json_encode(['success' => 'false', 'message' => 'Peserta sudah ditandai hadir.']);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'HADIR ' . (string) ($row->TICKETCODE ?? $id) . ' (manual)',
            'before' => ['ATTENDSTATUS' => (string) $row->ATTENDSTATUS],
            'after' => ['ATTENDSTATUS' => 'HADIR'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Peserta ditandai hadir.']);
    }

    // Batalkan kehadiran: HADIR -> BELUM_HADIR (waktu check-in dikosongkan).
    public static function process_uncheckin($param)
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
            SELECT ATTENDEEID, TICKETCODE, ATTENDSTATUS, TIKETSTATUS
            FROM T_ATTENDEE WHERE ATTENDEEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data peserta tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->TIKETSTATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dibatalkan.']);
        }
        if (strtoupper(trim((string) $row->ATTENDSTATUS)) !== 'HADIR') {
            return json_encode(['success' => 'false', 'message' => 'Peserta belum ditandai hadir.']);
        }

        DB::update("
            UPDATE T_ATTENDEE
            SET ATTENDSTATUS = 'BELUM_HADIR', CHECKINTIME = NULL,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ATTENDEEID = ?
        ", [$param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'BATAL HADIR ' . (string) ($row->TICKETCODE ?? $id) . ' (manual)',
            'before' => ['ATTENDSTATUS' => 'HADIR'],
            'after' => ['ATTENDSTATUS' => 'BELUM_HADIR'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kehadiran dibatalkan.']);
    }

    // Batalkan tiket: alasan wajib, TIKETSTATUS -> DIBATALKAN (kuota kembali
    // karena sold hanya menghitung AKTIF). Tanpa hapus permanen.
    // Inti logika (tanpa cek akses) supaya bisa dipakai ulang halaman lain
    // (mis. My Ticket) dengan mcontrol/page-nya sendiri.
    public static function cancelTicket(int $id, string $reason, string $by, string $mcontrol, string $page): string
    {
        $reason = trim($reason);
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan pembatalan wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $row = DB::selectOne("
            SELECT ATTENDEEID, TICKETCODE, NAME, EMAIL, PHONE, TIKETSTATUS
            FROM T_ATTENDEE WHERE ATTENDEEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data peserta tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->TIKETSTATUS)) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Tiket sudah dibatalkan.']);
        }

        DB::update("
            UPDATE T_ATTENDEE
            SET TIKETSTATUS = 'DIBATALKAN',
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE ATTENDEEID = ?
        ", [$by, $id]);

        [$me, $mp] = self::maskContact((string) ($row->EMAIL ?? ''), (string) ($row->PHONE ?? ''));
        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => $mcontrol, 'page' => $page,
            'table' => 'T_ATTENDEE', 'dataId' => (string) ($row->TICKETCODE ?? $id),
            'summary' => 'BATAL TIKET ' . (string) ($row->TICKETCODE ?? $id) . ': ' . mb_substr($reason, 0, 100),
            'before' => ['TIKETSTATUS' => 'AKTIF', 'NAME' => (string) ($row->NAME ?? ''), 'EMAIL' => $me, 'PHONE' => $mp],
            'after' => ['TIKETSTATUS' => 'DIBATALKAN'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Tiket berhasil dibatalkan. Kuota tersedia kembali.']);
    }

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

        return self::cancelTicket((int) $id, (string) ($vdata['REASON'] ?? ''), $param['VUSERLOGIN'] ?? '', 'mattendee', 'Attendee List');
    }

    // Validasi satu baris import (dipakai preview + commit). Return pesan atau null.
    // $row: ['TYPENAME','NAME','EMAIL','PHONE','PAYSTATUS'] (string semua).
    private static function validateImportRow(array $row, int $eventid, array &$typeCache): ?string
    {
        $typename = trim((string) ($row['TYPENAME'] ?? ''));
        $name = trim((string) ($row['NAME'] ?? ''));
        $email = trim((string) ($row['EMAIL'] ?? ''));
        $phone = trim((string) ($row['PHONE'] ?? ''));
        $pay = strtoupper(trim((string) ($row['PAYSTATUS'] ?? 'BELUM_BAYAR')));
        if ($pay === '') {
            $pay = 'BELUM_BAYAR';
        }

        if ($typename === '') {
            return 'Nama tipe tiket wajib diisi.';
        }
        if (!isset($typeCache[$typename])) {
            $t = DB::selectOne("
                SELECT TICKETTYPEID FROM T_TICKET_TYPE
                WHERE EVENTID = ? AND UPPER(NAME) = UPPER(?) AND ISACTIVE = 'YES'
            ", [$eventid, $typename]);
            if (!$t) {
                return 'Tipe tiket "' . $typename . '" tidak ditemukan/aktif di event ini.';
            }
            $typeCache[$typename] = (int) $t->TICKETTYPEID;
        }
        $err = self::validatePerson($name, $email, $phone);
        if ($err !== null) {
            return $err;
        }
        if (!in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            return 'Status pembayaran harus BELUM_BAYAR, LUNAS, atau REFUND.';
        }
        return null;
    }

    // Pratinjau import: validasi seluruh baris, kembalikan laporan gagal.
    // Tidak menyimpan apa pun. Maks IMPORT_LIMIT baris.
    public static function import_preview($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = $vdata['EVENTID'] ?? null;
        $rows = $vdata['ROWS'] ?? [];

        if (empty($eventid)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        if (!is_array($rows) || count($rows) === 0) {
            return json_encode(['success' => 'false', 'message' => 'Tidak ada baris untuk diimport.']);
        }
        if (count($rows) > self::IMPORT_LIMIT) {
            return json_encode(['success' => 'false', 'message' => 'Maksimal ' . self::IMPORT_LIMIT . ' baris per import.']);
        }

        $typeCache = [];
        $errors = [];
        $n = 0;
        foreach ($rows as $r) {
            $n++;
            if (!is_array($r)) {
                $errors[] = ['row' => $n, 'reason' => 'Baris tidak valid.'];
                continue;
            }
            $err = self::validateImportRow($r, (int) $eventid, $typeCache);
            if ($err !== null) {
                $errors[] = ['row' => $n, 'reason' => $err];
            }
        }

        return json_encode(['success' => true, 'Rows' => [[
            'TOTAL' => count($rows),
            'VALID' => count($rows) - count($errors),
            'ERRORS' => $errors,
        ]]]);
    }

    // Commit import dalam SATU transaksi (+ kunci kuota per tipe).
    // SKIPINVALID=YES: lewati baris gagal; selain itu semua harus valid.
    public static function import_commit($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = $vdata['EVENTID'] ?? null;
        $rows = $vdata['ROWS'] ?? [];
        $skip = strtoupper(trim((string) ($vdata['SKIPINVALID'] ?? 'NO'))) === 'YES';

        if (empty($eventid)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        if (!is_array($rows) || count($rows) === 0) {
            return json_encode(['success' => 'false', 'message' => 'Tidak ada baris untuk diimport.']);
        }
        if (count($rows) > self::IMPORT_LIMIT) {
            return json_encode(['success' => 'false', 'message' => 'Maksimal ' . self::IMPORT_LIMIT . ' baris per import.']);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            $typeCache = [];
            $valid = [];
            $errors = [];
            $n = 0;
            foreach ($rows as $r) {
                $n++;
                if (!is_array($r)) {
                    $errors[] = ['row' => $n, 'reason' => 'Baris tidak valid.'];
                    continue;
                }
                $err = self::validateImportRow($r, (int) $eventid, $typeCache);
                if ($err !== null) {
                    $errors[] = ['row' => $n, 'reason' => $err];
                    continue;
                }
                $valid[] = ['n' => $n, 'row' => $r, 'typeid' => $typeCache[trim((string) $r['TYPENAME'])]];
            }
            if (!empty($errors) && !$skip) {
                $pdo->rollBack();
                return json_encode([
                    'success' => 'false',
                    'message' => count($errors) . ' baris gagal validasi. Perbaiki atau pilih lewati baris gagal.',
                    'Rows' => [['ERRORS' => $errors]],
                ]);
            }

            // Kunci kuota per tipe yang dipakai, lalu cek total sekaligus.
            $needByType = [];
            foreach ($valid as $v) {
                $pay = strtoupper(trim((string) ($v['row']['PAYSTATUS'] ?? 'BELUM_BAYAR')));
                if ($pay === '') {
                    $pay = 'BELUM_BAYAR';
                }
                if ($pay === 'LUNAS') {
                    $needByType[$v['typeid']] = ($needByType[$v['typeid']] ?? 0) + 1;
                }
            }
            foreach ($needByType as $tid => $need) {
                [, $qerr] = self::quotaLeft((int) $tid, $need);
                if ($qerr !== null) {
                    $pdo->rollBack();
                    return json_encode(['success' => 'false', 'message' => $qerr]);
                }
            }

            $saved = 0;
            foreach ($valid as $v) {
                $r = $v['row'];
                $pay = strtoupper(trim((string) ($r['PAYSTATUS'] ?? 'BELUM_BAYAR')));
                if ($pay === '') {
                    $pay = 'BELUM_BAYAR';
                }
                $code = self::genTicketCode();
                DB::insert("
                    INSERT INTO T_ATTENDEE
                        (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE,
                         SOURCE, PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, REGDATE,
                         SYSCREATEUSER, SYSCREATEDATE)
                    VALUES (?, ?, ?, ?, ?, ?,
                         'IMPORT', ?, 'BELUM_HADIR', 'AKTIF', GETDATE(),
                         ?, GETDATE())
                ", [
                    (int) $eventid, (int) $v['typeid'],
                    mb_substr(trim((string) $r['NAME']), 0, 100),
                    mb_substr(trim((string) $r['EMAIL']), 0, 100),
                    trim((string) ($r['PHONE'] ?? '')) !== '' ? mb_substr(trim((string) $r['PHONE']), 0, 30) : null,
                    $code, $pay, $param['VUSERLOGIN'] ?? '',
                ]);
                $saved++;
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal import peserta.', ['event' => $eventid], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal import peserta. Silakan coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => 'IMPORT',
            'summary' => 'IMPORT ' . $saved . ' peserta' . (!empty($errors) ? ' (' . count($errors) . ' dilewati)' : ''),
            'before' => [],
            'after' => ['SAVED' => $saved, 'SKIPPED' => count($errors)],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = 'Import selesai: ' . $saved . ' tersimpan.';
        if (!empty($errors)) {
            $msg .= ' ' . count($errors) . ' baris dilewati.';
        }
        return json_encode([
            'success' => 'true', 'message' => $msg,
            'Rows' => [['SAVED' => $saved, 'ERRORS' => $errors]],
        ]);
    }

    // Export CSV mengikuti filter aktif (maks EXPORT_LIMIT baris).
    // Return {success, filename, csv_base64, total, truncated}. Tanpa PII penuh?
    // Email/phone ikut (kebutuhan operasional); export dicatat jumlah baris saja.
    public static function read_export($param)
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

        // Susun ulang filter yang sama seperti read_data (tanpa paging).
        $q = trim((string) ($param['q'] ?? ''));
        $pay = strtoupper(trim((string) ($param['paystatus'] ?? '')));
        $attend = strtoupper(trim((string) ($param['attendstatus'] ?? '')));
        $tstatus = strtoupper(trim((string) ($param['tiketstatus'] ?? '')));

        $where = " WHERE A.EVENTID = ?";
        $args = [(int) $eventid];
        if ($q !== '') {
            $where .= " AND (A.NAME LIKE ? OR A.EMAIL LIKE ? OR A.TICKETCODE LIKE ?)";
            $like = '%' . $q . '%';
            $args[] = $like;
            $args[] = $like;
            $args[] = $like;
        }
        if ($pay !== '' && in_array($pay, ['BELUM_BAYAR', 'LUNAS', 'REFUND'], true)) {
            $where .= " AND A.PAYSTATUS = ?";
            $args[] = $pay;
        }
        if ($attend !== '' && in_array($attend, ['BELUM_HADIR', 'HADIR'], true)) {
            $where .= " AND A.ATTENDSTATUS = ?";
            $args[] = $attend;
        }
        if ($tstatus !== '' && in_array($tstatus, ['AKTIF', 'DIBATALKAN'], true)) {
            $where .= " AND A.TIKETSTATUS = ?";
            $args[] = $tstatus;
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_ATTENDEE A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT A.TICKETCODE, A.NAME, A.EMAIL, A.PHONE, T.NAME AS TYPENAME,
                   A.PAYSTATUS, A.ATTENDSTATUS, A.CHECKINTIME, A.TIKETSTATUS, A.REGDATE
            FROM T_ATTENDEE A
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
            " . $where . "
            ORDER BY A.REGDATE DESC, A.ATTENDEEID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Kode Tiket', 'Nama', 'Email', 'Telepon', 'Tipe', 'Bayar', 'Hadir', 'Check-in', 'Status', 'Daftar'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->TICKETCODE, $r->NAME, $r->EMAIL, $r->PHONE, $r->TYPENAME,
                $r->PAYSTATUS, $r->ATTENDSTATUS, $r->CHECKINTIME, $r->TIKETSTATUS, $r->REGDATE,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'mattendee', 'page' => 'Attendee List',
            'table' => 'T_ATTENDEE', 'dataId' => (string) $eventid,
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'attendee_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
