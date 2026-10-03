<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Refund tiket (Ticket Order, module Ticketing). Tabel dbo.T_TICKET_REFUND.
// SEGMENT frontend: home/mrefund/mrefund. Menu CPMENU MCONTROL = mrefund.
//
// Alur: DIAJUKAN -> DISETUJUI/DITOLAK -> SELESAI. Satu tiket maksimal satu
// refund berjalan (unique filtered index) dan SELESAI mencegah pengajuan lagi.
// Setujui = batalkan tiket + kembalikan kuota dalam SATU transaksi.
// SELESAI hanya penanda dana dikembalikan di luar aplikasi (titik sambung
// Finance). Transfer dana TIDAK dibuat di sini.
class Mmrefund extends Model
{
    use ColumnFilter;

    const MCODE = 40010003;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'REFUNDID' => 'A.REFUNDID',
            'REFUNDNO' => 'A.REFUNDNO',
            'STATUS' => 'A.STATUS',
            'NOMINAL' => 'A.NOMINAL',
            'REQUESTTIME' => 'A.REQUESTTIME',
        ];
    }

    // Tolak bila group user tidak punya akses menu Ticket Refund.
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

    // Batas konfigurasi (env, mudah diubah tanpa kode):
    // REFUND_DEADLINE_HOURS (default 72 = H-3), REFUND_ENFORCE_DIFF_OPERATOR.
    private static function deadlineHours(): int
    {
        try {
            $h = (int) (getenv('REFUND_DEADLINE_HOURS') ?: 0);
            if ($h <= 0 && function_exists('env')) {
                $h = (int) (env('REFUND_DEADLINE_HOURS', 72));
            }
            return $h > 0 ? $h : 72;
        } catch (\Throwable $e) {
            return 72;
        }
    }

    private static function enforceDiffOperator(): bool
    {
        try {
            $v = getenv('REFUND_ENFORCE_DIFF_OPERATOR');
            if (($v === false || $v === '') && function_exists('env')) {
                $v = env('REFUND_ENFORCE_DIFF_OPERATOR', 'YES');
            }
            return strtoupper(trim((string) $v)) !== 'NO';
        } catch (\Throwable $e) {
            return true;
        }
    }

    // Nomor refund otomatis: RF-YYYYMMDD-XXXX (unik, retry bila tabrakan).
    private static function genRefundNo(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $no = 'RF-' . date('Ymd') . '-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $hit = DB::selectOne("SELECT 1 AS X FROM T_TICKET_REFUND WHERE REFUNDNO = ?", [$no]);
            if (!$hit) {
                return $no;
            }
        }
        return 'RF-' . date('YmdHis') . '-' . bin2hex(random_bytes(2));
    }

    // Cek syarat pengajuan untuk satu tiket. Return ['ok'=>bool,'reasons'=>[],
    // 'ticket'=>row|null,'price'=>string,'deadline'=>string].
    // Aturan: AKTIF+LUNAS, belum HADIR; event CANCELLED bebas syarat waktu;
    // selain itu event PUBLISHED + belum mulai + belum selesai + H-3.
    public static function checkTicket(int $attendeeid): array
    {
        $out = ['ok' => false, 'reasons' => [], 'ticket' => null, 'price' => '0', 'deadline' => ''];
        try {
            $t = DB::selectOne("
                SELECT A.ATTENDEEID, A.TICKETCODE, A.NAME, A.EMAIL, A.PAYSTATUS,
                       A.ATTENDSTATUS, A.TIKETSTATUS, A.EVENTID,
                       E.TITLE AS EVENTTITLE, E.STATUS AS EVENTSTATUS,
                       E.STARTAT, E.ENDAT, T.PRICE
                FROM T_ATTENDEE A
                LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
                LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
                WHERE A.ATTENDEEID = ?
            ", [$attendeeid]);
            if (!$t) {
                $out['reasons'][] = 'Data tiket tidak ditemukan.';
                return $out;
            }
            $out['ticket'] = (array) $t;
            $out['price'] = (string) ($t->PRICE ?? '0');

            if (strtoupper(trim((string) $t->TIKETSTATUS)) !== 'AKTIF') {
                $out['reasons'][] = 'Tiket sudah dibatalkan.';
            }
            if (strtoupper(trim((string) $t->PAYSTATUS)) !== 'LUNAS') {
                $out['reasons'][] = 'Hanya tiket LUNAS yang bisa direfund.';
            }
            if (strtoupper(trim((string) $t->ATTENDSTATUS)) === 'HADIR') {
                $out['reasons'][] = 'Tiket sudah dipakai hadir.';
            }

            $evst = strtoupper(trim((string) ($t->EVENTSTATUS ?? '')));
            if ($evst !== 'CANCELLED') {
                if ($evst !== 'PUBLISHED') {
                    $out['reasons'][] = 'Event belum/sudah tidak PUBLISHED.';
                }
                $now = time();
                $startTs = !empty($t->STARTAT) ? strtotime((string) $t->STARTAT) : 0;
                $endTs = !empty($t->ENDAT) ? strtotime((string) $t->ENDAT) : 0;
                if ($startTs > 0 && $now >= $startTs) {
                    $out['reasons'][] = 'Event sudah berlangsung.';
                }
                if ($endTs > 0 && $now >= $endTs) {
                    $out['reasons'][] = 'Event sudah selesai.';
                }
                $h = self::deadlineHours();
                if ($startTs > 0) {
                    $dl = $startTs - $h * 3600;
                    $out['deadline'] = date('Y-m-d H:i:s', $dl);
                    if ($now > $dl) {
                        $out['reasons'][] = 'Melewati batas pengajuan (H-' . (int) round($h / 24) . ').';
                    }
                }
            }

            $open = DB::selectOne("
                SELECT REFUNDID, STATUS FROM T_TICKET_REFUND
                WHERE TICKETID = ? AND STATUS IN ('DIAJUKAN', 'DISETUJUI', 'SELESAI')
            ", [$attendeeid]);
            if ($open) {
                $st = strtoupper(trim((string) $open->STATUS));
                $out['reasons'][] = $st === 'SELESAI'
                    ? 'Tiket ini sudah pernah direfund (SELESAI).'
                    : 'Tiket ini sudah punya refund berjalan (' . $st . ').';
            }

            $out['ok'] = empty($out['reasons']);
            return $out;
        } catch (\Throwable $e) {
            $out['reasons'][] = 'Gagal memeriksa syarat.';
            return $out;
        }
    }

    // Endpoint pengecekan syarat (dipakai form sebelum simpan).
    public static function check_ticket($param)
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

        $chk = self::checkTicket((int) $id);

        return json_encode([
            'success' => true,
            'Rows' => [[
                'ELIGIBLE' => $chk['ok'] ? 'YES' : 'NO',
                'REASONS' => $chk['reasons'],
                'PRICE' => $chk['price'],
                'DEADLINE' => $chk['deadline'],
                'TICKET' => $chk['ticket'],
            ]],
        ]);
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $eventid = trim((string) ($param['eventid'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.REFUNDNO LIKE ? OR T.TICKETCODE LIKE ? OR T.NAME LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like];
        }
        if ($status !== '' && in_array($status, ['DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'SELESAI'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($eventid !== '' && filter_var($eventid, FILTER_VALIDATE_INT) !== false) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.EVENTID = ?';
            $args[] = (int) $eventid;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("
            SELECT COUNT(*) AS TOTAL FROM T_TICKET_REFUND A
            LEFT JOIN T_ATTENDEE T ON T.ATTENDEEID = A.TICKETID
            " . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.REQUESTTIME DESC, A.REFUNDID DESC';

        $sql = "
            SELECT A.REFUNDID, A.REFUNDNO, A.TICKETID, T.TICKETCODE, T.NAME AS ATTNAME,
                   A.EVENTID, E.TITLE AS EVENTTITLE, A.NOMINAL, A.STATUS,
                   A.REQUESTTIME, A.REQUESTBY
            FROM T_TICKET_REFUND A
            LEFT JOIN T_ATTENDEE T ON T.ATTENDEEID = A.TICKETID
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
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

    // Ringkasan: per status + nominal menunggu (DIAJUKAN+DISETUJUI).
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $row = DB::selectOne("
            SELECT
                ISNULL(SUM(CASE WHEN A.STATUS = 'DIAJUKAN' THEN 1 ELSE 0 END), 0) AS PENGAJUAN,
                ISNULL(SUM(CASE WHEN A.STATUS = 'DISETUJUI' THEN 1 ELSE 0 END), 0) AS SETUJU,
                ISNULL(SUM(CASE WHEN A.STATUS = 'DITOLAK' THEN 1 ELSE 0 END), 0) AS TOLAK,
                ISNULL(SUM(CASE WHEN A.STATUS = 'SELESAI' THEN 1 ELSE 0 END), 0) AS SELESAI,
                ISNULL(SUM(CASE WHEN A.STATUS IN ('DIAJUKAN', 'DISETUJUI') THEN A.NOMINAL ELSE 0 END), 0) AS TUNGGU
            FROM T_TICKET_REFUND A
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'PENGAJUAN' => $row ? (int) $row->PENGAJUAN : 0,
            'SETUJU' => $row ? (int) $row->SETUJU : 0,
            'TOLAK' => $row ? (int) $row->TOLAK : 0,
            'SELESAI' => $row ? (int) $row->SELESAI : 0,
            'TUNGGU' => $row ? (string) $row->TUNGGU : '0',
        ]]]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['REFUNDID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'REFUNDID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, T.TICKETCODE, T.NAME AS ATTNAME, T.EMAIL, T.PHONE,
                   E.TITLE AS EVENTTITLE, E.STATUS AS EVENTSTATUS, TP.PRICE
            FROM T_TICKET_REFUND A
            LEFT JOIN T_ATTENDEE T ON T.ATTENDEEID = A.TICKETID
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_TICKET_TYPE TP ON TP.TICKETTYPEID = T.TICKETTYPEID
            WHERE A.REFUNDID = ?
        ", [$id]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data refund tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Cari tiket untuk form pengajuan (kode/nama, hanya yang layak).
    public static function search_ticket($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $q = trim((string) ($param['q'] ?? ''));
        if ($q === '') {
            return json_encode(['success' => true, 'Rows' => []]);
        }

        $result = DB::select("
            SELECT TOP 20 A.ATTENDEEID, A.TICKETCODE, A.NAME, E.TITLE AS EVENTTITLE,
                           A.PAYSTATUS, A.ATTENDSTATUS, A.TIKETSTATUS, TP.PRICE
            FROM T_ATTENDEE A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_TICKET_TYPE TP ON TP.TICKETTYPEID = A.TICKETTYPEID
            WHERE A.TICKETCODE LIKE ? OR A.NAME LIKE ?
            ORDER BY A.ATTENDEEID DESC
        ", ['%' . $q . '%', '%' . $q . '%']);

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    // Kirim notifikasi refund (best-effort: gagal tidak menggagalkan aksi).
    // PII tidak masuk SysLog (hanya kode + tiket).
    private static function notify(string $tplCode, array $ticket, string $nominal): void
    {
        try {
            $r = NotificationTemplate::render($tplCode, 'EMAIL', [
                'nama' => (string) ($ticket['NAME'] ?? ''),
                'nomor_order' => (string) ($ticket['TICKETCODE'] ?? ''),
                'jumlah' => (string) $nominal,
                'event' => (string) ($ticket['EVENTTITLE'] ?? ''),
            ]);
            if (!$r['ok']) {
                return;
            }
            $to = trim((string) ($ticket['EMAIL'] ?? ''));
            if ($to === '' || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
                return;
            }
            $smtp = DB::selectOne("
                SELECT TOP 1 MAILFROMNAME, MAILFROMEMAIL, SMTPHOST, SMTPPORT, SMTPENCRYPTION,
                               SMTPUSERNAME, dbo.app_decrypt(SMTPPASSWORD) AS PLAIN
                FROM T_APP_SETTING ORDER BY SETTINGID
            ");
            if (!$smtp || trim((string) ($smtp->SMTPHOST ?? '')) === '') {
                SysLog::log('INFO', 'API', 'Notifikasi refund dilewati (SMTP belum diisi).', ['code' => $tplCode]);
                return;
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
            SysLog::log($sent['ok'] ? 'INFO' : 'WARNING', 'API', 'Notifikasi refund ' . $tplCode . ': ' . ($sent['ok'] ? 'terkirim' : 'gagal') . '.', [
                'code' => $tplCode, 'ticket' => (string) ($ticket['TICKETCODE'] ?? ''),
            ]);
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal mengirim notifikasi refund.', ['code' => $tplCode], $e);
        }
    }

    // Ajukan refund atas nama peserta.
    public static function process_apply($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $ticketid = $vdata['ATTENDEEID'] ?? null;
        $nominalRaw = trim((string) ($vdata['NOMINAL'] ?? ''));
        $reason = trim((string) ($vdata['REASON'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($ticketid)) {
            return json_encode(['success' => 'false', 'message' => 'Tiket wajib dipilih.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan pengajuan wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $chk = self::checkTicket((int) $ticketid);
        if (!$chk['ok']) {
            return json_encode(['success' => 'false', 'message' => implode(' ', $chk['reasons'])]);
        }
        $price = (float) $chk['price'];
        $nominal = $nominalRaw === '' ? $price : (float) $nominalRaw;
        if (!is_numeric($nominalRaw) && $nominalRaw !== '') {
            return json_encode(['success' => 'false', 'message' => 'Nominal tidak valid.']);
        }
        if ($nominal < 0) {
            return json_encode(['success' => 'false', 'message' => 'Nominal tidak boleh negatif.']);
        }
        if ($nominal > $price) {
            return json_encode(['success' => 'false', 'message' => 'Nominal tidak boleh melebihi harga tiket.']);
        }

        $ticket = $chk['ticket'];
        $no = self::genRefundNo();
        try {
            DB::insert("
                INSERT INTO T_TICKET_REFUND
                    (REFUNDNO, TICKETID, EVENTID, NOMINAL, REASON, STATUS,
                     REQUESTBY, SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, ?, ?, 'DIAJUKAN',
                     ?, ?, GETDATE())
            ", [
                $no, (int) $ticketid, (int) ($ticket['EVENTID'] ?? 0), $nominal,
                mb_substr($reason, 0, 200), $by !== '' ? mb_substr($by, 0, 25) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null,
            ]);
        } catch (\Throwable $e) {
            // Balapan refund ganda: unique filtered index menolak.
            if (stripos($e->getMessage(), 'UX_T_TICKET_REFUND_ACTIVE') !== false) {
                return json_encode(['success' => 'false', 'message' => 'Tiket ini sudah punya refund berjalan.']);
            }
            SysLog::log('ERROR', 'API', 'Gagal mengajukan refund.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengajukan refund.']);
        }
        $id = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mrefund', 'page' => 'Ticket Refund',
            'table' => 'T_TICKET_REFUND', 'dataId' => $no,
            'summary' => 'REFUND ' . $no . ' (' . (string) ($ticket['TICKETCODE'] ?? $ticketid) . ')',
            'before' => [],
            'after' => ['NOMINAL' => (string) $nominal, 'STATUS' => 'DIAJUKAN'],
            'userlogin' => $by,
        ]);

        self::notify('REFUND_REQUESTED', (array) $ticket, (string) $nominal);

        return json_encode([
            'success' => 'true', 'message' => 'Refund berhasil diajukan.',
            'Rows' => [['REFUNDID' => $id, 'REFUNDNO' => $no]],
        ]);
    }

    // true bila boleh memutuskan (bukan pengaju) — atau aturan dimatikan.
    // Return null bila lolos, pesan bila ditolak.
    private static function guardDecider($row, string $by): ?string
    {
        if (!self::enforceDiffOperator()) {
            return null;
        }
        $req = trim((string) ($row->REQUESTBY ?? ''));
        if ($req === '' || strtoupper($req) === strtoupper($by)) {
            // Hitung operator aktif (user aktif apa pun dianggap operator).
            $n = DB::selectOne("SELECT COUNT(*) AS C FROM CPUSER WHERE UPPER(USERACTIVE) = 'YES'");
            if ($n && (int) $n->C > 1 && $req !== '' && strtoupper($req) === strtoupper($by)) {
                return 'Pengaju tidak boleh menyetujui/menolak sendiri (ada operator lain yang aktif).';
            }
        }
        return null;
    }

    // Setujui: tiket -> REFUND + DIBATALKAN + kuota kembali, SATU transaksi.
    public static function process_approve($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['REFUNDID'] ?? null;
        $note = trim((string) ($vdata['NOTE'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'REFUNDID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT * FROM T_TICKET_REFUND WHERE REFUNDID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data refund tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DIAJUKAN') {
            return json_encode(['success' => 'false', 'message' => 'Hanya refund DIAJUKAN yang bisa disetujui.']);
        }
        $gerr = self::guardDecider($row, $by);
        if ($gerr !== null) {
            return json_encode(['success' => 'false', 'message' => $gerr]);
        }

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            DB::update("
                UPDATE T_TICKET_REFUND
                SET STATUS = 'DISETUJUI', DECISIONNOTE = ?, DECISIONBY = ?, DECISIONTIME = GETDATE(),
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE REFUNDID = ? AND STATUS = 'DIAJUKAN'
            ", [
                $note !== '' ? mb_substr($note, 0, 200) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null,
                $by !== '' ? mb_substr($by, 0, 25) : null, $id,
            ]);

            $n = DB::update("
                UPDATE T_ATTENDEE
                SET PAYSTATUS = 'REFUND', TIKETSTATUS = 'DIBATALKAN',
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE ATTENDEEID = ? AND TIKETSTATUS = 'AKTIF'
            ", [$by !== '' ? mb_substr($by, 0, 25) : null, (int) $row->TICKETID]);

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal menyetujui refund.', [], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal menyetujui refund.']);
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mrefund', 'page' => 'Ticket Refund',
            'table' => 'T_TICKET_REFUND', 'dataId' => (string) ($row->REFUNDNO ?? $id),
            'summary' => 'REFUND ' . (string) ($row->REFUNDNO ?? $id) . ' -> DISETUJUI',
            'before' => ['STATUS' => 'DIAJUKAN'],
            'after' => ['STATUS' => 'DISETUJUI'],
            'userlogin' => $by,
        ]);

        $ticket = DB::selectOne("
            SELECT A.NAME, A.EMAIL, A.TICKETCODE, E.TITLE AS EVENTTITLE
            FROM T_ATTENDEE A LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            WHERE A.ATTENDEEID = ?
        ", [(int) $row->TICKETID]);
        if ($ticket) {
            self::notify('REFUND_APPROVED', (array) $ticket, (string) ($row->NOMINAL ?? '0'));
        }

        return json_encode(['success' => 'true', 'message' => 'Refund disetujui. Tiket dibatalkan, kuota kembali.']);
    }

    // Tolak: alasan wajib; tiket tidak berubah.
    public static function process_reject($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['REFUNDID'] ?? null;
        $note = trim((string) ($vdata['NOTE'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'REFUNDID tidak ditemukan.']);
        }
        if ($note === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan penolakan wajib diisi.']);
        }
        if (mb_strlen($note) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $row = DB::selectOne("SELECT * FROM T_TICKET_REFUND WHERE REFUNDID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data refund tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DIAJUKAN') {
            return json_encode(['success' => 'false', 'message' => 'Hanya refund DIAJUKAN yang bisa ditolak.']);
        }
        $gerr = self::guardDecider($row, $by);
        if ($gerr !== null) {
            return json_encode(['success' => 'false', 'message' => $gerr]);
        }

        DB::update("
            UPDATE T_TICKET_REFUND
            SET STATUS = 'DITOLAK', DECISIONNOTE = ?, DECISIONBY = ?, DECISIONTIME = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE REFUNDID = ? AND STATUS = 'DIAJUKAN'
        ", [
            mb_substr($note, 0, 200),
            $by !== '' ? mb_substr($by, 0, 25) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null, $id,
        ]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mrefund', 'page' => 'Ticket Refund',
            'table' => 'T_TICKET_REFUND', 'dataId' => (string) ($row->REFUNDNO ?? $id),
            'summary' => 'REFUND ' . (string) ($row->REFUNDNO ?? $id) . ' -> DITOLAK',
            'before' => ['STATUS' => 'DIAJUKAN'],
            'after' => ['STATUS' => 'DITOLAK', 'DECISIONNOTE' => $note],
            'userlogin' => $by,
        ]);

        $ticket = DB::selectOne("
            SELECT A.NAME, A.EMAIL, A.TICKETCODE, E.TITLE AS EVENTTITLE
            FROM T_ATTENDEE A LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            WHERE A.ATTENDEEID = ?
        ", [(int) $row->TICKETID]);
        if ($ticket) {
            self::notify('REFUND_REJECTED', (array) $ticket, (string) ($row->NOMINAL ?? '0'));
        }

        return json_encode(['success' => 'true', 'message' => 'Refund ditolak. Tiket tidak berubah.']);
    }

    // Tandai selesai: dana sudah dikembalikan di luar aplikasi.
    // Titik sambung Finance: panggil API/jurnal Finance di sini nanti.
    public static function process_finish($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['REFUNDID'] ?? null;
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'REFUNDID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT REFUNDID, REFUNDNO, STATUS FROM T_TICKET_REFUND WHERE REFUNDID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data refund tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DISETUJUI') {
            return json_encode(['success' => 'false', 'message' => 'Hanya refund DISETUJUI yang bisa diselesaikan.']);
        }

        DB::update("
            UPDATE T_TICKET_REFUND
            SET STATUS = 'SELESAI', DONEBY = ?, DONETIME = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE REFUNDID = ? AND STATUS = 'DISETUJUI'
        ", [
            $by !== '' ? mb_substr($by, 0, 25) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null, $id,
        ]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mrefund', 'page' => 'Ticket Refund',
            'table' => 'T_TICKET_REFUND', 'dataId' => (string) ($row->REFUNDNO ?? $id),
            'summary' => 'REFUND ' . (string) ($row->REFUNDNO ?? $id) . ' -> SELESAI',
            'before' => ['STATUS' => 'DISETUJUI'],
            'after' => ['STATUS' => 'SELESAI'],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Refund ditandai selesai.']);
    }
}
