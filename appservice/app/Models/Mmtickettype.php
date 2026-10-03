<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Tipe tiket per event (Event Management, module Event). Tabel dbo.T_TICKET_TYPE.
// SEGMENT frontend: home/mtickettype/mtickettype. Menu CPMENU MCONTROL = mtickettype.
//
// Harga NUMERIC presisi tetap (0 = gratis). Terjual DIHITUNG dari T_ATTENDEE
// aktif+lunas (tanpa kolom jumlah). Tidak ada tulis untuk event ENDED/CANCELLED.
class Mmtickettype extends Model
{
    use ColumnFilter;

    const MCODE = 30010003;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'TICKETTYPEID' => 'A.TICKETTYPEID',
            'NAME' => 'A.NAME',
            'PRICE' => 'A.PRICE',
            'QUOTA' => 'A.QUOTA',
            'SORTORDER' => 'A.SORTORDER',
            'ISACTIVE' => 'A.ISACTIVE',
        ];
    }

    // Tolak bila group user tidak punya akses menu Ticket Type.
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

    // Jumlah peserta aktif+lunas satu tipe (sold). Semua status tiket lain tidak dihitung.
    private static function activeSold(int $typeid): int
    {
        $row = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_ATTENDEE
            WHERE TICKETTYPEID = ? AND TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
        ", [$typeid]);
        return $row ? (int) $row->C : 0;
    }

    // Jumlah baris peserta apa pun satu tipe (untuk guard hapus).
    private static function anyAttendee(int $typeid): int
    {
        $row = DB::selectOne("SELECT COUNT(*) AS C FROM T_ATTENDEE WHERE TICKETTYPEID = ?", [$typeid]);
        return $row ? (int) $row->C : 0;
    }

    private static function eventOf(int $eventid)
    {
        return DB::selectOne("SELECT EVENTID, EVENTCODE, TITLE, STATUS, ENDAT FROM T_EVENT WHERE EVENTID = ?", [$eventid]);
    }

    // Validasi form. Return pesan error atau null bila lolos.
    private static function validate($vdata, int $eventid, $excludeId = null): ?string
    {
        $name = trim((string) ($vdata['NAME'] ?? ''));
        $priceRaw = trim((string) ($vdata['PRICE'] ?? ''));
        $quotaRaw = trim((string) ($vdata['QUOTA'] ?? ''));
        $maxRaw = trim((string) ($vdata['MAXPERSON'] ?? ''));
        $saleStartRaw = trim((string) ($vdata['SALESTART'] ?? ''));
        $saleEndRaw = trim((string) ($vdata['SALEEND'] ?? ''));

        if ($name === '') {
            return 'Nama tipe wajib diisi.';
        }
        if (mb_strlen($name) > 100) {
            return 'Nama tipe maksimal 100 karakter.';
        }
        if ($priceRaw === '' || !is_numeric($priceRaw) || (float) $priceRaw < 0) {
            return 'Harga wajib diisi dan tidak boleh negatif (0 = gratis).';
        }
        if ($quotaRaw === '' || filter_var($quotaRaw, FILTER_VALIDATE_INT) === false || (int) $quotaRaw < 1) {
            return 'Kuota wajib diisi minimal 1.';
        }
        if ($maxRaw === '' || filter_var($maxRaw, FILTER_VALIDATE_INT) === false || (int) $maxRaw < 1) {
            return 'Batas per orang wajib diisi minimal 1.';
        }
        if ((int) $maxRaw > (int) $quotaRaw) {
            return 'Batas per orang tidak boleh melebihi kuota.';
        }

        $saleStart = null;
        $saleEnd = null;
        if ($saleStartRaw !== '') {
            if (($saleStart = strtotime($saleStartRaw)) === false) {
                return 'Waktu mulai jual tidak valid.';
            }
        }
        if ($saleEndRaw !== '') {
            if (($saleEnd = strtotime($saleEndRaw)) === false) {
                return 'Waktu akhir jual tidak valid.';
            }
        }
        if ($saleStart !== null && $saleEnd !== null && $saleEnd < $saleStart) {
            return 'Waktu akhir jual tidak boleh sebelum waktu mulai jual.';
        }

        $ev = self::eventOf($eventid);
        if ($ev && $saleEnd !== null && !empty($ev->ENDAT)) {
            if (date('Y-m-d H:i:s', $saleEnd) > date('Y-m-d H:i:s', strtotime((string) $ev->ENDAT))) {
                return 'Waktu akhir jual paling lambat saat event selesai.';
            }
        }

        // Nama unik dalam satu event (abaikan beda kapital).
        $dupSql = "SELECT 1 AS X FROM T_TICKET_TYPE WHERE EVENTID = ? AND UPPER(NAME) = UPPER(?)";
        $dupArgs = [$eventid, $name];
        if (!empty($excludeId)) {
            $dupSql .= " AND TICKETTYPEID <> ?";
            $dupArgs[] = $excludeId;
        }
        if (!empty(DB::select($dupSql, $dupArgs))) {
            return 'Nama tipe sudah dipakai di event ini.';
        }

        // Kuota tidak boleh di bawah peserta aktif yang sudah ada.
        if (!empty($excludeId)) {
            $sold = self::activeSold((int) $excludeId);
            if ((int) $quotaRaw < $sold) {
                return 'Kuota tidak boleh di bawah ' . $sold . ' peserta aktif yang sudah ada.';
            }
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

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.EVENTID = ?";
        $args = [(int) $eventid];
        if ($q !== '') {
            $where .= " AND (A.NAME LIKE ? OR A.DESCR LIKE ?)";
            $like = '%' . $q . '%';
            $args[] = $like;
            $args[] = $like;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_TICKET_TYPE A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default urutan tampil.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.SORTORDER, A.TICKETTYPEID';

        $sql = "
            SELECT A.TICKETTYPEID, A.EVENTID, A.NAME, A.DESCR, A.PRICE, A.QUOTA,
                   A.MAXPERSON, A.SALESTART, A.SALEEND, A.SORTORDER, A.ISACTIVE,
                   (SELECT COUNT(*) FROM T_ATTENDEE S
                     WHERE S.TICKETTYPEID = A.TICKETTYPEID
                       AND S.TIKETSTATUS = 'AKTIF' AND S.PAYSTATUS = 'LUNAS') AS SOLD
            FROM T_TICKET_TYPE A
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
            $sold = (int) ($r->SOLD ?? 0);
            $quota = (int) ($r->QUOTA ?? 0);
            $arr['REMAIN'] = max(0, $quota - $sold);
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Ringkasan per event: total kuota, terjual, sisa, potensi pendapatan.
    // Kuota + potensi dari tipe AKTIF; terjual dari peserta aktif+lunas.
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
            SELECT ISNULL(SUM(A.QUOTA), 0) AS QUOTA,
                   ISNULL(SUM(A.QUOTA * A.PRICE), 0) AS REVENUE,
                   ISNULL((SELECT COUNT(*) FROM T_ATTENDEE S
                            WHERE S.EVENTID = A.EVENTID
                              AND S.TIKETSTATUS = 'AKTIF' AND S.PAYSTATUS = 'LUNAS'), 0) AS SOLD
            FROM T_TICKET_TYPE A
            WHERE A.EVENTID = ? AND A.ISACTIVE = 'YES'
            GROUP BY A.EVENTID
        ", [(int) $eventid]);

        $quota = $row ? (int) $row->QUOTA : 0;
        $sold = $row ? (int) $row->SOLD : 0;

        return json_encode(['success' => true, 'Rows' => [[
            'QUOTA' => $quota,
            'SOLD' => $sold,
            'REMAIN' => max(0, $quota - $sold),
            'REVENUE' => $row ? (string) $row->REVENUE : '0',
        ]]]);
    }

    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $eventid = $vdata['EVENTID'] ?? null;

        if (empty($eventid)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $ev = self::eventOf((int) $eventid);
        if (!$ev) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        $evst = strtoupper(trim((string) $ev->STATUS));
        if ($evst === 'ENDED' || $evst === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Tipe tiket tidak bisa ditambah untuk event ' . $evst . '.']);
        }

        $err = self::validate($vdata, (int) $eventid);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $sortRaw = trim((string) ($vdata['SORTORDER'] ?? ''));
        $sort = $sortRaw === '' ? 0 : (int) $sortRaw;

        DB::insert("
            INSERT INTO T_TICKET_TYPE
                (EVENTID, NAME, DESCR, PRICE, QUOTA, MAXPERSON, SALESTART, SALEEND,
                 SORTORDER, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                 ?, 'YES', ?, GETDATE())
        ", [
            (int) $eventid, trim($vdata['NAME']),
            mb_substr(trim((string) ($vdata['DESCR'] ?? '')), 0, 500),
            (float) trim($vdata['PRICE']), (int) trim($vdata['QUOTA']), (int) trim($vdata['MAXPERSON']),
            trim((string) ($vdata['SALESTART'] ?? '')) === '' ? null : date('Y-m-d H:i:s', strtotime(trim($vdata['SALESTART']))),
            trim((string) ($vdata['SALEEND'] ?? '')) === '' ? null : date('Y-m-d H:i:s', strtotime(trim($vdata['SALEEND']))),
            $sort, $param['VUSERLOGIN'] ?? '',
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mtickettype', 'page' => 'Ticket Type',
            'table' => 'T_TICKET_TYPE', 'dataId' => (string) $id,
            'summary' => 'TIPE ' . trim($vdata['NAME']) . ' @' . (string) ($ev->EVENTCODE ?? $eventid),
            'before' => [],
            'after' => ['NAME' => trim($vdata['NAME']), 'PRICE' => trim($vdata['PRICE']), 'QUOTA' => trim($vdata['QUOTA'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Tipe tiket berhasil dibuat.',
            'Rows' => [['TICKETTYPEID' => $id]],
        ]);
    }

    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TICKETTYPEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TICKETTYPEID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT * FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tipe tiket tidak ditemukan.']);
        }
        $ev = self::eventOf((int) $row->EVENTID);
        $evst = $ev ? strtoupper(trim((string) $ev->STATUS)) : '';
        if ($evst === 'ENDED' || $evst === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Tipe tiket tidak bisa diubah untuk event ' . $evst . '.']);
        }

        $err = self::validate($vdata, (int) $row->EVENTID, $id);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $sortRaw = trim((string) ($vdata['SORTORDER'] ?? ''));
        $sort = $sortRaw === '' ? 0 : (int) $sortRaw;

        DB::update("
            UPDATE T_TICKET_TYPE
            SET NAME = ?, DESCR = ?, PRICE = ?, QUOTA = ?, MAXPERSON = ?,
                SALESTART = ?, SALEEND = ?, SORTORDER = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE TICKETTYPEID = ?
        ", [
            trim($vdata['NAME']),
            mb_substr(trim((string) ($vdata['DESCR'] ?? '')), 0, 500),
            (float) trim($vdata['PRICE']), (int) trim($vdata['QUOTA']), (int) trim($vdata['MAXPERSON']),
            trim((string) ($vdata['SALESTART'] ?? '')) === '' ? null : date('Y-m-d H:i:s', strtotime(trim($vdata['SALESTART']))),
            trim((string) ($vdata['SALEEND'] ?? '')) === '' ? null : date('Y-m-d H:i:s', strtotime(trim($vdata['SALEEND']))),
            $sort, $param['VUSERLOGIN'] ?? '', $id,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mtickettype', 'page' => 'Ticket Type',
            'table' => 'T_TICKET_TYPE', 'dataId' => (string) $id,
            'summary' => 'TIPE ' . trim($vdata['NAME']) . ' @' . (string) ($ev->EVENTCODE ?? $row->EVENTID),
            'before' => (array) $row,
            'after' => ['NAME' => trim($vdata['NAME']), 'PRICE' => trim($vdata['PRICE']), 'QUOTA' => trim($vdata['QUOTA'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Tipe tiket berhasil diupdate.']);
    }

    public static function change_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TICKETTYPEID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['ISACTIVE'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TICKETTYPEID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        $row = DB::selectOne("SELECT TICKETTYPEID, EVENTID, NAME, ISACTIVE FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tipe tiket tidak ditemukan.']);
        }
        $ev = self::eventOf((int) $row->EVENTID);
        $evst = $ev ? strtoupper(trim((string) $ev->STATUS)) : '';
        if ($evst === 'ENDED' || $evst === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Status tidak bisa diubah untuk event ' . $evst . '.']);
        }

        // Event PUBLISHED harus selalu punya minimal satu tipe aktif.
        if ($active === 'NO' && $evst === 'PUBLISHED') {
            $left = DB::selectOne("
                SELECT COUNT(*) AS C FROM T_TICKET_TYPE
                WHERE EVENTID = ? AND ISACTIVE = 'YES' AND TICKETTYPEID <> ?
            ", [(int) $row->EVENTID, $id]);
            if ($left && (int) $left->C < 1) {
                return json_encode(['success' => 'false', 'message' => 'Event PUBLISHED harus punya minimal satu tipe tiket aktif.']);
            }
        }

        DB::update("
            UPDATE T_TICKET_TYPE
            SET ISACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE TICKETTYPEID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mtickettype', 'page' => 'Ticket Type',
            'table' => 'T_TICKET_TYPE', 'dataId' => (string) $id,
            'summary' => 'TIPE ' . (string) $row->NAME . ' -> ' . $active,
            'before' => ['ISACTIVE' => (string) $row->ISACTIVE],
            'after' => ['ISACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = $active === 'YES' ? 'Tipe tiket berhasil diaktifkan.' : 'Tipe tiket berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Ubah urutan tampil satu tipe.
    public static function change_order($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TICKETTYPEID'] ?? null;
        $sortRaw = trim((string) ($vdata['SORTORDER'] ?? ''));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TICKETTYPEID tidak ditemukan.']);
        }
        if ($sortRaw === '' || filter_var($sortRaw, FILTER_VALIDATE_INT) === false || (int) $sortRaw < 0) {
            return json_encode(['success' => 'false', 'message' => 'Urutan harus angka bulat tidak negatif.']);
        }

        $row = DB::selectOne("SELECT TICKETTYPEID, EVENTID, NAME, SORTORDER FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tipe tiket tidak ditemukan.']);
        }
        $ev = self::eventOf((int) $row->EVENTID);
        $evst = $ev ? strtoupper(trim((string) $ev->STATUS)) : '';
        if ($evst === 'ENDED' || $evst === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Urutan tidak bisa diubah untuk event ' . $evst . '.']);
        }

        DB::update("
            UPDATE T_TICKET_TYPE
            SET SORTORDER = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE TICKETTYPEID = ?
        ", [(int) $sortRaw, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mtickettype', 'page' => 'Ticket Type',
            'table' => 'T_TICKET_TYPE', 'dataId' => (string) $id,
            'summary' => 'URUTAN TIPE ' . (string) $row->NAME,
            'before' => ['SORTORDER' => (string) $row->SORTORDER],
            'after' => ['SORTORDER' => (int) $sortRaw],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Urutan berhasil diupdate.']);
    }

    // Hapus: hanya tipe yang belum punya peserta sama sekali.
    public static function process_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['TICKETTYPEID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'TICKETTYPEID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT TICKETTYPEID, EVENTID, NAME FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data tipe tiket tidak ditemukan.']);
        }
        if (self::anyAttendee((int) $id) > 0) {
            return json_encode(['success' => 'false', 'message' => 'Tipe "' . $row->NAME . '" sudah punya peserta, tidak boleh dihapus. Nonaktifkan saja.']);
        }

        DB::delete("DELETE FROM T_TICKET_TYPE WHERE TICKETTYPEID = ?", [$id]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mtickettype', 'page' => 'Ticket Type',
            'table' => 'T_TICKET_TYPE', 'dataId' => (string) $id,
            'summary' => 'TIPE ' . (string) $row->NAME,
            'before' => (array) $row,
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Tipe tiket berhasil dihapus.']);
    }
}
