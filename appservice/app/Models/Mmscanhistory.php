<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Riwayat scan tiket (Ticket Check-in, module Ticketing). Baca dari dbo.T_SCAN_LOG.
// SEGMENT frontend: home/mscanhistory/mscanhistory. Menu CPMENU MCONTROL = mscanhistory.
//
// Hanya baca + ringkasan + export. TIDAK ADA endpoint tambah/ubah/hapus
// (pencatatan hanya dari proses scan; ditolak juga di level database oleh trigger).
class Mmscanhistory extends Model
{
    use ColumnFilter;

    const MCODE = 40020003;
    const EXPORT_LIMIT = 10000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'SCANID' => 'A.SCANID',
            'SCANTIME' => 'A.SCANTIME',
            'RESULT' => 'A.RESULT',
            'USERLOGIN' => 'A.USERLOGIN',
        ];
    }

    // Tolak bila group user tidak punya akses menu Scan History.
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

    // Susun WHERE dari filter bar + filter kolom. Return [$where, $args] atau pesan error.
    private static function buildWhere($param)
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $eventid = trim((string) ($param['eventid'] ?? ''));
        $result = strtoupper(trim((string) ($param['result'] ?? '')));
        $user = trim((string) ($param['user'] ?? ''));
        $q = trim((string) ($param['q'] ?? ''));

        if ($dateFrom === '') {
            $dateFrom = date('Y-m-d');
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

        $where = " WHERE CAST(A.SCANTIME AS DATE) >= ? AND CAST(A.SCANTIME AS DATE) <= ?";
        $args = [$dateFrom, $dateTo];

        if ($eventid !== '' && filter_var($eventid, FILTER_VALIDATE_INT) !== false) {
            $where .= " AND A.EVENTID = ?";
            $args[] = (int) $eventid;
        }
        $results = ['VALID', 'SUDAH_DIPAKAI', 'TIDAK_VALID', 'SALAH_EVENT', 'BELUM_DIBAYAR', 'REFUND', 'DIBATALKAN', 'DI_LUAR_JADWAL'];
        if ($result !== '' && in_array($result, $results, true)) {
            $where .= " AND A.RESULT = ?";
            $args[] = $result;
        }
        if ($user !== '') {
            $where .= " AND A.USERLOGIN LIKE ?";
            $args[] = '%' . $user . '%';
        }
        if ($q !== '') {
            $where .= " AND (A.SCANCODE LIKE ? OR T.NAME LIKE ?)";
            $args[] = '%' . $q . '%';
            $args[] = '%' . $q . '%';
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

        // Filter per kolom grid (DataTable) digabung.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_SCAN_LOG A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.SCANTIME DESC, A.SCANID DESC';

        $sql = "
            SELECT A.SCANID, A.SCANTIME, A.EVENTID, E.TITLE AS EVENTTITLE,
                   A.ATTENDEEID, A.SCANCODE, T.NAME AS ATTNAME, TP.NAME AS TYPENAME,
                   A.RESULT, A.USERLOGIN, A.METHOD
            FROM T_SCAN_LOG A
            LEFT JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_ATTENDEE T ON T.ATTENDEEID = A.ATTENDEEID
            LEFT JOIN T_TICKET_TYPE TP ON TP.TICKETTYPEID = T.TICKETTYPEID
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

    // Ringkasan: total, valid, ditolak per jenis, + persen kehadiran (per event bila diisi).
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $eventid = trim((string) ($param['eventid'] ?? ''));

        $where = '';
        $args = [];
        if ($eventid !== '' && filter_var($eventid, FILTER_VALIDATE_INT) !== false) {
            $where = " WHERE A.EVENTID = ?";
            $args[] = (int) $eventid;
        }

        $row = DB::selectOne("
            SELECT COUNT(*) AS TOTAL,
                   ISNULL(SUM(CASE WHEN A.RESULT = 'VALID' THEN 1 ELSE 0 END), 0) AS VALID,
                   ISNULL(SUM(CASE WHEN A.RESULT = 'SUDAH_DIPAKAI' THEN 1 ELSE 0 END), 0) AS DIPAKAI,
                   ISNULL(SUM(CASE WHEN A.RESULT NOT IN ('VALID', 'SUDAH_DIPAKAI') THEN 1 ELSE 0 END), 0) AS TOLAK
            FROM T_SCAN_LOG A" . $where, $args);

        $out = [
            'TOTAL' => $row ? (int) $row->TOTAL : 0,
            'VALID' => $row ? (int) $row->VALID : 0,
            'DIPAKAI' => $row ? (int) $row->DIPAKAI : 0,
            'TOLAK' => $row ? (int) $row->TOLAK : 0,
            'HADIRPCT' => 0,
        ];

        if ($eventid !== '' && filter_var($eventid, FILTER_VALIDATE_INT) !== false) {
            $h = DB::selectOne("
                SELECT COUNT(*) AS TOTAL,
                       ISNULL(SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.PAYSTATUS = 'LUNAS' THEN 1 ELSE 0 END), 0) AS ELIG,
                       ISNULL(SUM(CASE WHEN A.TIKETSTATUS = 'AKTIF' AND A.ATTENDSTATUS = 'HADIR' THEN 1 ELSE 0 END), 0) AS HADIR
                FROM T_ATTENDEE A WHERE A.EVENTID = ?
            ", [(int) $eventid]);
            $elig = $h ? (int) $h->ELIG : 0;
            $out['HADIRPCT'] = $elig > 0 ? (int) round((($h ? (int) $h->HADIR : 0) * 100) / $elig) : 0;
        }

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    // Export CSV mengikuti filter aktif (maks EXPORT_LIMIT baris).
    // Return {success, filename, csv_base64, total, truncated}. Export-nya
    // sendiri dicatat sebagai log aksi EXPORT (tanpa data baris).
    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_SCAN_LOG A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT A.SCANTIME, A.SCANCODE, T.NAME AS ATTNAME, TP.NAME AS TYPENAME,
                   A.RESULT, A.USERLOGIN, A.METHOD
            FROM T_SCAN_LOG A
            LEFT JOIN T_ATTENDEE T ON T.ATTENDEEID = A.ATTENDEEID
            LEFT JOIN T_TICKET_TYPE TP ON TP.TICKETTYPEID = T.TICKETTYPEID
            " . $where . "
            ORDER BY A.SCANTIME DESC, A.SCANID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Waktu', 'Kode', 'Nama', 'Tipe', 'Hasil', 'Petugas', 'Metode'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->SCANTIME, $r->SCANCODE, $r->ATTNAME, $r->TYPENAME,
                $r->RESULT, $r->USERLOGIN, $r->METHOD,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT',
            'mcontrol' => 'mscanhistory',
            'page' => 'Scan History',
            'table' => 'T_SCAN_LOG',
            'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'scan_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
