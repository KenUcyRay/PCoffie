<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Riwayat versi pengaturan fee (Master Data, module System). Tabel dbo.T_FEE_SETTING
// (aturan: tabel baru pakai awalan T_, bukan CP_). Satu baris = satu versi lengkap.
// Versi lama tidak diubah/dihapus; yang berlaku = AKTIF dengan tanggal mulai
// paling baru yang sudah tiba. Versi mendatang masih boleh dibatalkan.
// SEGMENT frontend: home/cpfee/cpfee. Menu CPMENU MCONTROL = cp_fee.
class Mcpfee extends Model
{
    use ColumnFilter;

    const TABLE = 'T_FEE_SETTING';

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'FEEID' => 'A.FEEID',
            'EFFECTIVEFROM' => 'A.EFFECTIVEFROM',
            'PLATFORMPCT' => 'A.PLATFORMPCT',
            'FEESTATUS' => 'A.FEESTATUS',
        ];
    }

    // Ambil pengaturan yang berlaku pada tanggal Y-m-d (default hari ini).
    // Dipakai halaman (read_effective) dan modul lain (order) dengan hasil sama persis.
    private static function effectiveOn(?string $date)
    {
        if ($date === null || $date === '') {
            $row = DB::selectOne("
                SELECT FEEID, EFFECTIVEFROM, PLATFORMPCT, PLATFORMFIX, SERVICEPERTICKET,
                       WITHDRAWFEE, MINWITHDRAW, PAYOUTWAITDAYS, PAYTIMEOUTMIN, FEESTATUS, FEENOTE
                FROM T_FEE_SETTING
                WHERE FEESTATUS = 'AKTIF' AND EFFECTIVEFROM <= CAST(GETDATE() AS DATE)
                ORDER BY EFFECTIVEFROM DESC, FEEID DESC
                OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
            ");
        } else {
            $row = DB::selectOne("
                SELECT FEEID, EFFECTIVEFROM, PLATFORMPCT, PLATFORMFIX, SERVICEPERTICKET,
                       WITHDRAWFEE, MINWITHDRAW, PAYOUTWAITDAYS, PAYTIMEOUTMIN, FEESTATUS, FEENOTE
                FROM T_FEE_SETTING
                WHERE FEESTATUS = 'AKTIF' AND EFFECTIVEFROM <= ?
                ORDER BY EFFECTIVEFROM DESC, FEEID DESC
                OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
            ", [$date]);
        }
        return $row ?: null;
    }

    // Pengaturan yang sedang berlaku (untuk kartu + modul lain).
    public static function read_effective($param)
    {
        $vdata = is_array($param['vdata'] ?? null) ? $param['vdata'] : (json_decode($param['vdata'] ?? '{}', true) ?: []);
        $date = trim((string) ($vdata['date'] ?? ($param['date'] ?? '')));
        if ($date !== '' && !self::validDate($date)) {
            return json_encode(['success' => 'false', 'message' => 'Format tanggal harus YYYY-MM-DD.']);
        }

        $row = self::effectiveOn($date === '' ? null : $date);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Belum ada pengaturan fee yang berlaku.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Versi mendatang terdekat yang sudah dijadwalkan (1 baris atau kosong).
    public static function read_scheduled($param)
    {
        $row = DB::selectOne("
            SELECT FEEID, EFFECTIVEFROM, PLATFORMPCT, PLATFORMFIX, SERVICEPERTICKET,
                   WITHDRAWFEE, MINWITHDRAW, PAYOUTWAITDAYS, PAYTIMEOUTMIN, FEESTATUS, FEENOTE
            FROM T_FEE_SETTING
            WHERE FEESTATUS = 'AKTIF' AND EFFECTIVEFROM > CAST(GETDATE() AS DATE)
            ORDER BY EFFECTIVEFROM ASC, FEEID ASC
            OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
        ");

        return json_encode(['success' => true, 'Rows' => $row ? [$row] : []]);
    }

    public static function read_history($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args  = [];
        if ($q !== '') {
            $where = " WHERE (A.FEENOTE LIKE ? OR A.FEESTATUS LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);
        // Guard: filter kolom tanpa q harus diawali WHERE (bukan AND).
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_FEE_SETTING A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.EFFECTIVEFROM DESC, A.FEEID DESC';

        $sql = "
            SELECT A.FEEID, A.EFFECTIVEFROM, A.PLATFORMPCT, A.PLATFORMFIX, A.SERVICEPERTICKET,
                   A.WITHDRAWFEE, A.MINWITHDRAW, A.PAYOUTWAITDAYS, A.PAYTIMEOUTMIN,
                   A.FEESTATUS, A.FEENOTE, A.SYSCREATEUSER, A.SYSCREATEDATE
            FROM T_FEE_SETTING A
            " . $where . "
            ORDER BY " . $order . "
        ";

        // OFFSET/FETCH nilai integer di-inline karena sudah di-cast aman (hindari isu binding int).
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);

        // Tandai baris yang sedang berlaku (untuk highlight di tabel).
        $cur = self::effectiveOn(null);
        $curId = $cur ? (int) $cur->FEEID : 0;
        foreach ($result as $r) {
            $r->ISCURRENT = ((int) $r->FEEID === $curId) ? 'YES' : 'NO';
        }

        return json_encode([
            'success' => true,
            'Rows' => $result,
            'TotalRows' => $totalRows
        ]);
    }

    private static function validDate(string $d): bool
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m)) {
            return false;
        }
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    private static function validMoney($v): bool
    {
        $v = trim((string) $v);
        return $v !== '' && preg_match('/^\d+(\.\d+)?$/', $v);
    }

    // Validasi versi baru. Return pesan error atau null bila lolos.
    private static function validate($vdata): ?string
    {
        $date = trim((string) ($vdata['EFFECTIVEFROM'] ?? ''));
        $pct = trim((string) ($vdata['PLATFORMPCT'] ?? ''));
        $fix = trim((string) ($vdata['PLATFORMFIX'] ?? ''));
        $svc = trim((string) ($vdata['SERVICEPERTICKET'] ?? ''));
        $wdfee = trim((string) ($vdata['WITHDRAWFEE'] ?? ''));
        $minwd = trim((string) ($vdata['MINWITHDRAW'] ?? ''));
        $wait = trim((string) ($vdata['PAYOUTWAITDAYS'] ?? ''));
        $timeout = trim((string) ($vdata['PAYTIMEOUTMIN'] ?? ''));
        $note = trim((string) ($vdata['FEENOTE'] ?? ''));

        if ($date === '' || $pct === '' || $fix === '' || $svc === '' || $wdfee === ''
            || $minwd === '' || $wait === '' || $timeout === '' || $note === '') {
            return 'Semua kolom wajib diisi.';
        }
        if (!self::validDate($date)) {
            return 'Tanggal mulai berlaku tidak valid (YYYY-MM-DD).';
        }
        if ($date < date('Y-m-d')) {
            return 'Tanggal mulai berlaku tidak boleh di masa lalu.';
        }
        if (!self::validMoney($pct) || (float) $pct < 0 || (float) $pct > 100) {
            return 'Biaya platform persen antara 0 sampai 100.';
        }
        foreach (['Biaya platform tetap' => $fix, 'Biaya layanan' => $svc,
                  'Biaya penarikan' => $wdfee, 'Minimum penarikan' => $minwd] as $lbl => $v) {
            if (!self::validMoney($v)) {
                return $lbl . ' tidak negatif.';
            }
        }
        if ((float) $minwd <= (float) $wdfee) {
            return 'Minimum penarikan harus lebih besar dari biaya penarikan.';
        }
        if (filter_var($wait, FILTER_VALIDATE_INT) === false || (int) $wait < 0 || (int) $wait > 30) {
            return 'Masa tunggu payout 0 sampai 30 hari.';
        }
        if (filter_var($timeout, FILTER_VALIDATE_INT) === false || (int) $timeout < 5 || (int) $timeout > 1440) {
            return 'Batas waktu bayar 5 sampai 1440 menit.';
        }
        if (strlen($note) > 200) {
            return 'Catatan maksimal 200 karakter.';
        }

        // Tanggal tidak boleh sama dengan versi aktif lain, dan harus lebih
        // baru dari semua versi aktif (termasuk yang terjadwal).
        $max = DB::selectOne("
            SELECT MAX(EFFECTIVEFROM) AS MD FROM T_FEE_SETTING WHERE FEESTATUS = 'AKTIF'
        ");
        $maxDate = $max && $max->MD ? date('Y-m-d', strtotime((string) $max->MD)) : null;
        if ($maxDate !== null && $date <= $maxDate) {
            return 'Sudah ada versi aktif bertanggal sama atau lebih baru. Batalkan versi mendatang dulu bila ingin menggantinya.';
        }

        return null;
    }

    public static function process_create($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        DB::insert("
            INSERT INTO T_FEE_SETTING
                (EFFECTIVEFROM, PLATFORMPCT, PLATFORMFIX, SERVICEPERTICKET, WITHDRAWFEE,
                 MINWITHDRAW, PAYOUTWAITDAYS, PAYTIMEOUTMIN, FEESTATUS, FEENOTE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AKTIF', ?, ?, GETDATE())
        ", [
            trim($vdata['EFFECTIVEFROM']), (float) trim($vdata['PLATFORMPCT']),
            (float) trim($vdata['PLATFORMFIX']), (float) trim($vdata['SERVICEPERTICKET']),
            (float) trim($vdata['WITHDRAWFEE']), (float) trim($vdata['MINWITHDRAW']),
            (int) trim($vdata['PAYOUTWAITDAYS']), (int) trim($vdata['PAYTIMEOUTMIN']),
            trim($vdata['FEENOTE']), $param['VUSERLOGIN'] ?? '',
        ]);

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'cp_fee', 'page' => 'Fee Setting',
            'table' => 'T_FEE_SETTING', 'dataId' => trim($vdata['EFFECTIVEFROM'] ?? ''),
            'summary' => 'Versi berlaku ' . trim($vdata['EFFECTIVEFROM'] ?? ''),
            'before' => [],
            'after' => ['EFFECTIVEFROM' => trim($vdata['EFFECTIVEFROM'] ?? ''), 'PLATFORMPCT' => trim($vdata['PLATFORMPCT'] ?? '')],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Versi pengaturan berhasil dibuat.']);
    }

    public static function cancel_version($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $feeid = $vdata['FEEID'] ?? null;

        if (empty($feeid)) {
            return json_encode(['success' => 'false', 'message' => 'FEEID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT FEEID, EFFECTIVEFROM, FEESTATUS FROM T_FEE_SETTING WHERE FEEID = ?", [$feeid]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data versi tidak ditemukan.']);
        }
        if (strtoupper((string) $row->FEESTATUS) !== 'AKTIF') {
            return json_encode(['success' => 'false', 'message' => 'Versi ini sudah tidak aktif.']);
        }
        $effDate = date('Y-m-d', strtotime((string) $row->EFFECTIVEFROM));
        if ($effDate <= date('Y-m-d')) {
            return json_encode(['success' => 'false', 'message' => 'Versi yang sudah berlaku tidak boleh dibatalkan.']);
        }

        DB::update("
            UPDATE T_FEE_SETTING
            SET FEESTATUS = 'DIBATALKAN', SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE FEEID = ?
        ", [$param['VUSERLOGIN'] ?? '', $feeid]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'cp_fee', 'page' => 'Fee Setting',
            'table' => 'T_FEE_SETTING', 'dataId' => $feeid,
            'summary' => 'Versi ' . $effDate . ' dibatalkan',
            'before' => ['FEESTATUS' => 'AKTIF'],
            'after' => ['FEESTATUS' => 'DIBATALKAN'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Versi mendatang berhasil dibatalkan.']);
    }

}
