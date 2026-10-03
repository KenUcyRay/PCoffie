<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// News List (Discovery): baca berita terbit seperti tampilan pembaca.
// Hanya baca. SEGMENT: home/mnewslist/mnewslist. Menu MCONTROL = mnewslist.
//
// Default: berita TERBIT via NewsPublic::published; detail via
// NewsPublic::bySlug. JANGAN memanggil hitView / catat jumlah dibaca.
class Mmnewslist extends Model
{
    use ColumnFilter;

    const MCODE = 20020002;

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

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0;
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? 'TERBIT')));
        $cat    = strtoupper(trim((string) ($param['cat'] ?? '')));
        $ecat   = strtoupper(trim((string) ($param['eventcat'] ?? '')));
        $sort   = strtolower(trim((string) ($param['sort'] ?? 'terbaru')));

        // CATATAN: TIDAK memanggil Mmnewsdata::applyPublishLazy() di sini.
        // Halaman Discovery hanya baca; perubahan status TERJADWAL -> TERBIT
        // milik sisi pembaca (NewsPublic) atau News Data, bukan katalog.

        $where = '';
        $args = [];
        if (in_array($status, ['DRAFT', 'TERJADWAL', 'TERBIT', 'DIARSIPKAN'], true)) {
            $where = ' WHERE A.STATUS = ?';
            $args[] = $status;
        } else {
            return json_encode(['success' => 'false', 'message' => 'Status tidak valid.']);
        }
        if ($cat !== '') {
            $where .= ' AND UPPER(COALESCE(A.NEWSCATCODE,\'\')) = ?';
            $args[] = $cat;
        }
        if ($ecat !== '') {
            $where .= ' AND UPPER(COALESCE(A.EVENTCATCODE,\'\')) = ?';
            $args[] = $ecat;
        }
        if ($q !== '') {
            $where .= ' AND (A.TITLE LIKE ? OR A.SUMMARY LIKE ?)';
            $like = '%' . $q . '%';
            array_push($args, $like, $like);
        }

        $totalRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_NEWS A LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE" . $where, $args);
        $totalRows = $totalRow ? (int) $totalRow->TOTAL : 0;

        switch ($sort) {
            case 'terpopuler':
                $order = 'A.VIEWCOUNT DESC, A.PUBLISHEDAT DESC';
                break;
            case 'terbaru':
            default:
                $order = 'A.PUBLISHEDAT DESC, A.NEWSID DESC';
                $sort = 'terbaru';
        }

        $sql = "
            SELECT A.NEWSID, A.TITLE, A.SLUG, A.SUMMARY, A.MAINIMAGE,
                   A.NEWSCATCODE, C.CATNAME, A.EVENTCATCODE, A.EVENTID,
                   A.STATUS, A.PUBLISHEDAT, A.VIEWCOUNT, A.AUTHORLOGIN
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $rows = DB::select($sql, $args);
        $out = [];
        foreach ($rows as $r) {
            $out[] = (array) $r;
        }

        return json_encode(['success' => true, 'Rows' => $out, 'TotalRows' => $totalRows]);
    }

    public static function read_facets($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $newsCats = DB::select("
            SELECT DISTINCT A.NEWSCATCODE, C.CATNAME
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            WHERE A.NEWSCATCODE IS NOT NULL AND A.NEWSCATCODE <> ''
            ORDER BY C.CATNAME
        ");
        $eventCats = DB::select("
            SELECT DISTINCT EVENTCATCODE AS CODE FROM T_NEWS
            WHERE EVENTCATCODE IS NOT NULL AND EVENTCATCODE <> ''
            ORDER BY EVENTCATCODE
        ");
        return json_encode(['success' => true, 'Rows' => [[
            'NEWS_CATS' => array_map(fn($r) => ['CODE' => $r->NEWSCATCODE, 'NAME' => $r->CATNAME ?: $r->NEWSCATCODE], $newsCats),
            'EVENT_CATS' => array_map(fn($r) => ['CODE' => (string) $r->CODE], $eventCats),
        ]]]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $slug = trim((string) ($vdata['SLUG'] ?? ($param['slug'] ?? '')));
        if ($slug === '') {
            return json_encode(['success' => 'false', 'message' => 'SLUG tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, C.CATNAME
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            WHERE A.SLUG = ? AND A.STATUS = 'TERBIT'
        ", [$slug]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Berita tidak ditemukan.']);
        }

        $arr = (array) $row;

        // 5 berita terkait dengan kategori sama selain ini.
        $same = DB::select("
            SELECT TOP 5 A.NEWSID, A.TITLE, A.SLUG, A.SUMMARY, A.MAINIMAGE,
                   A.NEWSCATCODE, C.CATNAME, A.PUBLISHEDAT, A.VIEWCOUNT
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            WHERE A.STATUS = 'TERBIT' AND A.NEWSID <> ? AND A.NEWSCATCODE = ?
            ORDER BY A.PUBLISHEDAT DESC, A.NEWSID DESC
        ", [(int) $row->NEWSID, (string) $row->NEWSCATCODE]);
        $arr['RELATED'] = array_map(fn($x) => (array) $x, $same);

        // Event terkait (kalau kunci EVENTID diisi).
        $event = null;
        if (!empty($row->EVENTID)) {
            $e = DB::selectOne("
                SELECT EVENTID, TITLE, STARTAT, ENDAT, SLUG
                FROM T_EVENT WHERE EVENTID = ?
            ", [(int) $row->EVENTID]);
            if ($e) {
                $event = (array) $e;
            }
        }
        $arr['EVENT'] = $event;

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }
}
