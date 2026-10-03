<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Riwayat pesan broadcast (Broadcast Message, module System).
// Baca dari dbo.T_MESSAGE + dbo.T_MESSAGE_RECIPIENT.
// SEGMENT frontend: home/cpmessagehistory/cpmessagehistory. Menu CPMENU MCONTROL = cp_message_history.
//
// read_data/read_detail/read_recipients/read_summary/process_recall.
// Isi pesan TIDAK bisa diubah; penarikan = STATUS DITARIK (tanpa hapus fisik).
// Pesan DITARIK otomatis hilang dari inbox (filter di Mcpmessageinbox).
class Mcpmessagehistory extends Model
{
    use ColumnFilter;

    const MCODE = 10050003;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'MSGID' => 'A.MSGID',
            'SENTAT' => 'A.SENTAT',
            'TITLE' => 'A.TITLE',
            'PRIORITY' => 'A.PRIORITY',
            'TARGETTYPE' => 'A.TARGETTYPE',
            'STATUS' => 'A.STATUS',
            'RECIPIENTCOUNT' => 'A.RECIPIENTCOUNT',
            'READCOUNT' => 'R.READCOUNT',
        ];
    }

    // Tolak bila group user tidak punya akses menu Message History.
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

    // Susun WHERE daftar pesan dari filter bar. Return [$where, $args] atau pesan error.
    private static function buildWhere($param)
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $priority = strtoupper(trim((string) ($param['priority'] ?? '')));
        $type = strtoupper(trim((string) ($param['targettype'] ?? $param['type'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $sender = trim((string) ($param['sender'] ?? ''));
        $q = trim((string) ($param['q'] ?? ''));

        if ($dateFrom === '') {
            $dateFrom = date('Y-m-d', strtotime('-30 days'));
        }
        if ($dateTo === '') {
            $dateTo = date('Y-m-d');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return ['__ERROR__Format tanggal harus YYYY-MM-DD.', []];
        }
        if ($dateFrom > $dateTo) {
            return ['__ERROR__Tanggal mulai tidak boleh sesudah tanggal akhir.', []];
        }
        $days = (strtotime($dateTo) - strtotime($dateFrom)) / 86400;
        if ($days > 366) {
            return ['__ERROR__Rentang maksimum 1 tahun.', []];
        }

        $where = " WHERE CAST(A.SENTAT AS DATE) >= ? AND CAST(A.SENTAT AS DATE) <= ?";
        $args = [$dateFrom, $dateTo];

        if ($priority !== '' && in_array($priority, ['INFO', 'PENTING', 'DARURAT'], true)) {
            $where .= " AND A.PRIORITY = ?";
            $args[] = $priority;
        }
        if ($type !== '' && in_array($type, ['ALL', 'GROUP', 'USER'], true)) {
            $where .= " AND A.TARGETTYPE = ?";
            $args[] = $type;
        }
        if ($status !== '' && in_array($status, ['TERKIRIM', 'DITARIK'], true)) {
            $where .= " AND A.STATUS = ?";
            $args[] = $status;
        }
        if ($sender !== '') {
            $where .= " AND A.SENDERLOGIN LIKE ?";
            $args[] = '%' . $sender . '%';
        }
        if ($q !== '') {
            $where .= " AND A.TITLE LIKE ?";
            $args[] = '%' . $q . '%';
        }

        return [$where, $args];
    }

    // Agregat terbaca per pesan (LEFT JOIN, dipakai read_data + read_detail).
    private static function readJoin(): string
    {
        return " LEFT JOIN (
            SELECT MSGID,
                   COUNT(*) AS TOTALCOUNT,
                   SUM(CASE WHEN READSTATUS = 'DIBACA' THEN 1 ELSE 0 END) AS READCOUNT
            FROM T_MESSAGE_RECIPIENT GROUP BY MSGID
        ) R ON R.MSGID = A.MSGID";
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

        // Filter per kolom grid (DataTable) digabung.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_MESSAGE A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.SENTAT DESC, A.MSGID DESC';

        $sql = "
            SELECT A.MSGID, A.TITLE, A.PRIORITY, A.TARGETTYPE, A.CHANNEL,
                   A.SENTAT, A.EXPIRESAT, A.STATUS, A.RECIPIENTCOUNT,
                   A.SENDERLOGIN, A.RECALLTIME, A.RECALLBY, A.RECALLREASON,
                   ISNULL(R.READCOUNT, 0) AS READCOUNT
            FROM T_MESSAGE A
            " . self::readJoin() . "
            " . $where . "
            ORDER BY " . $order . "
        ";

        // OFFSET/FETCH nilai integer di-inline karena sudah di-cast aman (hindari isu binding int).
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $arr = (array) $r;
            $total = (int) ($r->RECIPIENTCOUNT ?? 0);
            $read = (int) ($r->READCOUNT ?? 0);
            $arr['READPCT'] = $total > 0 ? (int) round($read * 100 / $total) : 0;
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Detail satu pesan + agregat terbaca.
    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $msgid = $vdata['MSGID'] ?? null;

        if (empty($msgid)) {
            return json_encode(['success' => 'false', 'message' => 'MSGID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.MSGID, A.TITLE, A.BODY, A.PRIORITY, A.TARGETTYPE, A.TARGETJSON,
                   A.CHANNEL, A.SENTAT, A.EXPIRESAT, A.STATUS, A.RECIPIENTCOUNT,
                   A.SENDERLOGIN, A.RECALLTIME, A.RECALLBY, A.RECALLREASON,
                   ISNULL(R.READCOUNT, 0) AS READCOUNT
            FROM T_MESSAGE A
            " . self::readJoin() . "
            WHERE A.MSGID = ?
        ", [$msgid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data pesan tidak ditemukan.']);
        }

        $arr = (array) $row;
        $total = (int) ($row->RECIPIENTCOUNT ?? 0);
        $arr['READPCT'] = $total > 0 ? (int) round(((int) ($row->READCOUNT ?? 0)) * 100 / $total) : 0;

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Daftar penerima satu pesan + status baca (paging + cari + filter status).
    public static function read_recipients($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $msgid = $vdata['MSGID'] ?? null;

        if (empty($msgid)) {
            return json_encode(['success' => 'false', 'message' => 'MSGID tidak ditemukan.']);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $read = strtoupper(trim((string) ($param['readstatus'] ?? '')));

        $where = " WHERE A.MSGID = ?";
        $args = [$msgid];
        if ($q !== '') {
            $where .= " AND A.USERLOGIN LIKE ?";
            $args[] = '%' . $q . '%';
        }
        if ($read !== '' && in_array($read, ['BELUM_DIBACA', 'DIBACA'], true)) {
            $where .= " AND A.READSTATUS = ?";
            $args[] = $read;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_MESSAGE_RECIPIENT A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "
            SELECT A.RECIPIENTID, A.USERID, A.USERLOGIN, A.READSTATUS, A.READTIME
            FROM T_MESSAGE_RECIPIENT A
            " . $where . "
            ORDER BY A.USERLOGIN
        ";
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

    // Ringkasan: pesan terkirim/ditarik + total penerima dan terbaca.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $row = DB::selectOne("
            SELECT
                ISNULL(SUM(CASE WHEN A.STATUS = 'TERKIRIM' THEN 1 ELSE 0 END), 0) AS SENT,
                ISNULL(SUM(CASE WHEN A.STATUS = 'DITARIK' THEN 1 ELSE 0 END), 0) AS RECALLED,
                ISNULL(SUM(A.RECIPIENTCOUNT), 0) AS RECIPIENTS,
                ISNULL((SELECT COUNT(*) FROM T_MESSAGE_RECIPIENT R
                         JOIN T_MESSAGE M ON M.MSGID = R.MSGID
                         WHERE R.READSTATUS = 'DIBACA'), 0) AS READTOTAL
            FROM T_MESSAGE A
        ");

        return json_encode(['success' => true, 'Rows' => [$row ?: ['SENT' => 0, 'RECALLED' => 0, 'RECIPIENTS' => 0, 'READTOTAL' => 0]]]);
    }

    // Tarik pesan: STATUS -> DITARIK + alasan wajib. Isi dan penerima tetap
    // tersimpan; pesan hilang dari inbox via filter. Tidak bisa ditarik ulang.
    public static function process_recall($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $msgid = $vdata['MSGID'] ?? null;
        $reason = trim((string) ($vdata['REASON'] ?? ''));
        $by = $param['VUSERLOGIN'] ?? '';

        if (empty($msgid)) {
            return json_encode(['success' => 'false', 'message' => 'MSGID tidak ditemukan.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan penarikan wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $row = DB::selectOne("
            SELECT MSGID, TITLE, STATUS, RECIPIENTCOUNT FROM T_MESSAGE WHERE MSGID = ?
        ", [$msgid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data pesan tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'TERKIRIM') {
            return json_encode(['success' => 'false', 'message' => 'Hanya pesan TERKIRIM yang bisa ditarik.']);
        }

        DB::update("
            UPDATE T_MESSAGE
            SET STATUS = 'DITARIK', RECALLTIME = GETDATE(), RECALLBY = ?,
                RECALLREASON = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE MSGID = ? AND STATUS = 'TERKIRIM'
        ", [$by, mb_substr($reason, 0, 200), $by, $msgid]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'cp_message_history', 'page' => 'Message History',
            'table' => 'T_MESSAGE', 'dataId' => (string) $msgid,
            'summary' => 'TARIK PESAN ' . (string) ($row->TITLE ?? $msgid) . ' (' . (int) ($row->RECIPIENTCOUNT ?? 0) . ' penerima)',
            'before' => ['STATUS' => (string) $row->STATUS],
            'after' => ['STATUS' => 'DITARIK', 'RECALLREASON' => $reason],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Pesan berhasil ditarik. Pesan hilang dari inbox penerima.']);
    }
}
