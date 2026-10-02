<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// System Log (Log Center, module System). Baca dari dbo.T_SYSTEM_LOG.
// Hanya baca + ringkasan. TIDAK ADA endpoint tambah/ubah/hapus dari frontend
// (ditolak juga di level database oleh trigger).
// SEGMENT frontend: home/cpsyslog/cpsyslog. Menu CPMENU MCONTROL = cp_syslog.
class Mcpsyslog extends Model
{
    use ColumnFilter;

    // Level yang diizinkan.
    const LEVELS = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'SYSLOGID' => 'A.SYSLOGID',
            'LOGTIME' => 'A.LOGTIME',
            'LOGLEVEL' => 'A.LOGLEVEL',
            'LOGSOURCE' => 'A.LOGSOURCE',
            'HTTPSTATUS' => 'A.HTTPSTATUS',
            'USERLOGIN' => 'A.USERLOGIN',
        ];
    }

    // Susun WHERE dari filter bar + filter kolom. Return [$where, $args] atau pesan error.
    private static function buildWhere($param): array
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $level = strtoupper(trim((string) ($param['level'] ?? '')));
        $source = trim((string) ($param['source'] ?? ''));
        $q = trim((string) ($param['q'] ?? ''));

        if ($dateFrom === '' || $dateTo === '') {
            $dateTo = date('Y-m-d');
            $dateFrom = date('Y-m-d', strtotime('-1 day', strtotime($dateTo)));
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return ['__ERROR__Format tanggal harus YYYY-MM-DD.', []];
        }
        if ($dateFrom > $dateTo) {
            return ['__ERROR__Tanggal mulai tidak boleh sesudah tanggal akhir.', []];
        }
        $days = (strtotime($dateTo) - strtotime($dateFrom)) / 86400;
        if ($days > 91) {
            return ['__ERROR__Rentang maksimum 90 hari.', []];
        }

        $where = " WHERE CAST(A.LOGTIME AS DATE) >= ? AND CAST(A.LOGTIME AS DATE) <= ?";
        $args = [$dateFrom, $dateTo];

        if ($level !== '' && in_array($level, self::LEVELS, true)) {
            $where .= " AND A.LOGLEVEL = ?";
            $args[] = $level;
        }
        if ($source !== '') {
            $where .= " AND A.LOGSOURCE LIKE ?";
            $args[] = '%' . $source . '%';
        }
        if ($q !== '') {
            $where .= " AND A.MESSAGE LIKE ?";
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

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_SYSTEM_LOG A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.LOGTIME DESC, A.SYSLOGID DESC';

        $sql = "
            SELECT A.SYSLOGID, A.LOGTIME, A.LOGLEVEL, A.LOGSOURCE,
                   A.MESSAGE, A.HTTPSTATUS, A.USERLOGIN, A.USERIP
            FROM T_SYSTEM_LOG A
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
        $id = $vdata['SYSLOGID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'SYSLOGID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT * FROM T_SYSTEM_LOG WHERE SYSLOGID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data log tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Ringkasan jumlah per level pada rentang terpilih.
    public static function read_summary($param)
    {
        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $rows = DB::select("
            SELECT A.LOGLEVEL, COUNT(*) AS TOTAL FROM T_SYSTEM_LOG A
            " . $where . "
            GROUP BY A.LOGLEVEL
        ", $args);

        $out = ['INFO' => 0, 'WARNING' => 0, 'ERROR' => 0, 'CRITICAL' => 0];
        foreach ($rows as $r) {
            $lv = strtoupper((string) ($r->LOGLEVEL ?? ''));
            if (isset($out[$lv])) {
                $out[$lv] = (int) $r->TOTAL;
            }
        }
        $out['TOTAL'] = array_sum($out);

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }
}
