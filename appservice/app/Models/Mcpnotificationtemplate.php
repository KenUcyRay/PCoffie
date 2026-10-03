<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Template notifikasi sistem (App Setting, module System).
// Tabel dbo.T_NOTIFICATION_TEMPLATE (daftar dibuat developer via seed).
// SEGMENT frontend: home/cpnotificationtemplate/cpnotificationtemplate.
// Menu CPMENU MCONTROL = cp_notification_template.
//
// Admin hanya boleh ubah SUBJECT, BODY, ISACTIVE (+ reset ke bawaan).
// Tanpa tambah/hapus/ubah kode (tidak ada endpointnya, dan UPDATE dibatasi
// kolom). Semua penanda {{...}} harus ada di daftar template.
class Mcpnotificationtemplate extends Model
{
    use ColumnFilter;

    const MCODE = 10060003;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'TEMPLATEID' => 'A.TEMPLATEID',
            'CODE' => 'A.CODE',
            'CHANNEL' => 'A.CHANNEL',
            'NAME' => 'A.NAME',
            'ISACTIVE' => 'A.ISACTIVE',
            'SYSUPDATEDATE' => 'A.SYSUPDATEDATE',
        ];
    }

    // Tolak bila group user tidak punya akses menu Notification Template.
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

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $channel = strtoupper(trim((string) ($param['channel'] ?? '')));
        $active = strtoupper(trim((string) ($param['isactive'] ?? $param['status'] ?? '')));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.CODE LIKE ? OR A.NAME LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like];
        }
        if ($channel !== '' && in_array($channel, ['EMAIL', 'IN_APP'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CHANNEL = ?';
            $args[] = $channel;
        }
        if ($active !== '' && in_array($active, ['YES', 'NO'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.ISACTIVE = ?';
            $args[] = $active;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_NOTIFICATION_TEMPLATE A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default kode.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.CODE, A.CHANNEL';

        $sql = "
            SELECT A.TEMPLATEID, A.CODE, A.CHANNEL, A.NAME, A.DESCR,
                   A.SUBJECT, A.ISACTIVE, A.SYSUPDATEDATE
            FROM T_NOTIFICATION_TEMPLATE A
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

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TEMPLATEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TEMPLATEID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT TEMPLATEID, CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY,
                   PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE,
                   SYSUPDATEDATE, SYSUPDATEUSER
            FROM T_NOTIFICATION_TEMPLATE WHERE TEMPLATEID = ?
        ", [$id]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data template tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi judul/isi terhadap daftar penanda template. Return pesan atau null.
    // $channel dipakai untuk aturan IN_APP (tanpa tag HTML apa pun).
    private static function validateContent(string $subject, string $body, array $allowed, string $channel): ?string
    {
        if ($subject === '') {
            return 'Judul wajib diisi.';
        }
        if (mb_strlen($subject) > 150) {
            return 'Judul maksimal 150 karakter.';
        }
        if ($body === '') {
            return 'Isi wajib diisi.';
        }
        if (mb_strlen($body) > 5000) {
            return 'Isi maksimal 5000 karakter.';
        }
        $names = array_keys($allowed);
        foreach (['judul' => $subject, 'isi' => $body] as $part => $text) {
            foreach (NotificationTemplate::usedIn($text) as $ph) {
                if (!in_array($ph, $names, true)) {
                    return 'Penanda {{' . $ph . '}} tidak dikenal pada ' . $part . '.';
                }
            }
        }
        if ($channel === 'IN_APP' && (strip_tags($subject) !== $subject || strip_tags($body) !== $body)) {
            return 'Saluran IN_APP tidak boleh memakai format/tag HTML.';
        }
        return null;
    }

    // Ubah HANYA judul, isi, status. Kode/saluran/placeholder tidak tersentuh.
    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TEMPLATEID'] ?? null;
        $subject = trim((string) ($vdata['SUBJECT'] ?? ''));
        $body = trim((string) ($vdata['BODY'] ?? ''));
        $active = strtoupper(trim((string) ($vdata['ISACTIVE'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TEMPLATEID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        $row = DB::selectOne("
            SELECT TEMPLATEID, CODE, CHANNEL, NAME, SUBJECT, BODY, ISACTIVE, PLACEHOLDERS
            FROM T_NOTIFICATION_TEMPLATE WHERE TEMPLATEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data template tidak ditemukan.']);
        }

        $err = self::validateContent(
            $subject, $body,
            NotificationTemplate::allowedOf($row),
            strtoupper(trim((string) $row->CHANNEL))
        );
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        DB::update("
            UPDATE T_NOTIFICATION_TEMPLATE
            SET SUBJECT = ?, BODY = ?, ISACTIVE = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE TEMPLATEID = ?
        ", [
            mb_substr($subject, 0, 150), mb_substr($body, 0, 5000), $active,
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_notification_template', 'page' => 'Notification Template',
            'table' => 'T_NOTIFICATION_TEMPLATE', 'dataId' => (string) $id,
            'summary' => 'TEMPLATE ' . (string) $row->CODE . '/' . (string) $row->CHANNEL,
            'before' => ['SUBJECT' => (string) $row->SUBJECT, 'BODY' => (string) $row->BODY, 'ISACTIVE' => (string) $row->ISACTIVE],
            'after' => ['SUBJECT' => $subject, 'BODY' => $body, 'ISACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Template berhasil diupdate.']);
    }

    // Kembalikan judul + isi dari kolom bawaan (dengan konfirmasi di frontend).
    public static function reset_default($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TEMPLATEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TEMPLATEID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT TEMPLATEID, CODE, CHANNEL, NAME, SUBJECT, BODY, ISACTIVE,
                   DEFAULTSUBJECT, DEFAULTBODY
            FROM T_NOTIFICATION_TEMPLATE WHERE TEMPLATEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data template tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_NOTIFICATION_TEMPLATE
            SET SUBJECT = ?, BODY = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE TEMPLATEID = ?
        ", [
            (string) $row->DEFAULTSUBJECT, (string) $row->DEFAULTBODY,
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_notification_template', 'page' => 'Notification Template',
            'table' => 'T_NOTIFICATION_TEMPLATE', 'dataId' => (string) $id,
            'summary' => 'RESET TEMPLATE ' . (string) $row->CODE . '/' . (string) $row->CHANNEL,
            'before' => ['SUBJECT' => (string) $row->SUBJECT, 'BODY' => (string) $row->BODY],
            'after' => ['SUBJECT' => (string) $row->DEFAULTSUBJECT, 'BODY' => (string) $row->DEFAULTBODY],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Template dikembalikan ke bawaan.']);
    }

    // Pratinjau: render judul + isi dari form (belum disimpan) dengan contoh
    // nilai milik template.
    public static function preview($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TEMPLATEID'] ?? null;
        $subject = trim((string) ($vdata['SUBJECT'] ?? ''));
        $body = trim((string) ($vdata['BODY'] ?? ''));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TEMPLATEID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT CHANNEL, PLACEHOLDERS FROM T_NOTIFICATION_TEMPLATE WHERE TEMPLATEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data template tidak ditemukan.']);
        }

        $allowed = NotificationTemplate::allowedOf($row);
        $samples = [];
        foreach ($allowed as $name => $meta) {
            $samples[$name] = $meta['contoh'];
        }
        $missing = [];
        $outSubj = NotificationTemplate::fill($subject, $allowed, $samples, $missing);
        $outBody = NotificationTemplate::fill($body, $allowed, $samples, $missing);

        return json_encode(['success' => true, 'Rows' => [[
            'SUBJECT' => $outSubj,
            'BODY' => $outBody,
        ]]]);
    }

    // Kirim email uji: template dirender dengan nilai contoh ke satu alamat,
    // memakai SMTP tersimpan dari General Setting. Rate-limit + SysLog.
    public static function send_test_email($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TEMPLATEID'] ?? null;
        $to = trim((string) ($vdata['TESTEMAIL'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TEMPLATEID tidak ditemukan.']);
        }
        if ($to === '' || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            return json_encode(['success' => 'false', 'message' => 'Alamat email tujuan tidak valid.']);
        }
        if (!SmtpMailer::checkTestRate($by)) {
            return json_encode(['success' => 'false', 'message' => 'Terlalu sering. Coba lagi setelah 1 menit.']);
        }

        $row = DB::selectOne("
            SELECT CODE, CHANNEL, SUBJECT, BODY, ISACTIVE, PLACEHOLDERS
            FROM T_NOTIFICATION_TEMPLATE WHERE TEMPLATEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data template tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->CHANNEL)) !== 'EMAIL') {
            return json_encode(['success' => 'false', 'message' => 'Email uji hanya untuk saluran EMAIL.']);
        }

        $smtp = DB::selectOne("
            SELECT TOP 1 MAILFROMNAME, MAILFROMEMAIL, SMTPHOST, SMTPPORT, SMTPENCRYPTION,
                           SMTPUSERNAME, dbo.app_decrypt(SMTPPASSWORD) AS PLAIN
            FROM T_APP_SETTING ORDER BY SETTINGID
        ");
        if (!$smtp || trim((string) ($smtp->SMTPHOST ?? '')) === '') {
            return json_encode(['success' => 'false', 'message' => 'Pengaturan SMTP belum diisi di General Setting.']);
        }

        $allowed = NotificationTemplate::allowedOf($row);
        $samples = [];
        foreach ($allowed as $name => $meta) {
            $samples[$name] = $meta['contoh'];
        }
        $missing = [];
        $subject = NotificationTemplate::fill('[UJI] ' . (string) $row->SUBJECT, $allowed, $samples, $missing);
        $body = NotificationTemplate::fill((string) $row->BODY, $allowed, $samples, $missing);

        $sent = SmtpMailer::send([
            'HOST' => (string) ($smtp->SMTPHOST ?? ''),
            'PORT' => (string) ($smtp->SMTPPORT ?? ''),
            'ENCRYPTION' => (string) ($smtp->SMTPENCRYPTION ?? 'NONE'),
            'USERNAME' => (string) ($smtp->SMTPUSERNAME ?? ''),
            'PASSWORD' => trim((string) ($smtp->PLAIN ?? '')),
            'FROMEMAIL' => (string) ($smtp->MAILFROMEMAIL ?? ''),
            'FROMNAME' => (string) ($smtp->MAILFROMNAME ?? ''),
        ], $to, $subject, $body);

        SysLog::log($sent['ok'] ? 'INFO' : 'WARNING', 'API', 'Email uji template ' . (string) $row->CODE . ': ' . ($sent['ok'] ? 'terkirim' : 'gagal') . '.', [
            'to' => $to, 'code' => (string) $row->CODE,
        ]);

        return json_encode($sent['ok']
            ? ['success' => 'true', 'message' => $sent['message']]
            : ['success' => 'false', 'message' => $sent['message']]);
    }
}
