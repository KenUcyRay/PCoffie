<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Login History (Log Center, module System). Baca dari dbo.T_LOGIN_HISTORY.
// Hanya baca + ringkasan + export. TIDAK ADA endpoint tambah/ubah/hapus dari
// frontend (ditolak juga di level database oleh trigger).
// SEGMENT frontend: home/cploginhistory/cploginhistory. Menu CPMENU MCONTROL = cp_loginlog.
class Mcploginhistory extends Model
{
    use ColumnFilter;

    // Batas export CSV (baris). Permintaan lebih besar tetap jalan tapi terpotong.
    const EXPORT_LIMIT = 10000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'LOGINID' => 'A.LOGINID',
            'LOGTIME' => 'A.LOGTIME',
            'TYPEDUSER' => 'A.TYPEDUSER',
            'RESULT' => 'A.RESULT',
            'FAILREASON' => 'A.FAILREASON',
            'USERIP' => 'A.USERIP',
        ];
    }

    // Susun WHERE dari filter bar + filter kolom. Return [$where, $args] atau pesan error.
    private static function buildWhere($param): array
    {
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));
        $user = trim((string) ($param['user'] ?? ''));
        $result = strtoupper(trim((string) ($param['result'] ?? '')));
        $reason = strtoupper(trim((string) ($param['reason'] ?? '')));
        $ip = trim((string) ($param['ip'] ?? ''));
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
            $where .= " AND A.TYPEDUSER LIKE ?";
            $args[] = '%' . $user . '%';
        }
        $results = ['SUCCESS', 'FAILED', 'BLOCKED', 'LOGOUT'];
        if ($result !== '' && in_array($result, $results, true)) {
            $where .= " AND A.RESULT = ?";
            $args[] = $result;
        }
        $reasons = ['WRONG_PASSWORD', 'USER_NOT_FOUND', 'INACTIVE', 'BLOCKED'];
        if ($reason !== '' && in_array($reason, $reasons, true)) {
            $where .= " AND A.FAILREASON = ?";
            $args[] = $reason;
        }
        if ($ip !== '') {
            $where .= " AND A.USERIP LIKE ?";
            $args[] = '%' . $ip . '%';
        }
        if ($q !== '') {
            $where .= " AND (A.TYPEDUSER LIKE ? OR A.DEVICE LIKE ? OR A.BROWSER LIKE ?)";
            $args[] = '%' . $q . '%';
            $args[] = '%' . $q . '%';
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

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_LOGIN_HISTORY A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.LOGTIME DESC, A.LOGINID DESC';

        $sql = "
            SELECT A.LOGINID, A.LOGTIME, A.TYPEDUSER, A.USERID, A.RESULT,
                   A.FAILREASON, A.USERIP, A.DEVICE, A.BROWSER
            FROM T_LOGIN_HISTORY A
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

    // Ringkasan rentang terpilih: sukses, gagal, diblokir, IP unik terbanyak gagal.
    public static function read_summary($param)
    {
        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $rows = DB::select("
            SELECT A.RESULT, COUNT(*) AS TOTAL FROM T_LOGIN_HISTORY A
            " . $where . "
            GROUP BY A.RESULT
        ", $args);

        $out = ['SUCCESS' => 0, 'FAILED' => 0, 'BLOCKED' => 0, 'LOGOUT' => 0];
        foreach ($rows as $r) {
            $k = strtoupper((string) ($r->RESULT ?? ''));
            if (isset($out[$k])) {
                $out[$k] = (int) $r->TOTAL;
            }
        }

        $top = DB::selectOne("
            SELECT TOP 1 A.USERIP, COUNT(*) AS TOTAL FROM T_LOGIN_HISTORY A
            " . $where . " AND A.RESULT IN ('FAILED', 'BLOCKED')
            GROUP BY A.USERIP
            ORDER BY COUNT(*) DESC
        ", $args);

        $out['TOP_IP'] = ($top && $top->USERIP) ? (string) $top->USERIP : '-';
        $out['TOP_IP_FAILS'] = $top ? (int) $top->TOTAL : 0;
        $out['TOTAL'] = $out['SUCCESS'] + $out['FAILED'] + $out['BLOCKED'] + $out['LOGOUT'];

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    // Export CSV mengikuti filter aktif (maks EXPORT_LIMIT baris).
    // Return {success, filename, csv_base64, total, truncated}. Export-nya
    // sendiri dicatat di Audit Log aksi EXPORT (bukan di tabel ini).
    public static function read_export($param)
    {
        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_LOGIN_HISTORY A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT LOGTIME, TYPEDUSER, RESULT, FAILREASON, USERIP, DEVICE, BROWSER
            FROM T_LOGIN_HISTORY A
            " . $where . "
            ORDER BY A.LOGTIME DESC, A.LOGINID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Waktu', 'Username', 'Hasil', 'Alasan', 'IP', 'Perangkat', 'Browser'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->LOGTIME, $r->TYPEDUSER, $r->RESULT, $r->FAILREASON,
                $r->USERIP, $r->DEVICE, $r->BROWSER,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT',
            'mcontrol' => 'cp_loginlog',
            'page' => 'Login History',
            'table' => 'T_LOGIN_HISTORY',
            'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'login_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
