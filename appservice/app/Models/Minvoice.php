<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Daftar invoice (Finance). Tabel dbo.T_INVOICE. Terbit otomatis oleh layanan
// pembayaran; TANPA tambah/ubah/hapus. Isi tidak berubah setelah terbit.
// SEGMENT frontend: home/minvoice/minvoice. Menu CPMENU MCONTROL = minvoice.
class Minvoice extends Model
{
    use ColumnFilter;

    const MCODE = 70010003;
    const EXPORT_LIMIT = 10000;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'INVNO' => 'A.INVNO',
            'ISSUEDATE' => 'A.ISSUEDATE',
            'TOTAL' => 'A.TOTAL',
            'STATUS' => 'A.STATUS',
        ];
    }

    // Tolak bila group user tidak punya akses menu Invoice List.
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

    // Rentang tanggal: default bulan ini, maksimum 366 hari.
    // Return [from, to, pesanError|null] (Y-m-d).
    private static function parseRange($param): array
    {
        $fRaw = trim((string) ($param['datefrom'] ?? ''));
        $tRaw = trim((string) ($param['dateto'] ?? ''));
        $fTs = $fRaw !== '' ? strtotime($fRaw) : strtotime(date('Y-m-01'));
        $tTs = $tRaw !== '' ? strtotime($tRaw) : time();
        if ($fTs === false || $tTs === false) {
            return ['', '', 'Rentang tanggal tidak valid.'];
        }
        if ($tTs < $fTs) {
            return ['', '', 'Tanggal selesai harus setelah tanggal mulai.'];
        }
        if (($tTs - $fTs) > 366 * 86400) {
            return ['', '', 'Rentang maksimum 1 tahun.'];
        }
        return [date('Y-m-d', $fTs), date('Y-m-d', $tTs), null];
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $reftype = strtoupper(trim((string) ($param['reftype'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.ISSUEDATE >= ? AND A.ISSUEDATE <= ?";
        $args = [$from, $to];
        if ($q !== '') {
            $where .= " AND (A.INVNO LIKE ? OR A.RECIPIENT LIKE ?)";
            $like = '%' . $q . '%';
            array_push($args, $like, $like);
        }
        if (in_array($reftype, ['TIKET', 'MERCH', 'IKLAN'], true)) {
            $where .= " AND A.REFTYPE = ?";
            $args[] = $reftype;
        }
        if ($status === 'TERBIT' || $status === 'DIBATALKAN') {
            $where .= " AND A.STATUS = ?";
            $args[] = $status;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_INVOICE A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.ISSUEDATE DESC, A.INVOICEID DESC';

        $sql = "
            SELECT A.INVOICEID, A.INVNO, A.PAYMENTID, A.REFTYPE, A.ISSUEDATE,
                   A.RECIPIENT, A.TOTAL, A.STATUS,
                   P.PAYNO, P.SUBTOTAL, P.DISCOUNT, P.SERVICEFEE, P.SHIPPING,
                   P.TOTALPAID, P.PROMOCODE
            FROM T_INVOICE A
            LEFT JOIN T_PAYMENT P ON P.PAYMENTID = A.PAYMENTID
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $rows[] = (array) $r;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Detail lengkap untuk cetak (+info refund tanpa mengubah isi invoice).
    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['INVOICEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'INVOICEID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, P.PAYNO, P.PAIDAT, P.PAYMETHODID, M.PAYNAME,
                   P.SUBTOTAL, P.DISCOUNT, P.PROMOCODE, P.SERVICEFEE, P.SHIPPING,
                   P.TOTALPAID, P.PLATFORMFEE, P.OWNERAMT, P.SOURCE, P.STATUS AS PAYSTATUS
            FROM T_INVOICE A
            LEFT JOIN T_PAYMENT P ON P.PAYMENTID = A.PAYMENTID
            LEFT JOIN T_PAYMENT_METHOD M ON M.PAYID = P.PAYMETHODID
            WHERE A.INVOICEID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data invoice tidak ditemukan.']);
        }

        $arr = (array) $row;
        $arr['LINES'] = json_decode((string) ($row->LINES ?? '[]'), true) ?: [];
        // Samarkan email penerima (konsisten pola maskContact).
        $e = trim((string) ($arr['RECIPIENTEMAIL'] ?? ''));
        if ($e !== '' && strpos($e, '@') !== false) {
            [$u, $d] = explode('@', $e, 2);
            $arr['RECIPIENTEMAIL'] = substr($u, 0, 2) . '****@' . $d;
        }
        // Keterangan refund (tampil saja, isi invoice tidak berubah).
        $arr['REFUNDS'] = DB::select("
            SELECT AMOUNT, REFUNDTIME, REFUNDTYPE FROM T_PAYMENT_REFUND
            WHERE PAYMENTID = ? ORDER BY REFUNDID
        ", [(int) $row->PAYMENTID]);

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Ringkasan: jumlah + nilai terbit vs batal pada rentang.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        $rows = DB::select("
            SELECT STATUS, COUNT(*) AS N, ISNULL(SUM(TOTAL), 0) AS S
            FROM T_INVOICE WHERE ISSUEDATE >= ? AND ISSUEDATE <= ?
            GROUP BY STATUS
        ", [$from, $to]);
        $out = ['ISSUED' => 0, 'ISSUED_AMT' => '0', 'CANCELLED' => 0, 'CANCELLED_AMT' => '0'];
        foreach ($rows as $r) {
            if (strtoupper(trim((string) $r->STATUS)) === 'TERBIT') {
                $out['ISSUED'] = (int) $r->N;
                $out['ISSUED_AMT'] = (string) $r->S;
            } else {
                $out['CANCELLED'] = (int) $r->N;
                $out['CANCELLED_AMT'] = (string) $r->S;
            }
        }

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    // Identitas aplikasi untuk kop invoice (nama, logo, alamat, kontak).
    public static function read_identity($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $row = DB::selectOne("
            SELECT TOP 1 APPNAME, SLOGAN, LOGO, ADDRESS,
                   CONTACTEMAIL, CONTACTPHONE, CONTACTWA
            FROM T_APP_SETTING ORDER BY SETTINGID
        ");

        return json_encode(['success' => true, 'Rows' => [$row ? (array) $row : []]]);
    }

    // Export CSV daftar (dibatasi, dicatat di Audit Log).
    public static function read_export($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$from, $to, $rerr] = self::parseRange($param);
        if ($rerr !== null) {
            return json_encode(['success' => 'false', 'message' => $rerr]);
        }

        $reftype = strtoupper(trim((string) ($param['reftype'] ?? '')));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));

        $where = " WHERE A.ISSUEDATE >= ? AND A.ISSUEDATE <= ?";
        $args = [$from, $to];
        if (in_array($reftype, ['TIKET', 'MERCH', 'IKLAN'], true)) {
            $where .= " AND A.REFTYPE = ?";
            $args[] = $reftype;
        }
        if ($status === 'TERBIT' || $status === 'DIBATALKAN') {
            $where .= " AND A.STATUS = ?";
            $args[] = $status;
        }

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_INVOICE A" . $where, $args);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $rows = DB::select("
            SELECT A.INVNO, A.ISSUEDATE, A.REFTYPE, A.RECIPIENT, A.TOTAL, A.STATUS
            FROM T_INVOICE A
            " . $where . "
            ORDER BY A.ISSUEDATE DESC, A.INVOICEID DESC
            OFFSET 0 ROWS FETCH NEXT " . self::EXPORT_LIMIT . " ROWS ONLY
        ", $args);

        $fp = fopen('php://temp', 'r+');
        fwrite($fp, "\xEF\xBB\xBF"); // BOM agar Excel baca UTF-8
        fputcsv($fp, ['Nomor', 'Tanggal', 'Jenis', 'Penerima', 'Total', 'Status'], ';');
        foreach ($rows as $r) {
            fputcsv($fp, [
                $r->INVNO, $r->ISSUEDATE, $r->REFTYPE, $r->RECIPIENT,
                (string) $r->TOTAL, $r->STATUS,
            ], ';');
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        AuditTrail::log([
            'action' => 'EXPORT', 'mcontrol' => 'minvoice', 'page' => 'Invoice List',
            'table' => 'T_INVOICE', 'dataId' => '',
            'summary' => 'Export CSV ' . $total . ' baris' . ($total > self::EXPORT_LIMIT ? ' (dipotong ' . self::EXPORT_LIMIT . ')' : ''),
            'before' => [], 'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => true,
            'filename' => 'invoice_' . date('Ymd_His') . '.csv',
            'csv_base64' => base64_encode((string) $csv),
            'total' => $total,
            'truncated' => $total > self::EXPORT_LIMIT,
        ]);
    }
}
