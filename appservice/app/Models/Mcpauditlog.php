<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Audit Log (Log Center, module System). Baca dari dbo.T_AUDIT_LOG.
// Hanya baca + export. TIDAK ADA endpoint tambah/ubah/hapus dari frontend
// (ditolak juga di level database oleh trigger).
// SEGMENT frontend: home/cpauditlog/cpauditlog. Menu CPMENU MCONTROL = cp_auditlog.
class Mcpauditlog extends Model
{
    use ColumnFilter;

    // Batas export CSV (baris). Permintaan lebih besar tetap jalan tapi terpotong.
    const EXPORT_LIMIT = 10000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'LOGID' => 'A.LOGID',
            'LOGTIME' => 'A.LOGTIME',
            'USERLOGIN' => 'A.USERLOGIN',
            'ACTION' => 'A.ACTION',
            'MCONTROL' => 'A.MCONTROL',
            'PAGENAME' => 'A.PAGENAME',
        ];
    }

    // Susun WHERE dari filter bar + filter kolom. Return [$where, $args].
    // $since = batas bawah default (7 hari) bila date_from kosong.
    private static function buildWhere($param, bool $forExport = false): array
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $user = trim((string) ($param['user'] ?? ''));
        $action = strtoupper(trim((string) ($param['action'] ?? '')));
        $page = trim((string) ($param['page'] ?? ''));
        $q = trim((string) ($param['q'] ?? ''));

        if ($dateFrom === '') {
            $dateFrom = date('Y-m-d', strtotime('-7 days'));
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

        $where = " WHERE CAST(A.LOGTIME AS DATE) >= ? AND CAST(A.LOGTIME AS DATE) <= ?";
        $args = [$dateFrom, $dateTo];

        if ($user !== '') {
            $where .= " AND A.USERLOGIN LIKE ?";
            $args[] = '%' . $user . '%';
        }
        $actions = ['CREATE', 'UPDATE', 'DELETE', 'STATUS', 'EXPORT', 'LAINNYA'];
        if ($action !== '' && in_array($action, $actions, true)) {
            $where .= " AND A.ACTION = ?";
            $args[] = $action;
        }
        if ($page !== '') {
            $where .= " AND (A.PAGENAME LIKE ? OR A.MCONTROL LIKE ?)";
            $args[] = '%' . $page . '%';
            $args[] = '%' . $page . '%';
        }
        if ($q !== '') {
            $where .= " AND A.SUMMARY LIKE ?";
            $args[] = '%' . $q . '%';
        }

        // Filter per kolom grid (DataTable) digabung.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        return [$where, $args];
    }

    public static function read_data($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;

        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_AUDIT_LOG A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.LOGTIME DESC, A.LOGID DESC';

        $sql = "
            SELECT A.LOGID, A.LOGTIME, A.USERLOGIN, A.USERNAME, A.ACTION,
                   A.MCONTROL, A.PAGENAME, A.TABLENAME, A.DATAID, A.SUMMARY, A.USERIP
            FROM T_AUDIT_LOG A
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
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $logid = $vdata['LOGID'] ?? null;

        if (empty($logid)) {
            return json_encode(['success' => 'false', 'message' => 'LOGID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT * FROM T_AUDIT_LOG WHERE LOGID = ?", [$logid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data log tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Export CSV mengikuti filter aktif (maks EXPORT_LIMIT baris).
    // Return {success, filename, csv_base64, total, truncated}. Export-nya
    // sendiri dicatat sebagai log aksi EXPORT (tanpa data baris).
    public static function read_export($param)
    {
        [$where, $args] = self::buildWhere($param, true);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_AUDIT_LOG A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT LOGTIME, USERLOGIN, USERNAME, ACTION, MCONTROL, PAGENAME,
                   TABLENAME, DATAID, SUMMARY, USERIP
            FROM T_AUDIT_LOG A
            " . $where . "
            ORDER BY A.LOGTIME DESC, A.LOGID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Waktu', 'User', 'Username', 'Aksi', 'MControl', 'Halaman', 'Tabel', 'DataID', 'Ringkasan', 'IP'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->LOGTIME, $r->USERLOGIN, $r->USERNAME, $r->ACTION, $r->MCONTROL,
                $r->PAGENAME, $r->TABLENAME, $r->DATAID, $r->SUMMARY, $r->USERIP,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT',
            'mcontrol' => 'cp_auditlog',
            'page' => 'Audit Log',
            'table' => 'T_AUDIT_LOG',
            'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'audit_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
