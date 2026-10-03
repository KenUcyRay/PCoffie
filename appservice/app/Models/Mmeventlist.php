<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Event List (Discovery): katalog event & tiket, hanya baca.
// Tabel: T_EVENT + T_TICKET_TYPE + T_ATTENDEE + T_PROMO(+scope) (membaca, tanpa
// mengubah). SEGMENT: home/meventlist/meventlist. Menu CPMENU MCONTROL = meventlist.
//
// Default: event PUBLISHED yang belum berakhir. Terjual dihitung dari peserta
// aktif+lunas (rumus sama dengan Event Data/Ticket Type/Sales Report).
// Tidak ada endpoint tambah/ubah/hapus.
class Mmeventlist extends Model
{
    use ColumnFilter;

    const MCODE = 20010002;

    private static function sortMap(): array
    {
        return [
            'STARTAT' => 'A.STARTAT',
            'TITLE' => 'A.TITLE',
            'MINPRICE' => 'MINPRICE',
        ];
    }

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

    // Rumus terjual/kuota yang sama persis dengan halaman pengelolaan.
    private static function salesJoin(): string
    {
        return " LEFT JOIN (
            SELECT EVENTID, SUM(QUOTA) AS QUOTA, MIN(PRICE) AS MINPRICE, MAX(PRICE) AS MAXPRICE
            FROM T_TICKET_TYPE WHERE ISACTIVE = 'YES' GROUP BY EVENTID
        ) Q ON Q.EVENTID = A.EVENTID
        LEFT JOIN (
            SELECT EVENTID, COUNT(*) AS SOLD
            FROM T_ATTENDEE
            WHERE TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
            GROUP BY EVENTID
        ) S ON S.EVENTID = A.EVENTID";
    }

    // Turunkan penanda hampir habis / sold out / tersedia per event (rumus sama).
    private static function eventFlag(int $sold, int $quota): ?string
    {
        if ($quota <= 0) {
            return null;
        }
        if ($sold >= $quota) {
            return 'SOLD_OUT';
        }
        if ($sold >= (int) floor($quota * 0.9)) {
            return 'HAMPIR_HABIS';
        }
        return 'TERSEDIA';
    }

    // Status penjualan per tipe tiket (turunan, tanpa field baru).
    private static function typeStatus($row, int $sold): string
    {
        if (strtoupper(trim((string) ($row->ISACTIVE ?? 'YES'))) !== 'YES') {
            return 'TIDAK_AKTIF';
        }
        $now = time();
        if (!empty($row->SALESTART) && $now < strtotime((string) $row->SALESTART)) {
            return 'BELUM_DIBUKA';
        }
        if (!empty($row->SALEEND) && $now > strtotime((string) $row->SALEEND)) {
            return 'DITUTUP';
        }
        $quota = (int) ($row->QUOTA ?? 0);
        if ($quota <= 0 || $sold >= $quota) {
            return 'SOLD_OUT';
        }
        if ($sold >= (int) floor($quota * 0.9)) {
            return 'HAMPIR_HABIS';
        }
        return 'TERSEDIA';
    }

    // Daftar kategori/kota/rentang harga untuk filter (opsi publik).
    public static function read_config($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $cats = DB::select("
            SELECT C.CATCODE, C.CATNAME FROM T_CATEGORY C
            WHERE C.CATACTIVE = 'YES' ORDER BY C.CATSORT, C.CATCODE
        ");
        $cities = DB::select("
            SELECT C.CITYCODE, C.CITYNAME, C.CITYPROV, C.CITYTZ FROM T_CITY C
            WHERE C.CITYACTIVE = 'YES' ORDER BY C.CITYNAME, C.CITYCODE
        ");
        $prices = DB::selectOne("
            SELECT MIN(P.PRICE) AS MINP, MAX(P.PRICE) AS MAXP
            FROM T_TICKET_TYPE P
            JOIN T_EVENT E ON E.EVENTID = P.EVENTID
            WHERE P.ISACTIVE = 'YES' AND E.STATUS = 'PUBLISHED'
              AND (E.ENDAT IS NULL OR E.ENDAT >= GETDATE())
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'CATEGORIES' => $cats,
            'CITIES' => $cities,
            'MINPRICE' => $prices ? (string) $prices->MINP : '0',
            'MAXPRICE' => $prices ? (string) $prices->MAXP : '0',
        ]]]);
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0;
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? 'PUBLISHED')));
        $cat    = trim((string) ($param['cat'] ?? ''));       // kode, pisah koma
        $city   = strtoupper(trim((string) ($param['city'] ?? '')));
        $from   = trim((string) ($param['datefrom'] ?? ''));
        $to     = trim((string) ($param['dateto'] ?? ''));
        $pmin   = trim((string) ($param['price_min'] ?? ''));
        $pmax   = trim((string) ($param['price_max'] ?? ''));
        $sales  = strtoupper(trim((string) ($param['sales'] ?? '')));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];

        // Default publik; operator boleh memilih status lain (berlabel).
        if ($status === '' || $status === 'PUBLISHED') {
            $where = " WHERE A.STATUS = 'PUBLISHED' AND (A.ENDAT IS NULL OR A.ENDAT >= GETDATE())";
        } elseif (in_array($status, ['DRAFT', 'ENDED', 'CANCELLED'], true)) {
            $where = ' WHERE A.STATUS = ?';
            $args[] = $status;
        } else {
            return json_encode(['success' => 'false', 'message' => 'Status tidak valid.']);
        }

        if ($cat !== '') {
            $codes = array_values(array_filter(array_map('trim', explode(',', $cat)), fn($c) => $c !== ''));
            if (!empty($codes)) {
                $in = implode(',', array_fill(0, count($codes), '?'));
                $where .= " AND A.CATCODE IN ($in)";
                foreach ($codes as $c) {
                    $args[] = strtoupper($c);
                }
            }
        }
        if ($city !== '') {
            $where .= ' AND UPPER(A.CITYCODE) = ?';
            $args[] = $city;
        }
        if ($from !== '' && strtotime($from) !== false) {
            $where .= ' AND A.STARTAT >= ?';
            $args[] = date('Y-m-d 00:00:00', strtotime($from));
        }
        if ($to !== '' && strtotime($to) !== false) {
            $where .= ' AND A.STARTAT <= ?';
            $args[] = date('Y-m-d 23:59:59', strtotime($to));
        }
        if ($pmin !== '' && is_numeric($pmin)) {
            $where .= ' AND ISNULL(Q.MINPRICE, 0) >= ?';
            $args[] = (float) $pmin;
        }
        if ($pmax !== '' && is_numeric($pmax)) {
            $where .= ' AND ISNULL(Q.MINPRICE, 0) <= ?';
            $args[] = (float) $pmax;
        }
        if ($q !== '') {
            $where .= ' AND (A.TITLE LIKE ? OR A.VENUE LIKE ? OR A.ORGNAME LIKE ?)';
            $like = '%' . $q . '%';
            array_push($args, $like, $like, $like);
        }
        if (in_array($sales, ['TERSEDIA', 'HAMPIR_HABIS', 'SOLD_OUT'], true)) {
            // Difilter di SQL (bukan setelah pagination) supaya TotalRows dan
            // isi halaman tetap benar. Rumus sama dengan eventFlag() di bawah.
            $q = 'ISNULL(Q.QUOTA, 0)';
            $s = 'ISNULL(S.SOLD, 0)';
            if ($sales === 'SOLD_OUT') {
                $where .= " AND $q > 0 AND $s >= $q";
            } elseif ($sales === 'HAMPIR_HABIS') {
                $where .= " AND $q > 0 AND $s < $q AND $s >= FLOOR($q * 0.9)";
            } else { // TERSEDIA
                $where .= " AND $q > 0 AND $s < FLOOR($q * 0.9)";
            }
        }

        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow = DB::selectOne(
            "SELECT COUNT(*) AS TOTAL FROM T_EVENT A" . self::salesJoin() . $where,
            $args
        );
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sort (whitelist; terdekat/terpopuler/termurah/termahal).
        $sort = strtolower(trim((string) ($param['sort'] ?? 'terdekat')));
        $dir = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        switch ($sort) {
            case 'terpopuler':
                $order = 'ISNULL(S.SOLD, 0) DESC, A.STARTAT ASC';
                break;
            case 'termurah':
                $order = 'ISNULL(Q.MINPRICE, 0) ASC, A.STARTAT ASC';
                break;
            case 'termahal':
                $order = 'ISNULL(Q.MINPRICE, 0) DESC, A.STARTAT ASC';
                break;
            case 'terdekat':
            default:
                $order = 'A.STARTAT ASC';
                $sort = 'terdekat';
        }

        $sql = "
            SELECT A.EVENTID, A.EVENTCODE, A.SLUG, A.TITLE, A.CATCODE, C.CATNAME,
                   A.CITYCODE, CI.CITYNAME, CI.CITYPROV, A.VENUE, A.ADDRESS,
                   A.STARTAT, A.ENDAT, A.POSTER, A.ORGNAME, A.STATUS,
                   ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD,
                   ISNULL(Q.MINPRICE, 0) AS MINPRICE, ISNULL(Q.MAXPRICE, 0) AS MAXPRICE
            FROM T_EVENT A
            LEFT JOIN T_CATEGORY C ON C.CATCODE = A.CATCODE
            LEFT JOIN T_CITY CI ON CI.CITYCODE = A.CITYCODE
            " . self::salesJoin() . "
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $rows = [];
        foreach (DB::select($sql, $args) as $r) {
            $sold = (int) ($r->SOLD ?? 0);
            $quota = (int) ($r->QUOTA ?? 0);
            $flag = self::eventFlag($sold, $quota);
            $arr = (array) $r;
            $arr['SOLD'] = $sold;
            $arr['QUOTA'] = $quota;
            $arr['REMAIN'] = max(0, $quota - $sold);
            $arr['FLAG'] = $flag;
            $arr['MINPRICE'] = (string) $r->MINPRICE;
            $arr['MAXPRICE'] = (string) $r->MAXPRICE;
            $rows[] = $arr;
        }

        return json_encode(['success' => true, 'Rows' => $rows, 'TotalRows' => $totalRows]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? ($param['eventid'] ?? null);
        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $row = DB::selectOne(
            "SELECT A.*, C.CATNAME, CI.CITYNAME, CI.CITYPROV, CI.CITYTZ,
                    ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD,
                    ISNULL(Q.MINPRICE, 0) AS MINPRICE, ISNULL(Q.MAXPRICE, 0) AS MAXPRICE
             FROM T_EVENT A
             LEFT JOIN T_CATEGORY C ON C.CATCODE = A.CATCODE
             LEFT JOIN T_CITY CI ON CI.CITYCODE = A.CITYCODE
             " . self::salesJoin() . "
             WHERE A.EVENTID = ?",
            [(int) $id]
        );
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Event tidak ditemukan.']);
        }

        $sold = (int) ($row->SOLD ?? 0);
        $quota = (int) ($row->QUOTA ?? 0);
        $arr = (array) $row;
        $arr['SOLD'] = $sold;
        $arr['QUOTA'] = $quota;
        $arr['REMAIN'] = max(0, $quota - $sold);
        $arr['FLAG'] = self::eventFlag($sold, $quota);
        $arr['MINPRICE'] = (string) $row->MINPRICE;
        $arr['MAXPRICE'] = (string) $row->MAXPRICE;

        // Tipe tiket beserta status turunan.
        $types = [];
        foreach (DB::select("
            SELECT A.TICKETTYPEID, A.NAME, A.DESCR, A.PRICE, A.QUOTA, A.MAXPERSON,
                   A.SALESTART, A.SALEEND, A.SORTORDER, A.ISACTIVE,
                   (SELECT COUNT(*) FROM T_ATTENDEE S
                     WHERE S.TICKETTYPEID = A.TICKETTYPEID
                       AND S.TIKETSTATUS = 'AKTIF' AND S.PAYSTATUS = 'LUNAS') AS SOLD
            FROM T_TICKET_TYPE A WHERE A.EVENTID = ? ORDER BY A.SORTORDER, A.TICKETTYPEID
        ", [(int) $id]) as $t) {
            $s = (int) ($t->SOLD ?? 0);
            $arr2 = (array) $t;
            $arr2['SOLD'] = $s;
            $arr2['REMAIN'] = max(0, (int) $t->QUOTA - $s);
            $arr2['STATUS'] = self::typeStatus($t, $s);
            $types[] = $arr2;
        }
        $arr['TYPES'] = $types;

        // Promo yang berlaku untuk event ini (cakupan SEMUA/KATEGORI/EVENT + BERLAKU).
        $arr['PROMOS'] = self::activePromosFor((int) $id, (string) $row->CATCODE, (string) $row->EVENTCODE);

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Promo berstatus BERLAKU yang mencakup event (rumus cakupan sama dengan PromoEngine::check).
    private static function activePromosFor(int $eventid, string $catcode, string $eventcode): array
    {
        $rows = DB::select("
            SELECT A.*, (
                SELECT COUNT(*) FROM T_PROMO_USAGE U
                WHERE U.PROMOID = A.PROMOID AND U.STATUS = 'DIPAKAI'
            ) AS USED
            FROM T_PROMO A
            WHERE A.ISACTIVE = 'YES'
            ORDER BY A.ENDAT ASC, A.PROMOID
        ");
        $out = [];
        foreach ($rows as $p) {
            $used = (int) ($p->USED ?? 0);
            if (Mmpromocode::displayStatus($p, $used) !== 'BERLAKU') {
                continue;
            }
            $scope = strtoupper(trim((string) $p->SCOPETYPE));
            $match = $scope === 'SEMUA';
            if (!$match && $scope === 'KATEGORI') {
                $m = DB::selectOne("
                    SELECT 1 AS X FROM T_PROMO_SCOPE S
                    WHERE S.PROMOID = ? AND S.TARGETTYPE = 'KATEGORI' AND UPPER(S.TARGETCODE) = UPPER(?)
                ", [(int) $p->PROMOID, $catcode]);
                $match = $m !== null;
            } elseif (!$match && $scope === 'EVENT') {
                $m = DB::selectOne("
                    SELECT 1 AS X FROM T_PROMO_SCOPE S
                    WHERE S.PROMOID = ? AND S.TARGETTYPE = 'EVENT' AND UPPER(S.TARGETCODE) = UPPER(?)
                ", [(int) $p->PROMOID, $eventcode]);
                $match = $m !== null;
            }
            if ($match) {
                $out[] = [
                    'PROMOID' => (int) $p->PROMOID,
                    'PROMOCODE' => (string) $p->PROMOCODE,
                    'DESCR' => (string) $p->DESCR,
                    'DISCTYPE' => (string) $p->DISCTYPE,
                    'DISCVALUE' => (string) $p->DISCVALUE,
                    'MAXDISC' => $p->MAXDISC,
                    'MINPURCHASE' => (string) $p->MINPURCHASE,
                    'STARTAT' => $p->STARTAT,
                    'ENDAT' => $p->ENDAT,
                    'USED' => $used,
                    'QUOTA' => $p->QUOTA,
                    'REMAIN' => $p->QUOTA === null ? null : max(0, (int) $p->QUOTA - $used),
                ];
            }
        }
        return $out;
    }
}
