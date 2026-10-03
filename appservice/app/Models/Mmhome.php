<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

// Discovery Home (mhome): ringkasan cepat untuk prospectus aplikasi.
// Hanya baca. SEGMENT: home/mhome/mhome. Menu MCONTROL = mhome.
//
// Catatan reuse:
//  - Banner memakai AdServe::forPosition() apa adanya (tanpa recordView/
//    recordClick).
//  - Status promo memakai Mmpromocode::displayStatus() (helper kanonik).
//  - Tidak memakai NewsPublic::published() karena helper itu memanggil
//    Mmnewsdata::applyPublishLazy() yang menulis ke DB; di sini cukup SELECT
//    berita TERBIT dengan urutan/wheres yang sama.
//  - TIDAK memakai PromoEngine::record/revert, tidak ada counter klik.
class Mmhome extends Model
{
    const MCODE = 20000001;

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

    // Agregat tiket terjual/kuota: rumus sama dengan halaman pengelolaan event.
    private static function salesJoin(): string
    {
        return " LEFT JOIN (
            SELECT EVENTID, SUM(QUOTA) AS QUOTA, MIN(PRICE) AS MINPRICE
            FROM T_TICKET_TYPE WHERE ISACTIVE = 'YES' GROUP BY EVENTID
        ) Q ON Q.EVENTID = A.EVENTID
        LEFT JOIN (
            SELECT EVENTID, COUNT(*) AS SOLD
            FROM T_ATTENDEE
            WHERE TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
            GROUP BY EVENTID
        ) S ON S.EVENTID = A.EVENTID";
    }

    // Ringkasan cepat: hitungan ringan per indeks.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $upcoming = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_EVENT
            WHERE STATUS = 'PUBLISHED' AND STARTAT >= GETDATE()
        ");
        $sold = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_ATTENDEE
            WHERE TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
        ");
        $news = DB::selectOne("SELECT COUNT(*) AS C FROM T_NEWS WHERE STATUS = 'TERBIT'");
        $eventTotal = DB::selectOne("
            SELECT COUNT(*) AS C FROM T_EVENT
            WHERE STATUS = 'PUBLISHED' AND (ENDAT IS NULL OR ENDAT >= GETDATE())
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'UPCOMING_EVENTS' => $upcoming ? (int) $upcoming->C : 0,
            'EVENT_TOTAL' => $eventTotal ? (int) $eventTotal->C : 0,
            'TICKETS_SOLD' => $sold ? (int) $sold->C : 0,
            'NEWS_PUBLISHED' => $news ? (int) $news->C : 0,
        ]]]);
    }

    // Event terdekat + paling laris (untuk kartu sorotan).
    public static function read_events($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $limit = isset($param['limit']) && $param['limit'] !== '' ? max(1, min(12, (int) $param['limit'])) : 6;

        $sql = "
            SELECT TOP " . (int) $limit . "
                A.EVENTID, A.TITLE, A.SLUG, A.STARTAT, A.ENDAT, A.POSTER, A.VENUE,
                C.CATNAME, CI.CITYNAME,
                ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD,
                ISNULL(Q.MINPRICE, 0) AS MINPRICE
            FROM T_EVENT A
            LEFT JOIN T_CATEGORY C ON C.CATCODE = A.CATCODE
            LEFT JOIN T_CITY CI ON CI.CITYCODE = A.CITYCODE
            " . self::salesJoin() . "
            WHERE A.STATUS = 'PUBLISHED' AND (A.ENDAT IS NULL OR A.ENDAT >= GETDATE())
            ORDER BY %s
        ";

        $near = DB::select(sprintf($sql, 'A.STARTAT ASC'));
        $hot = DB::select(sprintf($sql, 'ISNULL(S.SOLD, 0) DESC, A.STARTAT ASC'));

        $decorate = function ($rows) {
            $out = [];
            foreach ($rows as $r) {
                $arr = (array) $r;
                $arr['SOLD'] = (int) ($r->SOLD ?? 0);
                $arr['QUOTA'] = (int) ($r->QUOTA ?? 0);
                $arr['MINPRICE'] = (string) ($r->MINPRICE ?? '0');
                $out[] = $arr;
            }
            return $out;
        };

        return json_encode([
            'success' => true,
            'Rows' => [['NEAR' => $decorate($near), 'HOT' => $decorate($hot)]],
        ]);
    }

    // Berita terbaru (TERBIT). SELECT saja, tanpa applyPublishLazy.
    public static function read_news($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $limit = isset($param['limit']) && $param['limit'] !== '' ? max(1, min(12, (int) $param['limit'])) : 4;
        $rows = DB::select("
            SELECT TOP " . (int) $limit . "
                A.NEWSID, A.TITLE, A.SLUG, A.SUMMARY, A.MAINIMAGE,
                A.NEWSCATCODE, C.CATNAME, A.PUBLISHEDAT, A.VIEWCOUNT
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            WHERE A.STATUS = 'TERBIT'
            ORDER BY A.PUBLISHEDAT DESC, A.NEWSID DESC
        ");
        return json_encode([
            'success' => true,
            'Rows' => array_map(fn($r) => (array) $r, $rows),
        ]);
    }

    // Promo yang bisa dipakai + akan datang, status via helper kanonik.
    public static function read_promos($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $limit = isset($param['limit']) && $param['limit'] !== '' ? max(1, min(12, (int) $param['limit'])) : 4;
        $rows = DB::select("
            SELECT TOP " . (int) $limit . "
                A.PROMOID, A.PROMOCODE, A.DESCR, A.DISCTYPE, A.DISCVALUE,
                A.MAXDISC, A.MINPURCHASE, A.QUOTA, A.STARTAT, A.ENDAT,
                A.SCOPETYPE, A.ISACTIVE,
                (SELECT COUNT(*) FROM T_PROMO_USAGE U
                  WHERE U.PROMOID = A.PROMOID AND U.STATUS = 'DIPAKAI') AS USEDCOUNT
            FROM T_PROMO A
            WHERE UPPER(A.ISACTIVE) = 'YES'
              AND NOT (A.ENDAT IS NOT NULL AND GETDATE() > A.ENDAT)
              AND NOT (A.QUOTA IS NOT NULL AND A.QUOTA > 0
                       AND (SELECT COUNT(*) FROM T_PROMO_USAGE U2
                             WHERE U2.PROMOID = A.PROMOID AND U2.STATUS = 'DIPAKAI') >= A.QUOTA)
            ORDER BY A.STARTAT DESC, A.PROMOID DESC
        ");
        $out = [];
        foreach ($rows as $r) {
            $used = (int) ($r->USEDCOUNT ?? 0);
            $arr = (array) $r;
            $arr['USEDCOUNT'] = $used;
            $arr['DISPLAYSTATUS'] = Mmpromocode::displayStatus($r, $used);
            $out[] = $arr;
        }
        return json_encode(['success' => true, 'Rows' => $out]);
    }

    // Banner posisi aktif. Memakai AdServe::forPosition() (tanpa mencatat
    // view maupun click).
    public static function read_banner($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $pos = strtoupper(trim((string) ($param['poscode'] ?? 'HOME_TOP')));
        if ($pos === '') {
            $pos = 'HOME_TOP';
        }
        $max = isset($param['max']) && $param['max'] !== '' ? max(1, min(5, (int) $param['max'])) : 3;
        return json_encode(['success' => true, 'Rows' => AdServe::forPosition($pos, $max)]);
    }
}