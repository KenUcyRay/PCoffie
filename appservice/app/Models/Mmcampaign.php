<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Kampanye iklan (Marketing Tools, module Marketing).
// Tabel dbo.T_AD_POSITION + dbo.T_AD_CAMPAIGN + dbo.T_AD_STAT_DAILY.
// SEGMENT frontend: home/mcampaign/mcampaign. Menu CPMENU MCONTROL = mcampaign.
//
// Aturan: kode AD-XXXX otomatis; tarif/hari disalin saat dibuat;
// total = tarif x hari inklusif; kapacitas = kampanye bersamaan maks;
// batal butuh alasan; DIBATALKAN final; tayang publik via AdServe.
class Mmcampaign extends Model
{
    use ColumnFilter;

    const MCODE = 60010003;
    const BANNER_DIR = 'ads';
    const BANNER_MAX = 2097152; // 2MB

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'CAMPAIGNCODE' => 'A.CAMPAIGNCODE',
            'TITLE' => 'A.TITLE',
            'ADVERTISER' => 'A.ADVERTISER',
            'STARTDATE' => 'A.STARTDATE',
            'ENDDATE' => 'A.ENDDATE',
            'TOTALCOST' => 'A.TOTALCOST',
            'STATUS' => 'A.STATUS',
        ];
    }

    // Tolak bila group user tidak punya akses menu Ad Campaign.
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

    // Tampilan periode: TERJADWAL/TAYANG/SELESAI (dari periode vs hari ini).
    public static function periodStatus($start, $end): string
    {
        $today = date('Y-m-d');
        $s = substr((string) $start, 0, 10);
        $e = substr((string) $end, 0, 10);
        if ($today < $s) {
            return 'TERJADWAL';
        }
        if ($today > $e) {
            return 'SELESAI';
        }
        return 'TAYANG';
    }

    // Jumlah penghuni slot (AKTIF+DIJEDA) yang periodenya bertabrakan.
    private static function occupants(int $positionId, string $start, string $end, int $excludeId = 0): int
    {
        $row = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_AD_CAMPAIGN
            WHERE POSITIONID = ? AND CAMPAIGNID <> ?
              AND STATUS IN ('AKTIF', 'DIJEDA')
              AND STARTDATE <= ? AND ENDDATE >= ?
        ", [$positionId, $excludeId, $end, $start]);
        return $row ? (int) $row->C : 0;
    }

    // Posisi: daftar + penghuni hari ini (tanpa paging, sedikit baris).
    public static function read_position($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $today = date('Y-m-d');
        $rows = DB::select("
            SELECT P.POSITIONID, P.POSCODE, P.POSNAME, P.DESCR, P.WIDTH, P.HEIGHT,
                   P.RATEPERDAY, P.CAPACITY, P.SORTORDER, P.ISACTIVE,
                   (SELECT COUNT(*) FROM T_AD_CAMPAIGN A
                     WHERE A.POSITIONID = P.POSITIONID
                       AND A.STATUS IN ('AKTIF', 'DIJEDA')
                       AND A.STARTDATE <= ? AND A.ENDDATE >= ?) AS TODAYCOUNT
            FROM T_AD_POSITION P
            ORDER BY P.SORTORDER, P.POSCODE
        ", [$today, $today]);

        return json_encode(['success' => true, 'Rows' => $rows]);
    }

    // Ubah posisi: hanya tarif/kapasitas/status (dimensi & kode terkunci).
    public static function position_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['POSITIONID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'POSITIONID tidak ditemukan.']);
        }
        $before = DB::selectOne("SELECT * FROM T_AD_POSITION WHERE POSITIONID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Posisi tidak ditemukan.']);
        }

        $rateRaw = trim((string) ($vdata['RATEPERDAY'] ?? ''));
        $capRaw = trim((string) ($vdata['CAPACITY'] ?? ''));
        $active = strtoupper(trim((string) ($vdata['ISACTIVE'] ?? '')));
        if ($rateRaw === '' || !is_numeric($rateRaw) || (float) $rateRaw < 0) {
            return json_encode(['success' => 'false', 'message' => 'Tarif per hari tidak boleh negatif.']);
        }
        if ($capRaw === '' || filter_var($capRaw, FILTER_VALIDATE_INT) === false || (int) $capRaw < 1) {
            return json_encode(['success' => 'false', 'message' => 'Kapasitas minimal 1.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status posisi harus YES atau NO.']);
        }

        DB::update("
            UPDATE T_AD_POSITION
            SET RATEPERDAY = ?, CAPACITY = ?, ISACTIVE = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE POSITIONID = ?
        ", [(float) $rateRaw, (int) $capRaw, $active, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mcampaign', 'page' => 'Ad Campaign',
            'table' => 'T_AD_POSITION', 'dataId' => (string) ($before->POSCODE ?? $id),
            'summary' => 'POSISI ' . (string) ($before->POSCODE ?? $id),
            'before' => (array) $before,
            'after' => ['RATEPERDAY' => (float) $rateRaw, 'CAPACITY' => (int) $capRaw, 'ISACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Posisi berhasil diupdate.']);
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
        $posid = trim((string) ($param['positionid'] ?? ''));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.CAMPAIGNCODE LIKE ? OR A.TITLE LIKE ? OR A.ADVERTISER LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like];
        }
        $allowedStatus = ['DRAFT', 'MENUNGGU_BAYAR', 'AKTIF', 'DIJEDA', 'DIBATALKAN'];
        if ($status !== '' && in_array($status, $allowedStatus, true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($posid !== '' && ctype_digit($posid)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.POSITIONID = ?';
            $args[] = (int) $posid;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_AD_CAMPAIGN A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.CAMPAIGNID DESC';

        $sql = "
            SELECT A.CAMPAIGNID, A.CAMPAIGNCODE, A.TITLE, A.ADVERTISER, A.CONTACT,
                   A.BANNERIMAGE, A.LINKTYPE, A.EVENTID, A.LINKURL,
                   A.POSITIONID, P.POSCODE, P.POSNAME,
                   A.STARTDATE, A.ENDDATE, A.RATEPERDAY, A.DAYCOUNT, A.TOTALCOST,
                   A.STATUS, A.PAIDAT, A.CANCELREASON,
                   (SELECT ISNULL(SUM(IMPRESSIONS), 0) FROM T_AD_STAT_DAILY S
                     WHERE S.CAMPAIGNID = A.CAMPAIGNID) AS IMPRESSIONS,
                   (SELECT ISNULL(SUM(CLICKS), 0) FROM T_AD_STAT_DAILY S
                     WHERE S.CAMPAIGNID = A.CAMPAIGNID) AS CLICKS
            FROM T_AD_CAMPAIGN A
            LEFT JOIN T_AD_POSITION P ON P.POSITIONID = A.POSITIONID
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $arr = (array) $r;
            $arr['PERIODSTATUS'] = self::periodStatus($r->STARTDATE, $r->ENDDATE);
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Ringkasan: jumlah per status + tayang/klik hari ini + pendapatan bulan ini.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $out = ['DRAFT' => 0, 'MENUNGGU_BAYAR' => 0, 'AKTIF' => 0, 'DIJEDA' => 0, 'DIBATALKAN' => 0, 'TODAYIMP' => 0, 'TODAYCLICK' => 0, 'MONTHREVENUE' => '0'];
        foreach (DB::select("SELECT STATUS, COUNT(*) AS C FROM T_AD_CAMPAIGN GROUP BY STATUS") as $r) {
            if (isset($out[$r->STATUS])) {
                $out[$r->STATUS] = (int) $r->C;
            }
        }
        $today = date('Y-m-d');
        $t = DB::selectOne("
            SELECT ISNULL(SUM(IMPRESSIONS), 0) AS I, ISNULL(SUM(CLICKS), 0) AS K
            FROM T_AD_STAT_DAILY WHERE STATDATE = ?
        ", [$today]);
        if ($t) {
            $out['TODAYIMP'] = (int) $t->I;
            $out['TODAYCLICK'] = (int) $t->K;
        }
        $m = DB::selectOne("
            SELECT ISNULL(SUM(TOTALCOST), 0) AS S FROM T_AD_CAMPAIGN
            WHERE PAIDAT IS NOT NULL
              AND YEAR(PAIDAT) = YEAR(GETDATE()) AND MONTH(PAIDAT) = MONTH(GETDATE())
        ");
        $out['MONTHREVENUE'] = $m ? (string) $m->S : '0';

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['CAMPAIGNID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT C.*, P.POSCODE, P.POSNAME, P.WIDTH, P.HEIGHT
            FROM T_AD_CAMPAIGN A
            LEFT JOIN T_AD_POSITION P ON P.POSITIONID = C.POSITIONID
            WHERE C.CAMPAIGNID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kampanye tidak ditemukan.']);
        }

        $arr = (array) $row;
        $arr['PERIODSTATUS'] = self::periodStatus($row->STARTDATE, $row->ENDDATE);
        $arr['DAILY'] = DB::select("
            SELECT STATDATE, IMPRESSIONS, CLICKS FROM T_AD_STAT_DAILY
            WHERE CAMPAIGNID = ? ORDER BY STATDATE DESC
            OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY
        ", [$id]);
        $t = DB::selectOne("
            SELECT ISNULL(SUM(IMPRESSIONS), 0) AS I, ISNULL(SUM(CLICKS), 0) AS K
            FROM T_AD_STAT_DAILY WHERE CAMPAIGNID = ?
        ", [$id]);
        $arr['TOTALIMP'] = $t ? (int) $t->I : 0;
        $arr['TOTALCLICK'] = $t ? (int) $t->K : 0;

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Kode berikutnya: AD-XXXX dari akhiran numerik terbesar.
    private static function nextCode(): string
    {
        $row = DB::selectOne("
            SELECT MAX(CAST(SUBSTRING(CAMPAIGNCODE, 4, 10) AS INT)) AS M
            FROM T_AD_CAMPAIGN WHERE CAMPAIGNCODE LIKE 'AD-%'
        ");
        $n = $row && $row->M !== null ? ((int) $row->M) + 1 : 1;
        return 'AD-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    // Validasi form kampanye. Return [bersih, pesanError|null].
    private static function validate($vdata): array
    {
        $title = trim((string) ($vdata['TITLE'] ?? ''));
        $adv = trim((string) ($vdata['ADVERTISER'] ?? ''));
        $contact = mb_substr(trim((string) ($vdata['CONTACT'] ?? '')), 0, 100);
        $linktype = strtoupper(trim((string) ($vdata['LINKTYPE'] ?? 'EVENT')));
        $eventid = trim((string) ($vdata['EVENTID'] ?? ''));
        $linkurl = trim((string) ($vdata['LINKURL'] ?? ''));
        $posid = trim((string) ($vdata['POSITIONID'] ?? ''));
        $start = trim((string) ($vdata['STARTDATE'] ?? ''));
        $end = trim((string) ($vdata['ENDDATE'] ?? ''));

        if ($title === '') {
            return [[], 'Judul wajib diisi.'];
        }
        if (mb_strlen($title) > 150) {
            return [[], 'Judul maksimal 150 karakter.'];
        }
        if ($adv === '') {
            return [[], 'Pengiklan wajib diisi.'];
        }
        if (mb_strlen($adv) > 100) {
            return [[], 'Pengiklan maksimal 100 karakter.'];
        }
        if ($linktype !== 'EVENT' && $linktype !== 'URL') {
            return [[], 'Tujuan harus EVENT atau URL.'];
        }
        if ($linktype === 'EVENT') {
            if ($eventid === '' || !ctype_digit($eventid)) {
                return [[], 'Event tujuan wajib dipilih.'];
            }
            $hit = DB::selectOne("SELECT EVENTID FROM T_EVENT WHERE EVENTID = ?", [(int) $eventid]);
            if (!$hit) {
                return [[], 'Event tujuan tidak ditemukan.'];
            }
            $linkurl = '';
        } else {
            if ($linkurl === '' || mb_strlen($linkurl) > 500) {
                return [[], 'URL tujuan wajib diisi (maks 500 karakter).'];
            }
            if (!preg_match('#^https?://#i', $linkurl)) {
                return [[], 'URL tujuan harus diawali http:// atau https://.'];
            }
        }
        if ($posid === '' || !ctype_digit($posid)) {
            return [[], 'Posisi wajib dipilih.'];
        }
        $pos = DB::selectOne("SELECT POSITIONID, RATEPERDAY, ISACTIVE FROM T_AD_POSITION WHERE POSITIONID = ?", [(int) $posid]);
        if (!$pos) {
            return [[], 'Posisi tidak ditemukan.'];
        }
        if (strtoupper(trim((string) $pos->ISACTIVE)) !== 'YES') {
            return [[], 'Posisi sedang nonaktif.'];
        }
        $sTs = strtotime($start);
        $eTs = strtotime($end);
        if ($start === '' || $sTs === false || $end === '' || $eTs === false) {
            return [[], 'Periode mulai dan selesai wajib diisi dengan benar.'];
        }
        $s = date('Y-m-d', $sTs);
        $e = date('Y-m-d', $eTs);
        if ($e < $s) {
            return [[], 'Tanggal selesai harus setelah tanggal mulai.'];
        }

        $days = (int) floor(($eTs - $sTs) / 86400) + 1;
        return [[
            'TITLE' => $title, 'ADVERTISER' => $adv, 'CONTACT' => $contact,
            'LINKTYPE' => $linktype, 'EVENTID' => $linktype === 'EVENT' ? (int) $eventid : null,
            'LINKURL' => $linktype === 'URL' ? $linkurl : null,
            'POSITIONID' => (int) $posid, 'RATEPERDAY' => (float) $pos->RATEPERDAY,
            'STARTDATE' => $s, 'ENDDATE' => $e, 'DAYCOUNT' => $days,
            'TOTALCOST' => round((float) $pos->RATEPERDAY * $days, 2),
        ], null];
    }

    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        [$c, $err] = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $code = self::nextCode();
        DB::insert("
            INSERT INTO T_AD_CAMPAIGN
                (CAMPAIGNCODE, TITLE, ADVERTISER, CONTACT, LINKTYPE, EVENTID, LINKURL,
                 POSITIONID, STARTDATE, ENDDATE, RATEPERDAY, DAYCOUNT, TOTALCOST,
                 STATUS, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 'DRAFT', ?, GETDATE())
        ", [
            $code, $c['TITLE'], $c['ADVERTISER'], $c['CONTACT'] !== '' ? $c['CONTACT'] : null,
            $c['LINKTYPE'], $c['EVENTID'], $c['LINKURL'],
            $c['POSITIONID'], $c['STARTDATE'], $c['ENDDATE'],
            $c['RATEPERDAY'], $c['DAYCOUNT'], $c['TOTALCOST'],
            $param['VUSERLOGIN'] ?? '',
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mcampaign', 'page' => 'Ad Campaign',
            'table' => 'T_AD_CAMPAIGN', 'dataId' => $code,
            'summary' => 'IKLAN ' . $code,
            'before' => [],
            'after' => ['TITLE' => $c['TITLE'], 'STATUS' => 'DRAFT', 'TOTALCOST' => $c['TOTALCOST']],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Kampanye ' . $code . ' berhasil dibuat.',
            'Rows' => [['CAMPAIGNID' => $id, 'CAMPAIGNCODE' => $code]],
        ]);
    }

    // Ubah: sebelum AKTIF boleh penuh; setelah AKTIF hanya identitas+tujuan+
    // banner; DIBATALKAN read-only; tanggal tidak boleh diubah setelah AKTIF.
    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['CAMPAIGNID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }
        $before = DB::selectOne("SELECT * FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data kampanye tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $before->STATUS));
        if ($st === 'DIBATALKAN') {
            return json_encode(['success' => 'false', 'message' => 'Kampanye yang dibatalkan tidak bisa diubah.']);
        }

        if ($st === 'AKTIF' || $st === 'DIJEDA') {
            // Terbatas: judul/pengiklan/kontak/tujuan. Tanggal & posisi kunci.
            $title = trim((string) ($vdata['TITLE'] ?? ''));
            $adv = trim((string) ($vdata['ADVERTISER'] ?? ''));
            $linktype = strtoupper(trim((string) ($vdata['LINKTYPE'] ?? 'EVENT')));
            if ($title === '' || $adv === '') {
                return json_encode(['success' => 'false', 'message' => 'Judul dan pengiklan wajib diisi.']);
            }
            if ($linktype !== 'EVENT' && $linktype !== 'URL') {
                return json_encode(['success' => 'false', 'message' => 'Tujuan harus EVENT atau URL.']);
            }
            $eventid = null;
            $linkurl = null;
            if ($linktype === 'EVENT') {
                $eid = trim((string) ($vdata['EVENTID'] ?? ''));
                if ($eid === '' || !ctype_digit($eid)) {
                    return json_encode(['success' => 'false', 'message' => 'Event tujuan wajib dipilih.']);
                }
                if (!DB::selectOne("SELECT EVENTID FROM T_EVENT WHERE EVENTID = ?", [(int) $eid])) {
                    return json_encode(['success' => 'false', 'message' => 'Event tujuan tidak ditemukan.']);
                }
                $eventid = (int) $eid;
            } else {
                $linkurl = trim((string) ($vdata['LINKURL'] ?? ''));
                if ($linkurl === '' || !preg_match('#^https?://#i', $linkurl)) {
                    return json_encode(['success' => 'false', 'message' => 'URL tujuan harus diawali http:// atau https://.']);
                }
            }
            DB::update("
                UPDATE T_AD_CAMPAIGN
                SET TITLE = ?, ADVERTISER = ?, CONTACT = ?,
                    LINKTYPE = ?, EVENTID = ?, LINKURL = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE CAMPAIGNID = ?
            ", [
                mb_substr($title, 0, 150), mb_substr($adv, 0, 100),
                mb_substr(trim((string) ($vdata['CONTACT'] ?? '')), 0, 100) ?: null,
                $linktype, $eventid, $linkurl ? mb_substr($linkurl, 0, 500) : null,
                $param['VUSERLOGIN'] ?? '', $id,
            ]);
        } else {
            [$c, $err] = self::validate($vdata);
            if ($err !== null) {
                return json_encode(['success' => 'false', 'message' => $err]);
            }
            DB::update("
                UPDATE T_AD_CAMPAIGN
                SET TITLE = ?, ADVERTISER = ?, CONTACT = ?,
                    LINKTYPE = ?, EVENTID = ?, LINKURL = ?,
                    POSITIONID = ?, STARTDATE = ?, ENDDATE = ?,
                    RATEPERDAY = ?, DAYCOUNT = ?, TOTALCOST = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE CAMPAIGNID = ?
            ", [
                $c['TITLE'], $c['ADVERTISER'], $c['CONTACT'] !== '' ? $c['CONTACT'] : null,
                $c['LINKTYPE'], $c['EVENTID'], $c['LINKURL'],
                $c['POSITIONID'], $c['STARTDATE'], $c['ENDDATE'],
                $c['RATEPERDAY'], $c['DAYCOUNT'], $c['TOTALCOST'],
                $param['VUSERLOGIN'] ?? '', $id,
            ]);
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mcampaign', 'page' => 'Ad Campaign',
            'table' => 'T_AD_CAMPAIGN', 'dataId' => (string) ($before->CAMPAIGNCODE ?? $id),
            'summary' => 'IKLAN ' . (string) ($before->CAMPAIGNCODE ?? $id),
            'before' => (array) $before,
            'after' => ['TITLE' => trim((string) ($vdata['TITLE'] ?? ''))],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Kampanye berhasil diupdate.']);
    }

    // Transisi status: AJUKAN/SIMpan? peta: DRAFT->MENUNGGU_BAYAR,
    // AKTIF<->DIJEDA, *->DIBATALKAN(alasan). Aktivasi hanya via record_payment.
    public static function change_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['CAMPAIGNID'] ?? null;
        $action = strtoupper(trim((string) ($vdata['ACTION'] ?? '')));
        $reason = mb_substr(trim((string) ($vdata['CANCELREASON'] ?? '')), 0, 200);

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT * FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kampanye tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $row->STATUS));

        $to = null;
        if ($action === 'AJUKAN' && $st === 'DRAFT') {
            if (empty($row->TITLE) || empty($row->ADVERTISER) || empty($row->POSITIONID)
                || empty($row->STARTDATE) || empty($row->ENDDATE)) {
                return json_encode(['success' => 'false', 'message' => 'Lengkapi judul, pengiklan, posisi, dan periode dulu.']);
            }
            $to = 'MENUNGGU_BAYAR';
        } elseif ($action === 'JEDA' && $st === 'AKTIF') {
            $to = 'DIJEDA';
        } elseif ($action === 'LANJUT' && $st === 'DIJEDA') {
            // Kapasitas bisa terisi saat jeda -> cek ulang.
            $cap = self::positionCapacity((int) $row->POSITIONID);
            $occ = self::occupants((int) $row->POSITIONID, substr((string) $row->STARTDATE, 0, 10), substr((string) $row->ENDDATE, 0, 10), (int) $id);
            if ($occ >= $cap) {
                return json_encode(['success' => 'false', 'message' => 'Slot posisi penuh (' . $occ . '/' . $cap . '), tidak bisa dilanjutkan.']);
            }
            $to = 'AKTIF';
        } elseif ($action === 'BATAL' && $st !== 'DIBATALKAN') {
            if ($reason === '') {
                return json_encode(['success' => 'false', 'message' => 'Alasan pembatalan wajib diisi.']);
            }
            $to = 'DIBATALKAN';
        } else {
            return json_encode(['success' => 'false', 'message' => 'Aksi "' . $action . '" tidak berlaku untuk status ' . $st . '.']);
        }

        DB::update("
            UPDATE T_AD_CAMPAIGN
            SET STATUS = ?, CANCELREASON = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CAMPAIGNID = ?
        ", [$to, $to === 'DIBATALKAN' ? $reason : null, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mcampaign', 'page' => 'Ad Campaign',
            'table' => 'T_AD_CAMPAIGN', 'dataId' => (string) ($row->CAMPAIGNCODE ?? $id),
            'summary' => 'IKLAN ' . (string) ($row->CAMPAIGNCODE ?? $id) . ' ' . $st . ' -> ' . $to,
            'before' => ['STATUS' => $st],
            'after' => ['STATUS' => $to, 'CANCELREASON' => $to === 'DIBATALKAN' ? $reason : null],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Status kampanye menjadi ' . $to . '.']);
    }

    private static function positionCapacity(int $positionId): int
    {
        $p = DB::selectOne("SELECT CAPACITY FROM T_AD_POSITION WHERE POSITIONID = ?", [$positionId]);
        return $p ? max(1, (int) $p->CAPACITY) : 1;
    }

    // Aktivasi berbayar untuk layanan pembayaran (pakai ulang cek banner +
    // kapasitas). Dipanggil dalam transaksi pemanggil (tanpa audit/transaksi
    // sendiri). Return pesan error atau null bila lolos.
    public static function activatePaid(int $id, string $actor): ?string
    {
        $row = DB::selectOne("
            SELECT * FROM T_AD_CAMPAIGN WITH (UPDLOCK, ROWLOCK)
            WHERE CAMPAIGNID = ?
        ", [$id]);
        if (!$row) {
            return 'Data kampanye tidak ditemukan.';
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'MENUNGGU_BAYAR') {
            return 'Hanya kampanye MENUNGGU_BAYAR yang bisa dibayar.';
        }
        if (empty($row->BANNERIMAGE)) {
            return 'Upload banner dulu sebelum pembayaran dicatat.';
        }
        $cap = self::positionCapacity((int) $row->POSITIONID);
        $occ = self::occupants((int) $row->POSITIONID, substr((string) $row->STARTDATE, 0, 10), substr((string) $row->ENDDATE, 0, 10), $id);
        if ($occ >= $cap) {
            return 'Slot posisi penuh (' . $occ . '/' . $cap . '), pembayaran tidak bisa dicatat.';
        }

        DB::update("
            UPDATE T_AD_CAMPAIGN
            SET STATUS = 'AKTIF', PAIDAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CAMPAIGNID = ?
        ", [$actor, $id]);

        return null;
    }

    // Catat bayar: via layanan pembayaran pusat (invoice ikut terbit).
    // Butuh metode; form Catat Pembayaran (FRMpayrecord) mengirimkannya.
    // Aktivasi (banner + kapasitas) tetap lewat activatePaid di dalam service.
    public static function record_payment($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['CAMPAIGNID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }
        $methodRaw = trim((string) ($vdata['PAYMETHODID'] ?? ''));
        if ($methodRaw === '') {
            return json_encode(['success' => 'false', 'message' => 'Catat pembayaran lewat form Catat Pembayaran (metode wajib).']);
        }

        $row = DB::selectOne("SELECT CAMPAIGNCODE FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kampanye tidak ditemukan.']);
        }

        $r = PaymentService::record([
            'REFTYPE' => 'IKLAN', 'REFID' => (int) $id,
            'PAYMETHODID' => $methodRaw,
            'PAIDAT' => trim((string) ($vdata['PAIDAT'] ?? '')),
            'EXTREF' => trim((string) ($vdata['EXTREF'] ?? '')),
            'SOURCE' => 'MANUAL', 'ACTOR' => $param['VUSERLOGIN'] ?? '',
        ]);
        if (!$r['ok']) {
            return json_encode(['success' => 'false', 'message' => $r['message']]);
        }

        AuditTrail::log([
            'action' => 'PAYMENT', 'mcontrol' => 'mcampaign', 'page' => 'Ad Campaign',
            'table' => 'T_AD_CAMPAIGN', 'dataId' => (string) ($row->CAMPAIGNCODE ?? $id),
            'summary' => 'IKLAN ' . (string) ($row->CAMPAIGNCODE ?? $id) . ' bayar (' . (string) ($r['payment']['PAYNO'] ?? '') . ')',
            'before' => ['STATUS' => 'MENUNGGU_BAYAR'],
            'after' => ['STATUS' => 'AKTIF'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Pembayaran dicatat, kampanye AKTIF.']);
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen). Sama seperti Mmnewsdata.
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload banner: JPG/PNG/WEBP, maks 2MB, ke public/uploads/ads/.
    // Dipanggil via multipart (field 'BANNER' + CAMPAIGNID), bukan JSON.
    // Peringatan bila di bawah 1200x300. Banner lama dihapus.
    public static function upload_banner($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $id = null;
        if (isset($param['vdata'])) {
            $vd = is_string($param['vdata']) ? json_decode($param['vdata'], true) : $param['vdata'];
            $id = is_array($vd) ? ($vd['CAMPAIGNID'] ?? null) : null;
        }
        $id = $id ?? ($param['CAMPAIGNID'] ?? null);

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }
        $row = DB::selectOne("SELECT CAMPAIGNID, CAMPAIGNCODE, STATUS, BANNERIMAGE FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data kampanye tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) === 'DIBATALKAN') {
            return json_encode(['success' => 'false', 'message' => 'Kampanye yang dibatalkan tidak bisa diganti bannernya.']);
        }

        // C_home mengirim $request->all(): file berupa UploadedFile.
        $file = $param['BANNER'] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File banner wajib dipilih.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if ($ext === 'jpeg') {
            $ext = 'jpg';
        }
        if (!in_array($ext, ['jpg', 'png', 'webp'], true)) {
            return json_encode(['success' => 'false', 'message' => 'Banner harus JPG, PNG, atau WEBP.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file bukan gambar yang valid.']);
        }
        if ($file->getSize() > self::BANNER_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran banner maksimal 2MB.']);
        }
        $warn = '';
        $dim = @getimagesize($file->getPathname());
        if (is_array($dim) && ($dim[0] < 1200 || $dim[1] < 300)) {
            $warn = ' Perhatian: ukuran gambar ' . $dim[0] . 'x' . $dim[1] . ' di bawah rekomendasi 1200x300.';
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . self::BANNER_DIR;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        // Nama aman: ad-<id>-<waktu>.<ext>.
        $name = 'ad-' . (int) $id . '-' . date('YmdHis') . '.' . $ext;
        try {
            $file->move($dir, $name);
        } catch (\Throwable $e) {
            return json_encode(['success' => 'false', 'message' => 'Gagal menyimpan banner.']);
        }
        $old = trim((string) ($row->BANNERIMAGE ?? ''));
        if ($old !== '' && $old !== $name && strpos($old, '..') === false
            && file_exists($dir . DIRECTORY_SEPARATOR . basename($old))) {
            @unlink($dir . DIRECTORY_SEPARATOR . basename($old));
        }

        DB::update("
            UPDATE T_AD_CAMPAIGN
            SET BANNERIMAGE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE CAMPAIGNID = ?
        ", [$name, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'UPLOAD', 'mcontrol' => 'mcampaign', 'page' => 'Ad Campaign',
            'table' => 'T_AD_CAMPAIGN', 'dataId' => (string) ($row->CAMPAIGNCODE ?? $id),
            'summary' => 'IKLAN ' . (string) ($row->CAMPAIGNCODE ?? $id) . ' banner',
            'before' => ['BANNERIMAGE' => $old],
            'after' => ['BANNERIMAGE' => $name],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Banner berhasil diupload.' . $warn,
            'Rows' => [['BANNERIMAGE' => $name]],
        ]);
    }

    // Tayang (publik, tanpa cek akses): agregat ringan per halaman render.
    public static function record_view($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = (int) ($vdata['CAMPAIGNID'] ?? 0);

        if ($id <= 0) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }
        AdServe::recordView($id);
        return json_encode(['success' => 'true', 'message' => 'OK']);
    }

    // Klik (publik, tanpa cek akses): tayang+klik naik bersama.
    public static function record_click($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = (int) ($vdata['CAMPAIGNID'] ?? 0);

        if ($id <= 0) {
            return json_encode(['success' => 'false', 'message' => 'CAMPAIGNID tidak ditemukan.']);
        }
        AdServe::recordClick($id);
        return json_encode(['success' => 'true', 'message' => 'OK']);
    }
}
