<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
use Tymon\JWTAuth\Facades\JWTAuth;
use App\Custom\userJWT;

/**
 * Mportal - backend untuk portal pembeli di /tiket-app/.
 *
 * Semua action frontendCONFIRM. Tidak ada endpoint yang menerima identitas
 * pembeli dari parameter request: pemilik data SELALU diturunkan dari token
 * JWT (sub = USERLOGIN) lewat selfWho(). Parameter seperti ORDERCODE hanya
 * dipakai sebagai "mana", tetap diverifikasi kepemilikannya.
 *
 * Yang dipakai ulang (tidak ditulis ulang):
 *   - Money            : pembulatan rupiah, format
 *   - Mcpfee           : biaya dari Fee Setting (SERVICEPERTICKET, PAYTIMEOUTMIN)
 *   - Mmattendee       : assertQuota / quotaLeft, maskContact
 *   - PromoEngine      : validasi & pemakaian kode promo
 *   - PaymentService   : catatan pembayaran (dipanggil operator dari Console)
 *   - Mmrefund         : checkTicket (syarat refund) - aturan tidak diubah
 *   - TicketQr         : token QR bertanda tangan
 *   - MerchConfig      : batas waktu komplain, kategorI, kurir
 *   - Mcpsetting       : identitas/kontak aplikasi (General Setting)
 *   - AuditTrail       : pencatatan aksi pembeli
 *   - LoginTrail       : login/logout
 *   - Mcpblocked/SecurityPolicy :dipakai lewat Mlogin
 *
 * Format jawaban: { success: 'true'|'false', message, ... } sesuai model lain.
 */
class Mportal extends Model
{
    /** Group yang TIDAK boleh memakai Console. */
    const BUYER_GROUP = 'GROUP_USER';

    const ORDER_MENUNGGU = 'MENUNGGU';
    const ORDER_LUNAS = 'LUNAS';
    const ORDER_BATAL = 'BATAL';
    const ORDER_KEDALUWARSA = 'KEDALUWARSA';

    // =====================================================================
    //  Util internal
    // =====================================================================

    private static function ok(array $extra = [], string $msg = 'OK'): array
    {
        return array_merge(['success' => 'true', 'message' => $msg], $extra);
    }

    private static function fail(string $msg, int $code = 200): array
    {
        return ['success' => 'false', 'message' => $msg, 'code' => $code];
    }

    private static function failJson(string $msg, int $code = 200): array
    {
        return ['__http' => $code, 'success' => 'false', 'message' => $msg];
    }

    /** Pembeli dari token JWT. Kosong bila belum login. */
    private static function who(): array
    {
        try {
            $p = JWTAuth::parseToken()->getPayload()->toArray();
            $login = trim((string) ($p['sub'] ?? ''));
            if ($login === '') {
                return [];
            }
        } catch (\Throwable $e) {
            return [];
        }
        $u = DB::selectOne("
            SELECT USERID, USERLOGIN, USERNAME, USEREMAIL, USERGROUP, USERPHONE = ''
            FROM CPUSER WHERE USERLOGIN = ?
        ", [$login]);
        if (!$u) {
            return [];
        }
        return (array) $u;
    }

    /** Vektor responsive-rate-limit sederhana per kunci (file cache, tanpa tabel baru). */
    private static function rate(string $bucket, int $max, int $windowSec): bool
    {
        $file = sys_get_temp_dir() . '/portal_rl_' . preg_replace('/[^a-z0-9_]+/i', '_', $bucket) . '.json';
        $now = time();
        $hits = [];
        if (is_readable($file)) {
            $raw = @file_get_contents($file);
            $arr = $raw ? json_decode($raw, true) : [];
            if (is_array($arr)) {
                foreach ($arr as $ts) {
                    if (is_int($ts) && ($now - $ts) < $windowSec) {
                        $hits[] = $ts;
                    }
                }
            }
        }
        if (count($hits) >= $max) {
            return false;
        }
        $hits[] = $now;
        @file_put_contents($file, json_encode($hits), LOCK_EX);
        return true;
    }

    private static function clientIp(): string
    {
        try {
            return mb_substr((string) (request()->ip() ?? ''), 0, 45);
        } catch (\Throwable $e) {
            return '';
        }
    }

    /**
     * Catat aksi pembeli ke Audit Log. Memakai AuditTrail::log() yang sudah ada.
     * Data pribadi disamarkan oleh AuditTrail itu sendiri (mask()).
     */
    private static function audit(string $action, string $actor, array $meta = []): void
    {
        try {
            AuditTrail::log([
                'userlogin' => $actor,
                'action' => 'LAINNYA',
                'mcontrol' => 'portal',
                'page' => 'Portal Pembeli',
                'table' => $meta['table'] ?? '',
                'dataId' => (string) ($meta['dataId'] ?? ''),
                'summary' => $action . (isset($meta['dataId']) ? ' ' . $meta['dataId'] : ''),
            ]);
        } catch (\Throwable $e) {
            // audit tidak boleh menggagalkan alur pembeli
        }
    }

    /**
     * Kirim notifikasi lewat template yang ada (NotificationTemplate + SmtpMailer).
     * BEST-EFFORT: kegagalan kirim tidak pernah menggagalkan proses pembeli,
     * hanya dicatat ke System Log.
     */
    private static function notify(string $code, array $values, string $email, string $login): void
    {
        try {
            $to = trim((string) $email);
            if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
                return;
            }
            $r = NotificationTemplate::render($code, 'EMAIL', $values);
            if (!$r['ok']) {
                return;
            }
            $smtp = DB::selectOne("
                SELECT TOP 1 MAILFROMNAME, MAILFROMEMAIL, SMTPHOST, SMTPPORT, SMTPENCRYPTION,
                       SMTPUSERNAME, dbo.app_decrypt(SMTPPASSWORD) AS PLAIN
                FROM T_APP_SETTING ORDER BY SETTINGID
            ");
            if (!$smtp || trim((string) ($smtp->SMTPHOST ?? '')) === '') {
                return;
            }
            $sent = SmtpMailer::send([
                'HOST' => (string) $smtp->SMTPHOST,
                'PORT' => (string) $smtp->SMTPPORT,
                'ENCRYPTION' => (string) ($smtp->SMTPENCRYPTION ?? 'NONE'),
                'USERNAME' => (string) $smtp->SMTPUSERNAME,
                'PASSWORD' => trim((string) ($smtp->PLAIN ?? '')),
                'FROMEMAIL' => (string) $smtp->MAILFROMEMAIL,
                'FROMNAME' => (string) $smtp->MAILFROMNAME,
            ], $to, $r['subject'], $r['body']);
            if (!$sent['ok']) {
                SysLog::log('WARN', 'PORTAL', 'Notifikasi gagal dikirim: ' . $code, ['user' => $login]);
            }
        } catch (\Throwable $e) {
            SysLog::log('WARN', 'PORTAL', 'Gagal mengirim notifikasi: ' . $code, ['user' => $login]);
        }
    }

    /** Baris General Setting (T_APP_SETTING) untuk kontak & nama aplikasi. */
    private static function appSetting(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $row = DB::selectOne("SELECT TOP 1 * FROM T_APP_SETTING ORDER BY SETTINGID");
        $cache = $row ? (array) $row : [];
        return $cache;
    }

    /**
     * Path gambar dikembalikan APA ADANYA (mis. "uploads/news/x.jpg").
     * Frontend menyusun URL-nya dari apiBase, sama seperti halaman Console
     * yang sudah ada (bannerUrl / newsImageUrl / imageUrl). Tidak ada path
     * hardcoded di backend sehingga tidak ikut berantakan saat URL berubah.
     */
    private static function imgUrl(string $stored): string
    {
        $p = trim((string) $stored);
        if ($p === '') {
            return '';
        }
        return $p;
    }

    private static function eventImg(array $e): string
    {
        return self::imgUrl((string) ($e['POSTER'] ?? ''));
    }

    // =====================================================================
    //  PUBLIC  (tanpa login, hanya data yang layak publik)
    // =====================================================================

    /** Halaman beranda: iklan, kategori, event terdekat & populer, promo, berita. */
    public static function home($param)
    {
        if (!self::rate('pub_home_' . self::clientIp(), 60, 60)) {
            return self::failJson('Terlalu banyak permintaan. Coba lagi sebentar.', 429);
        }
        $out = [];

        // Iklan (label "Iklan" + pencatatan tayang & klik dengan pembatasan).
        try {
            $ads = AdServe::forPosition('HOME_TOP', 5);
            $out['ads'] = array_map(function ($a) {
                return [
                    'CAMPAIGNID' => (int) $a['CAMPAIGNID'],
                    'TITLE' => (string) ($a['TITLE'] ?? ''),
                    'BANNER' => self::imgUrl((string) ($a['BANNER'] ?? '')),
                    'HREF' => (string) ($a['HREF'] ?? ''),
                ];
            }, $ads ?: []);
        } catch (\Throwable $e) {
            $out['ads'] = [];
        }

        $out['categories'] = self::pubCategories();
        $out['events'] = self::publicEventRows(['limit' => 6, 'sort' => 'nearest']);
        $out['hot'] = self::publicEventRows(['limit' => 4, 'sort' => 'popular']);
        $out['promos'] = self::pubPromos(['limit' => 4]);
        $out['news'] = self::pubNews(['limit' => 4]);

        return self::ok($out);
    }

    /** Pencatahan tayang iklan (dibatasiagar tidak dipakai membanjiri). */
    public static function ad_view($param)
    {
        $id = (int) ($param['campaignid'] ?? 0);
        if ($id > 0 && self::rate('adv_' . self::clientIp(), 240, 60)) {
            try {
                AdServe::recordView($id);
            } catch (\Throwable $e) {
            }
        }
        return self::ok();
    }

    /** Pencatahan klik iklan; mengembalikan tujuan klik untuk diPnavigate. */
    public static function ad_click($param)
    {
        $id = (int) ($param['campaignid'] ?? 0);
        if ($id > 0 && self::rate('adc_' . self::clientIp(), 120, 60)) {
            try {
                AdServe::recordClick($id);
            } catch (\Throwable $e) {
            }
        }
        $href = '';
        try {
            $row = DB::selectOne("SELECT LINKURL, LINKTYPE, EVENTID FROM T_AD_CAMPAIGN WHERE CAMPAIGNID = ?", [$id]);
            if ($row) {
                $href = (string) ($row->LINKURL ?? '');
                if (strtoupper(trim((string) $row->LINKTYPE)) === 'EVENT' && (int) $row->EVENTID > 0) {
                    $href = '';
                }
            }
        } catch (\Throwable $e) {
        }
        return self::ok(['href' => $href]);
    }

    public static function categories($param)
    {
        if (!self::rate('pub_cat_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        return self::ok(['rows' => self::pubCategories()]);
    }

    public static function cities($param)
    {
        if (!self::rate('pub_city_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        $rows = DB::select("
            SELECT C.CITYID, C.CITYCODE, C.CITYNAME, C.CITYPROV
            FROM T_CITY C
            WHERE ISNULL(C.CITYACTIVE,'YES') <> 'NO'
              AND EXISTS (
                SELECT 1 FROM T_EVENT E
                 WHERE E.CITYCODE = C.CITYCODE
                   AND ISNULL(E.STATUS,'') = 'PUBLISHED'
                   AND ISNULL(E.ENDAT, GETDATE()) >= GETDATE()
              )
            ORDER BY C.CITYNAME
        ");
        return self::ok(['rows' => array_map(function ($r) {
            return ['CITYCODE' => (string) $r->CITYCODE, 'CITYNAME' => (string) $r->CITYNAME, 'CITYPROV' => (string) $r->CITYPROV];
        }, $rows ?: [])]);
    }

    private static function pubCategories(): array
    {
        $rows = DB::select("
            SELECT DISTINCT TOP 12 E.CATCODE, COALESCE(NULLIF(K.CATNAME,''), E.CATCODE) AS CATNAME
            FROM T_EVENT E
            LEFT JOIN T_CATEGORY K ON K.CATCODE = E.CATCODE
            WHERE ISNULL(E.STATUS,'') = 'PUBLISHED'
              AND ISNULL(E.ENDAT, GETDATE()) >= GETDATE()
            ORDER BY CATNAME
        ");
        return array_map(function ($r) {
            return ['CATCODE' => (string) $r->CATCODE, 'CATNAME' => (string) $r->CATNAME];
        }, $rows ?: []);
    }

    /** Katalog event publik: filter kategori/kota/tangarga/harga/cari + sort. */
    public static function events($param)
    {
        return self::listEvents($param);
    }

    /** WHERE + argumen filter event publik; dipakai query baris & jumlah. */
    private static function publicEventWhere($param): array
    {
        $q = trim((string) ($param['q'] ?? ''));
        $cat = trim((string) ($param['cat'] ?? ''));
        $city = trim((string) ($param['city'] ?? ''));
        $minprice = (int) ($param['minprice'] ?? 0);
        $maxprice = (int) ($param['maxprice'] ?? 0);

        $where = "E.STATUS = 'PUBLISHED' AND ISNULL(E.ENDAT, GETDATE()) >= GETDATE()";
        $args = [];
        if ($cat !== '') {
            $where .= " AND E.CATCODE = ?";
            $args[] = $cat;
        }
        if ($city !== '') {
            $where .= " AND E.CITYCODE = ?";
            $args[] = $city;
        }
        if ($q !== '') {
            $where .= " AND (E.TITLE LIKE ? OR E.DESCR LIKE ? OR E.ORGNAME LIKE ? OR E.VENUE LIKE ?)";
            $like = '%' . $q . '%';
            array_push($args, $like, $like, $like, $like);
        }
        if ($minprice > 0) {
            $where .= " AND (SELECT MIN(CAST(ISNULL(T.PRICE,0) AS int)) FROM T_TICKET_TYPE T WHERE T.EVENTID = E.EVENTID) >= ?";
            $args[] = $minprice;
        }
        if ($maxprice > 0) {
            $where .= " AND (SELECT MIN(CAST(ISNULL(T.PRICE,0) AS int)) FROM T_TICKET_TYPE T WHERE T.EVENTID = E.EVENTID) <= ?";
            $args[] = $maxprice;
        }

        return [$where, $args];
    }

    /** Katalog event publik: mengembalikan ARRAY baris (dipakai home & listEvents). */
    public static function publicEventRows($param): array
    {
        if (!self::rate('pub_evt_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        $limit = max(1, min(48, (int) ($param['limit'] ?? 12)));
        $offset = max(0, (int) ($param['offset'] ?? 0));
        $sort = strtolower(trim((string) ($param['sort'] ?? 'nearest')));

        // Filter (q/cat/city/harga) disusun di satu helper supaya query baris
        // dan query jumlah selalu memakai syarat yang sama.
        [$where, $args] = self::publicEventWhere($param);

        $order = 'E.STARTAT ASC';
        if ($sort === 'popular') {
            $order = 'ISNULL((SELECT COUNT(*) FROM T_ATTENDEE A2 WHERE A2.EVENTID = E.EVENTID),0) DESC, E.STARTAT ASC';
        } elseif ($sort === 'price_asc') {
            $order = '(SELECT MIN(CAST(ISNULL(T.PRICE,0) AS int)) FROM T_TICKET_TYPE T WHERE T.EVENTID = E.EVENTID) ASC';
        } elseif ($sort === 'price_desc') {
            $order = '(SELECT MIN(CAST(ISNULL(T.PRICE,0) AS int)) FROM T_TICKET_TYPE T WHERE T.EVENTID = E.EVENTID) DESC';
        } elseif ($sort === 'newest') {
            $order = 'E.PUBLISHEDAT DESC';
        }

        $rows = DB::select("
            SELECT E.EVENTID, E.TITLE, E.SLUG, E.DESCR, E.CATCODE, E.CITYCODE, E.VENUE, E.ADDRESS,
                   E.STARTAT, E.ENDAT, E.POSTER, E.ORGNAME,
                   (SELECT MIN(CAST(ISNULL(T.PRICE,0) AS int)) FROM T_TICKET_TYPE T
                     WHERE T.EVENTID = E.EVENTID AND ISNULL(T.ISACTIVE,'YES') <> 'NO') AS MINPRICE,
                   (SELECT MAX(CAST(ISNULL(T.PRICE,0) AS int)) FROM T_TICKET_TYPE T
                     WHERE T.EVENTID = E.EVENTID AND ISNULL(T.ISACTIVE,'YES') <> 'NO') AS MAXPRICE
            FROM T_EVENT E
            WHERE $where
            ORDER BY $order
            OFFSET $offset ROWS FETCH NEXT $limit ROWS ONLY
        ", $args);

        return array_map([self::class, 'mapEventRow'], $rows ?: []);
    }

    /** Pembungkus respons lengkap (rows + TotalRows) untuk halaman katalog. */
    public static function listEvents($param)
    {
        $rows = self::publicEventRows($param);
        $total = self::countPublicEvents($param);
        return self::ok([
            'rows' => $rows,
            'TotalRows' => $total,
            'limit' => max(1, min(48, (int) ($param['limit'] ?? 12))),
            'offset' => max(0, (int) ($param['offset'] ?? 0)),
        ]);
    }

    /** Jumlah event publik untuk filter yang sama (dipakai pagination). */
    private static function countPublicEvents($param): int
    {
        [$where, $args] = self::publicEventWhere($param);
        try {
            return (int) DB::selectOne("SELECT COUNT(*) AS C FROM T_EVENT E WHERE $where", $args)->C;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private static function mapEventRow($e): array
    {
        $e = (array) $e;
        return [
            'EVENTID' => (int) $e['EVENTID'],
            'TITLE' => (string) $e['TITLE'],
            'SLUG' => (string) ($e['SLUG'] ?? ''),
            'SUMMARY' => mb_substr(trim((string) ($e['DESCR'] ?? '')), 0, 160),
            'CATCODE' => (string) ($e['CATCODE'] ?? ''),
            'CITYCODE' => (string) ($e['CITYCODE'] ?? ''),
            'VENUE' => (string) ($e['VENUE'] ?? ''),
            'ADDRESS' => (string) ($e['ADDRESS'] ?? ''),
            'STARTAT' => (string) ($e['STARTAT'] ?? ''),
            'ENDAT' => (string) ($e['ENDAT'] ?? ''),
            'POSTER' => self::eventImg($e),
            'ORGNAME' => (string) ($e['ORGNAME'] ?? ''),
            'MINPRICE' => (int) ($e['MINPRICE'] ?? 0),
            'MAXPRICE' => (int) ($e['MAXPRICE'] ?? 0),
        ];
    }

    /** Detail event publik + tipe tiket + sisa kuota + promo aktif event ini. */
    public static function event($param)
    {
        if (!self::rate('pub_evt1_' . self::clientIp(), 180, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        $id = (int) ($param['eventid'] ?? 0);
        $slug = trim((string) ($param['slug'] ?? ''));
        $e = $id > 0
            ? DB::selectOne("SELECT * FROM T_EVENT WHERE EVENTID = ?", [$id])
            : DB::selectOne("SELECT * FROM T_EVENT WHERE SLUG = ? AND STATUS = 'PUBLISHED'", [$slug]);
        if (!$e || strtoupper(trim((string) $e->STATUS)) !== 'PUBLISHED') {
            return self::fail('Event tidak ditemukan.');
        }
        $e = (array) $e;
        if (!empty($e['ENDAT']) && strtotime((string) $e['ENDAT']) < time()) {
            return self::fail('Event sudah berakhir.');
        }

        $city = DB::selectOne("SELECT CITYNAME FROM T_CITY WHERE CITYCODE = ?", [(string) ($e['CITYCODE'] ?? '')]);
        $cat = DB::selectOne("SELECT CATNAME FROM T_CATEGORY WHERE CATCODE = ?", [(string) ($e['CATCODE'] ?? '')]);

        $types = DB::select("
            SELECT T.TICKETTYPEID, T.NAME, T.DESCR, T.PRICE, T.QUOTA, T.MAXPERSON, T.SORTORDER, T.ISACTIVE
            FROM T_TICKET_TYPE T
            WHERE T.EVENTID = ?
            ORDER BY ISNULL(T.SORTORDER, 0), T.TICKETTYPEID
        ", [(int) $e['EVENTID']]);

        $typeRows = [];
        foreach ($types ?: [] as $t) {
            $t = (array) $t;
            $sold = (int) DB::selectOne("
                SELECT COUNT(*) AS C FROM T_ATTENDEE
                WHERE TICKETTYPEID = ? AND ISNULL(TIKETSTATUS,'AKTIF') <> 'BATAL'
            ", [(int) $t['TICKETTYPEID']])->C;
            $quota = (int) $t['QUOTA'];
            $left = $quota > 0 ? max(0, $quota - $sold) : null; // null = tidak dibatasi
            $typeRows[] = [
                'TICKETTYPEID' => (int) $t['TICKETTYPEID'],
                'NAME' => (string) $t['NAME'],
                'DESCR' => (string) ($t['DESCR'] ?? ''),
                'PRICE' => Money::r($t['PRICE']),
                'QUOTA' => $quota,
                'SOLD' => $sold,
                'LEFT' => $left,
                'MAXPERSON' => (int) ($t['MAXPERSON'] ?? 0),
                'ISACTIVE' => strtoupper(trim((string) $t['ISACTIVE'])) !== 'NO',
            ];
        }

        return self::ok([
            'event' => array_merge(self::mapEventRow($e), [
                'DESCR' => (string) ($e['DESCR'] ?? ''),
                'TERMS' => (string) ($e['TERMS'] ?? ''),
                'ORGCONTACT' => (string) ($e['ORGCONTACT'] ?? ''),
                'CITYNAME' => (string) ($city->CITYNAME ?? ''),
                'CATNAME' => (string) ($cat->CATNAME ?? ''),
            ]),
            'types' => $typeRows,
            'promos' => self::pubPromos(['eventid' => (int) $e['EVENTID'], 'limit' => 8]),
        ]);
    }

    public static function news_list($param)
    {
        if (!self::rate('pub_news_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        return self::ok(['rows' => self::pubNews([
            'limit' => (int) ($param['limit'] ?? 12),
            'offset' => (int) ($param['offset'] ?? 0),
            'cat' => (string) ($param['cat'] ?? ''),
        ])]);
    }

    public static function news_detail($param)
    {
        $id = (int) ($param['newsid'] ?? 0);
        $r = DB::selectOne("SELECT * FROM T_NEWS WHERE NEWSID = ? AND ISNULL(STATUS,'') = 'TERBIT'", [$id]);
        if (!$r) {
            return self::fail('Berita tidak ditemukan.');
        }
        $r = (array) $r;
        return self::ok([
            'news' => [
                'NEWSID' => (int) $r['NEWSID'],
                'TITLE' => (string) $r['TITLE'],
                'SUMMARY' => (string) ($r['SUMMARY'] ?? ''),
                'BODY' => NewsHtml::sanitize((string) ($r['BODY'] ?? '')),
                'MAINIMAGE' => self::imgUrl((string) ($r['MAINIMAGE'] ?? '')),
                'PUBLISHEDAT' => (string) ($r['PUBLISHEDAT'] ?? ''),
                'AUTHORLOGIN' => (string) ($r['AUTHORLOGIN'] ?? ''),
                'VIEWCOUNT' => (int) ($r['VIEWCOUNT'] ?? 0),
            ],
        ]);
    }

    private static function pubNews(array $opt): array
    {
        $limit = max(1, min(30, (int) ($opt['limit'] ?? 8)));
        $offset = max(0, (int) ($opt['offset'] ?? 0));
        $args = [];
        $where = "N.STATUS = 'TERBIT'";
        if (!empty($opt['cat'])) {
            $where .= " AND N.NEWSCATCODE = ?";
            $args[] = $opt['cat'];
        }
        $rows = DB::select("
            SELECT N.NEWSID, N.TITLE, N.SUMMARY, N.MAINIMAGE, N.PUBLISHEDAT, N.VIEWCOUNT, N.NEWSCATCODE
            FROM T_NEWS N
            WHERE $where
            ORDER BY N.PUBLISHEDAT DESC
            OFFSET $offset ROWS FETCH NEXT $limit ROWS ONLY
        ", $args);
        return array_map(function ($n) {
            $n = (array) $n;
            return [
                'NEWSID' => (int) $n['NEWSID'],
                'TITLE' => (string) $n['TITLE'],
                'SUMMARY' => mb_substr((string) ($n['SUMMARY'] ?? ''), 0, 180),
                'MAINIMAGE' => self::imgUrl((string) ($n['MAINIMAGE'] ?? '')),
                'PUBLISHEDAT' => (string) ($n['PUBLISHEDAT'] ?? ''),
                'VIEWCOUNT' => (int) ($n['VIEWCOUNT'] ?? 0),
            ];
        }, $rows ?: []);
    }

    public static function promos($param)
    {
        if (!self::rate('pub_promo_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        return self::ok(['rows' => self::pubPromos([
            'limit' => (int) ($param['limit'] ?? 20),
            'offset' => (int) ($param['offset'] ?? 0),
            'eventid' => (int) ($param['eventid'] ?? 0),
        ])]);
    }

    /**
     * Daftar promo yang layak ditampilkan publik.
     * Mengikuti aturan PromoEngine::check(): ISACTIVE='YES', sudah mulai,
     * belum kedaluwarsa, kuota belum habis. Kolom mengikuti T_PROMO yang
     * sebenarnya (PROMOCODE/DISCVALUE/STARTAT/ENDAT/SCOPETYPE).
     */
    private static function pubPromos(array $opt): array
    {
        $limit = max(1, min(40, (int) ($opt['limit'] ?? 10)));
        $offset = max(0, (int) ($opt['offset'] ?? 0));
        $eventid = (int) ($opt['eventid'] ?? 0);

        $args = [];
        $where = "P.ISACTIVE = 'YES' AND (P.STARTAT IS NULL OR P.STARTAT <= GETDATE()) AND (P.ENDAT IS NULL OR P.ENDAT >= GETDATE())";

        // Cakupan EVENT: hanya promo yang memang untuk event ini.
        if ($eventid > 0) {
            $evc = DB::selectOne("SELECT EVENTCODE FROM T_EVENT WHERE EVENTID = ?", [$eventid]);
            $code = (string) ($evc->EVENTCODE ?? '');
            $where .= " AND (UPPER(ISNULL(P.SCOPETYPE,'SEMUA')) <> 'EVENT' OR EXISTS (SELECT 1 FROM T_PROMO_SCOPE S WHERE S.PROMOID = P.PROMOID AND S.TARGETTYPE = 'EVENT' AND UPPER(S.TARGETCODE) = UPPER(?)))";
            $args[] = $code;
        }

        $rows = DB::select("
            SELECT P.PROMOID, P.PROMOCODE, P.DESCR, P.DISCTYPE, P.DISCVALUE, P.MAXDISC,
                   P.QUOTA, P.MAXPERBUYER, P.STARTAT, P.ENDAT, P.SCOPETYPE, P.MINPURCHASE
            FROM T_PROMO P
            WHERE $where
            ORDER BY P.ENDAT ASC
            OFFSET $offset ROWS FETCH NEXT $limit ROWS ONLY
        ", $args);

        $out = [];
        foreach ($rows ?: [] as $r) {
            $r = (array) $r;
            $quota = (int) ($r['QUOTA'] ?? 0);
            $left = $quota > 0 ? max(0, $quota - PromoEngine::usedCount((int) $r['PROMOID'])) : null;
            $disc = (string) strtoupper(trim((string) $r['DISCTYPE']));
            $out[] = [
                'PROMOID' => (int) $r['PROMOID'],
                'CODE' => (string) $r['PROMOCODE'],
                'NAME' => (string) ($r['PROMOCODE'] ?? ''),
                'DESCR' => (string) ($r['DESCR'] ?? ''),
                'DISCTYPE' => $disc,
                'DISCOUNT' => Money::r($r['DISCVALUE']),
                'MAXDISC' => Money::r($r['MAXDISC']),
                'MINPURCHASE' => Money::r($r['MINPURCHASE']),
                'LEFT' => $left,
                'QUOTA' => $quota,
                'ENDDATE' => (string) ($r['ENDAT'] ?? ''),
                'SCOPETYPE' => (string) ($r['SCOPETYPE'] ?? ''),
            ];
        }
        return $out;
    }

    public static function products($param)
    {
        if (!self::rate('pub_prod_' . self::clientIp(), 120, 60)) {
            return self::failJson('Terlalu banyak permintaan.', 429);
        }
        $limit = max(1, min(48, (int) ($param['limit'] ?? 12)));
        $offset = max(0, (int) ($param['offset'] ?? 0));
        $q = trim((string) ($param['q'] ?? ''));
        $cat = trim((string) ($param['cat'] ?? ''));
        $args = [];
        $where = "ISNULL(P.ISACTIVE,'YES') <> 'NO' AND ISNULL(P.STOCK,0) > 0";
        if ($cat !== '') {
            $where .= " AND P.CATEGORY = ?";
            $args[] = $cat;
        }
        if ($q !== '') {
            $where .= " AND (P.NAME LIKE ? OR P.DESCR LIKE ?)";
            $like = '%' . $q . '%';
            array_push($args, $like, $like);
        }
        $rows = DB::select("
            SELECT P.PRODUCTID, P.NAME, P.DESCR, P.CATEGORY, P.PRICE, P.STOCK, P.CONDITION, P.SELLERID,
                   (SELECT TOP 1 PI.FILEPATH FROM T_PRODUCT_IMAGE PI WHERE PI.PRODUCTID = P.PRODUCTID ORDER BY PI.IMAGEID) AS IMG
            FROM T_PRODUCT P
            WHERE $where
            ORDER BY P.NAME
            OFFSET $offset ROWS FETCH NEXT $limit ROWS ONLY
        ", $args);
        return self::ok([
            'rows' => array_map(function ($p) {
                $p = (array) $p;
                return [
                    'PRODUCTID' => (int) $p['PRODUCTID'],
                    'NAME' => (string) $p['NAME'],
                    'DESCR' => mb_substr((string) ($p['DESCR'] ?? ''), 0, 200),
                    'CATEGORY' => (string) ($p['CATEGORY'] ?? ''),
                    'PRICE' => Money::r($p['PRICE']),
                    'STOCK' => (int) $p['STOCK'],
                    'SELLERID' => (int) ($p['SELLERID'] ?? 0),
                    'IMAGE' => self::imgUrl((string) ($p['IMG'] ?? '')),
                ];
            }, $rows ?: []),
            'categories' => MerchConfig::CATEGORIES,
        ]);
    }

    public static function product($param)
    {
        $id = (int) ($param['productid'] ?? 0);
        $p = DB::selectOne("
            SELECT P.*, (SELECT TOP 1 PI.FILEPATH FROM T_PRODUCT_IMAGE PI WHERE PI.PRODUCTID = P.PRODUCTID ORDER BY PI.IMAGEID) AS IMG
            FROM T_PRODUCT P WHERE P.PRODUCTID = ? AND ISNULL(P.ISACTIVE,'YES') <> 'NO'
        ", [$id]);
        if (!$p) {
            return self::fail('Produk tidak ditemukan.');
        }
        $p = (array) $p;
        $imgs = DB::select("SELECT FILEPATH FROM T_PRODUCT_IMAGE WHERE PRODUCTID = ? ORDER BY IMAGEID", [$id]);
        $seller = null;
        if (!empty($p['SELLERID'])) {
            $s = DB::selectOne("SELECT SELLERID, SELLERNAME FROM T_SELLER WHERE SELLERID = ?", [(int) $p['SELLERID']]);
            if ($s) {
                $seller = ['SELLERID' => (int) $s->SELLERID, 'SELLERNAME' => (string) $s->SELLERNAME];
            }
        }
        return self::ok([
            'product' => [
                'PRODUCTID' => (int) $p['PRODUCTID'],
                'NAME' => (string) $p['NAME'],
                'DESCR' => (string) ($p['DESCR'] ?? ''),
                'CATEGORY' => (string) ($p['CATEGORY'] ?? ''),
                'PRICE' => Money::r($p['PRICE']),
                'STOCK' => (int) ($p['STOCK'] ?? 0),
                'CONDITION' => (string) ($p['CONDITION'] ?? ''),
                'IMAGE' => self::imgUrl((string) ($p['IMG'] ?? '')),
                'SELLER' => $seller,
            ],
            'images' => array_map(function ($i) {
                return self::imgUrl((string) $i->FILEPATH);
            }, $imgs ?: []),
        ]);
    }

    // =====================================================================
    //  AUTH pembeli
    // =====================================================================

    /** Daftar akun pembeli baru (USERGROUP = GROUP_USER). */
    public static function register($param)
    {
        if (!self::rate('reg_' . self::clientIp(), 5, 600)) {
            return self::failJson('Terlalu banyak percobaan pendaftaran. Coba lagi beberapa menit lagi.', 429);
        }
        $login = mb_strtolower(trim((string) ($param['userlogin'] ?? '')));
        $pass = (string) ($param['userpassword'] ?? '');
        $name = trim((string) ($param['username'] ?? ''));
        $email = mb_strtolower(trim((string) ($param['useremail'] ?? '')));
        $phone = trim((string) ($param['userphone'] ?? ''));

        if ($login === '' || !preg_match('/^[a-z0-9._-]{3,30}$/', $login)) {
            return self::fail('Username 3-30 karakter (huruf kecil, angka, titik, garis).');
        }
        if ($name === '') {
            return self::fail('Nama wajib diisi.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return self::fail('Format email tidak valid.');
        }
        // Validasi kekuatan password memakai Security Setting yang sama dgn Console.
        $perr = SecurityPolicy::checkPassword($pass);
        if ($perr !== null && $perr !== '') {
            return self::fail($perr);
        }

        if (DB::selectOne("SELECT TOP 1 USERID FROM CPUSER WHERE USERLOGIN = ?", [$login])) {
            return self::fail('Username sudah dipakai. Pilih yang lain.');
        }
        if (DB::selectOne("SELECT TOP 1 USERID FROM CPUSER WHERE USEREMAIL = ?", [$email])) {
            return self::fail('Email sudah terdaftar. Gunakan email lain.');
        }

        try {
            DB::insert("
                INSERT INTO CPUSER
                    (USERLOGIN, USERNAME, USERPASSWORD, USERGROUP, USERACTIVE, USEREMAIL, USERDEPT,
                     GROUPMODEL, SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, dbo.app_encrypt(?), ?, 'YES', ?, NULL, 'mode_standard', ?, GETDATE())
            ", [$login, $name, $pass, self::BUYER_GROUP, $email, 'portal-register']);
        } catch (\Exception $e) {
            SysLog::log('ERROR', 'PORTAL', 'Gagal membuat akun pembeli.', ['login' => $login, 'e' => $e->getMessage()]);
            return self::fail('Pendaftaran gagal. Coba lagi.');
        }

        LoginTrail::record('REGISTER', $login);
        self::audit('PORTAL_REGISTER', $login, ['email' => $email]);

        return self::ok(['userlogin' => $login], 'Pendaftaran berhasil. Silakan masuk.');
    }

    /** Grup pembeli? (dipakai frontend untuk redirect setelah login) */
    public static function whoami($param)
    {
        $u = self::who();
        if (!$u) {
            return self::fail('Belum login.');
        }
        return self::ok([
            'profile' => [
                'USERLOGIN' => $u['USERLOGIN'],
                'USERNAME' => $u['USERNAME'],
                'USERGROUP' => $u['USERGROUP'],
                'USEREMAIL' => $u['USEREMAIL'],
                'IS_BUYER' => strtoupper(trim((string) $u['USERGROUP'])) === self::BUYER_GROUP,
            ],
        ]);
    }

    // =====================================================================
    //  PESANAN TIKET
    // =====================================================================

    /** Ringkasan biaya dihitung backend (frontend tidak dipercaya). */
    public static function order_preview($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $eventid = (int) ($param['eventid'] ?? 0);
        $typeid = (int) ($param['tickettypeid'] ?? 0);
        $qty = (int) ($param['qty'] ?? 0);
        $code = trim((string) ($param['promocode'] ?? ''));

        if ($eventid <= 0 || $typeid <= 0) {
            return self::fail('Event atau tipe tiket tidak valid.');
        }
        if ($qty < 1) {
            return self::fail('Jumlah tiket minimal 1.');
        }
        $calc = self::calcOrder($eventid, $typeid, $qty, $code, (string) $u['USEREMAIL'], (string) $u['USERLOGIN']);
        if (!$calc['ok']) {
            return self::fail($calc['message']);
        }
        return self::ok($calc);
    }

    /** Perhitungan tunggal untuk preview & create. Semua nilai di backend. */
    private static function calcOrder(int $eventid, int $typeid, int $qty, string $promocode, string $email, string $login): array
    {
        $ev = DB::selectOne("SELECT * FROM T_EVENT WHERE EVENTID = ?", [$eventid]);
        if (!$ev || strtoupper(trim((string) $ev->STATUS)) !== 'PUBLISHED') {
            return ['ok' => false, 'message' => 'Event tidak tersedia.'];
        }
        if (!empty($ev->ENDAT) && strtotime((string) $ev->ENDAT) < time()) {
            return ['ok' => false, 'message' => 'Event sudah berakhir.'];
        }
        $t = DB::selectOne("SELECT * FROM T_TICKET_TYPE WHERE TICKETTYPEID = ? AND EVENTID = ?", [$typeid, $eventid]);
        if (!$t) {
            return ['ok' => false, 'message' => 'Tipe tiket tidak valid.'];
        }
        if (strtoupper(trim((string) $t->ISACTIVE)) === 'NO') {
            return ['ok' => false, 'message' => 'Tipe tiket tidak dijual.'];
        }

        // Batas per orang
        $maxp = (int) ($t->MAXPERSON ?? 0);
        if ($maxp > 0 && $qty > $maxp) {
            return ['ok' => false, 'message' => 'Maksimal ' . $maxp . ' tiket per orang untuk tipe ini.'];
        }
        // Kuota (reused)
        $qerr = Mmattendee::assertQuota($typeid, $qty);
        if ($qerr !== null) {
            return ['ok' => false, 'message' => $qerr];
        }

        $price = Money::r($t->PRICE);
        $subtotal = $price * $qty;

        $discount = 0;
        $promoid = 0;
        $promocode = strtoupper(trim($promocode));
        if ($promocode !== '') {
            $chk = PromoEngine::check($promocode, $eventid, (float) $subtotal, $email);
            if (!$chk['ok']) {
                return ['ok' => false, 'message' => 'Kode promo tidak berlaku: ' . strtolower((string) $chk['reason']) . '.'];
            }
            $discount = Money::r($chk['discount']);
            $promoid = (int) $chk['promoid'];
            if ($discount > $subtotal) {
                $discount = $subtotal;
            }
        }

        // Biaya layanan per tiket dari Fee Setting (reused)
        $fee = Mcpfee::effectiveOn(date('Y-m-d'));
        $service = 0;
        $timeoutMin = 60;
        if ($fee) {
            $service = Money::r($fee->SERVICEPERTICKET) * $qty;
            $timeoutMin = (int) ($fee->PAYTIMEOUTMIN ?? 60);
            if ($timeoutMin < 5) {
                $timeoutMin = 5;
            }
        }

        $total = $subtotal - $discount + $service;
        $deadline = date('Y-m-d H:i:s', time() + $timeoutMin * 60);

        return ['ok' => true, 'calc' => [
            'eventid' => $eventid,
            'eventtitle' => (string) $ev->TITLE,
            'tickettypeid' => $typeid,
            'tickettypename' => (string) $t->NAME,
            'qty' => $qty,
            'price' => $price,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'promocode' => $promocode,
            'promoid' => $promoid,
            'service' => $service,
            'total' => $total,
            'paydeadline' => $deadline,
            'timeoutmin' => $timeoutMin,
        ]];
    }

    /** Buat pesanan + N baris T_ATTENDEE (1 tiket per baris,_aturan lama). */
    public static function order_create($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        if (!self::rate('ord_' . $u['USERLOGIN'], 10, 300)) {
            return self::failJson('Terlalu banyak pembuatan pesanan. Coba lagi sebentar.', 429);
        }

        $eventid = (int) ($param['eventid'] ?? 0);
        $typeid = (int) ($param['tickettypeid'] ?? 0);
        $qty = (int) ($param['qty'] ?? 0);
        $promocode = trim((string) ($param['promocode'] ?? ''));
        $name = trim((string) ($param['name'] ?? ''));
        $phone = trim((string) ($param['phone'] ?? ''));
        // Nama pemilik tiket opsional per tiket (pemisah koma/baris baru)
        $owners = self::splitOwners((string) ($param['ticketowners'] ?? ''));
        $email = trim((string) ($param['email'] ?? '')) ?: (string) $u['USEREMAIL'];
        $idem = mb_substr(trim((string) ($param['idempotencykey'] ?? '')), 0, 64);

        if ($name === '') {
            return self::fail('Nama pemesan wajib diisi.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return self::fail('Format email tidak valid.');
        }
        if ($owners !== [] && count($owners) !== $qty) {
            return self::fail('Jumlah pemilik tiket harus sama dengan jumlah tiket.');
        }

        $calc = self::calcOrder($eventid, $typeid, $qty, $promocode, $email, (string) $u['USERLOGIN']);
        if (!$calc['ok']) {
            return self::fail($calc['message']);
        }
        $c = $calc['calc'];

        try {
            return DB::transaction(function () use ($u, $c, $qty, $name, $email, $phone, $owners, $idem, $promocode, $typeid, $eventid) {
                // Idempotency: klik ganda tidak membuat pesanan ganda.
                if ($idem !== '') {
                    $old = DB::selectOne("SELECT * FROM T_TICKET_ORDER WHERE IDEMPOTENCYKEY = ?", [$idem]);
                    if ($old) {
                        $old = (array) $old;
                        return self::ok(['order' => self::orderDetailRow($old)], 'Pesanan sudah dibuat sebelumnya.');
                    }
                }

// Kode pesanan dibuat SEBELUM insert (bukan placeholder 'TMP'),
                // sehingga percobaan ulang tidak pernah bentrok dengan baris
                // gagal sebelumnya yang masih menyimpan kode placeholder.
                $code = self::newOrderCode();
                DB::insert("
                    INSERT INTO T_TICKET_ORDER
                        (ORDERCODE, EVENTID, TICKETTYPEID, QTY, BUYERUSER, BUYERNAME, BUYEREMAIL, BUYERPHONE,
                         PROMOCODE, SUBTOTAL, DISCOUNT, SERVICEFEE, TOTAL, STATUS, PAYDEADLINE,
                         IDEMPOTENCYKEY, SYSCREATEUSER, SYSCREATEDATE)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE())
                ", [
                    $code,
                    $eventid, $typeid, $qty, $u['USERLOGIN'], $name, $email, $phone,
                    $c['promocode'] !== '' ? $c['promocode'] : null,
                    $c['subtotal'], $c['discount'], $c['service'], $c['total'], self::ORDER_MENUNGGU,
                    $c['paydeadline'],
                    $idem !== '' ? $idem : null,
                    $u['USERLOGIN'],
                ]);
                $oid = (int) DB::getPdo()->lastInsertId();

                // Satu baris T_ATTENDEE per tiket - kompatibel dengan scan,
                // payment per tiket, refund, dan laporan yang sudah ada.
                for ($i = 1; $i <= $qty; $i++) {
                    $ownerName = $owners !== [] ? $owners[$i - 1] : $name;
                    $tcode = self::ticketCode($eventid, $i);
                    DB::insert("
                        INSERT INTO T_ATTENDEE
                            (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE, SOURCE,
                             PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, ORDERID, ORDERCODE, REGDATE,
                             QRVERSION, SYSCREATEUSER, SYSCREATEDATE)
                        VALUES (?, ?, ?, ?, ?, ?, 'PORTAL', 'BELUM_BAYAR', 'BELUM', 'AKTIF', ?, ?, GETDATE(), 1, ?, GETDATE())
                    ", [
                        $eventid, $typeid, $ownerName, $email, $phone, $tcode,
                        $oid, $code, $u['USERLOGIN'],
                    ]);
                }

                $row = (array) DB::selectOne("SELECT * FROM T_TICKET_ORDER WHERE ORDERID = ?", [$oid]);

                self::audit('PORTAL_ORDER_CREATE', (string) $u['USERLOGIN'], [
                    'ordercode' => $code, 'eventid' => $eventid, 'qty' => $qty, 'total' => $c['total'],
                ]);
                self::notify('TICKET_ORDER_CREATED', [
                    'ORDERCODE' => $code, 'TOTAL' => Money::rp($c['total']),
                    'DEADLINE' => $c['paydeadline'], 'QTY' => $qty, 'TITLE' => $c['eventtitle'],
                ], $email, (string) $u['USERLOGIN']);

                return self::ok(['order' => self::orderDetailRow($row)], 'Pesanan dibuat. Selesaikan pembayaran sebelum batas waktu.');
            });
        } catch (\Exception $e) {
            SysLog::log('ERROR', 'PORTAL', 'Gagal membuat pesanan tiket.', ['e' => $e->getMessage()]);
            return self::fail('Pesanan gagal dibuat. Silakan coba lagi.');
        }
    }

    private static function splitOwners(string $raw): array
    {
        $parts = preg_split('/[\r\n,;]+/', $raw) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim($p);
            if ($p !== '') {
                $out[] = mb_substr($p, 0, 100);
            }
        }
        return $out;
    }

    /** Kode pesanan unik: TPO-YYMMDD-XXXXXX */
    private static function newOrderCode(): string
    {
        for ($i = 0; $i < 6; $i++) {
            $code = 'TPO-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            if (!DB::selectOne("SELECT TOP 1 ORDERID FROM T_TICKET_ORDER WHERE ORDERCODE = ?", [$code])) {
                return $code;
            }
        }
        return 'TPO-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(6)));
    }

    private static function ticketCode(int $eventid, int $seq): string
    {
        return strtoupper(substr(md5($eventid . '|' . $seq . '|' . microtime(true) . random_int(1, 999999)), 0, 12));
    }

    private static function orderDetailRow(array $o): array
    {
        $tickets = DB::select("
            SELECT ATTENDEEID, TICKETCODE, NAME, EMAIL, PHONE, PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, REGDATE
            FROM T_ATTENDEE WHERE ORDERID = ? ORDER BY ATTENDEEID
        ", [(int) $o['ORDERID']]);
        $ev = DB::selectOne("SELECT TITLE, STARTAT, ENDAT, ORGNAME, ORGCONTACT FROM T_EVENT WHERE EVENTID = ?", [(int) $o['EVENTID']]);
        $setting = self::appSetting();
        return [
            'ORDERCODE' => (string) $o['ORDERCODE'],
            'STATUS' => (string) $o['STATUS'],
            'EVENTTITLE' => (string) ($ev->TITLE ?? ''),
            'EVENTSTART' => (string) ($ev->STARTAT ?? ''),
            'ORGNAME' => (string) ($ev->ORGNAME ?? ''),
            'ORGCONTACT' => (string) ($ev->ORGCONTACT ?? ''),
            'SUBTOTAL' => Money::r($o['SUBTOTAL']),
            'DISCOUNT' => Money::r($o['DISCOUNT']),
            'SERVICEFEE' => Money::r($o['SERVICEFEE']),
            'TOTAL' => Money::r($o['TOTAL']),
            'PROMOCODE' => (string) ($o['PROMOCODE'] ?? ''),
            'PAYDEADLINE' => (string) ($o['PAYDEADLINE'] ?? ''),
            'CREATED' => (string) ($o['SYSCREATEDATE'] ?? ''),
            'PAYMENT_METHODS' => self::payMethods(),
            'CONTACT' => [
                'EMAIL' => (string) ($setting['CONTACTEMAIL'] ?? ''),
                'PHONE' => (string) ($setting['CONTACTPHONE'] ?? ''),
                'WA' => (string) ($setting['CONTACTWA'] ?? ''),
                'ADDRESS' => (string) ($setting['ADDRESS'] ?? ''),
            ],
            'TICKETS' => array_map(function ($t) {
                $t = (array) $t;
                return [
                    'ATTENDEEID' => (int) $t['ATTENDEEID'],
                    'TICKETCODE' => (string) $t['TICKETCODE'],
                    'NAME' => (string) $t['NAME'],
                    'EMAIL' => (string) $t['EMAIL'],
                    'PHONE' => (string) $t['PHONE'],
                    'PAYSTATUS' => (string) $t['PAYSTATUS'],
                    'ATTENDSTATUS' => (string) $t['ATTENDSTATUS'],
                    'TIKETSTATUS' => (string) $t['TIKETSTATUS'],
                    'REGDATE' => (string) $t['REGDATE'],
                ];
            }, $tickets ?: []),
        ];
    }

    private static function payMethods(): array
    {
        $rows = DB::select("SELECT PAYID, PAYCODE, PAYNAME, PAYTYPE, LOGO FROM T_PAYMENT_METHOD WHERE ISNULL(PAYACTIVE,'YES') <> 'NO' ORDER BY ISNULL(PAYSORT,0), PAYID");
        return array_map(function ($m) {
            return [
                'PAYID' => (int) $m->PAYID, 'PAYCODE' => (string) $m->PAYCODE,
                'PAYNAME' => (string) $m->PAYNAME, 'PAYTYPE' => (string) ($m->PAYTYPE ?? ''),
                'LOGO' => self::imgUrl((string) ($m->LOGO ?? '')),
            ];
        }, $rows ?: []);
    }

    /** Daftar pesanan pembeli (dengan auto-batal kalau lewat batas waktu). */
    public static function order_list($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        self::sweepExpiredOrders();
        $rows = DB::select("
            SELECT * FROM T_TICKET_ORDER WHERE BUYERUSER = ? ORDER BY ORDERID DESC
        ", [(string) $u['USERLOGIN']]);
        return self::ok([
            'rows' => array_map(function ($o) {
                $o = (array) $o;
                return [
                    'ORDERCODE' => (string) $o['ORDERCODE'],
                    'STATUS' => (string) $o['STATUS'],
                    'EVENTTITLE' => (string) (DB::selectOne("SELECT TITLE FROM T_EVENT WHERE EVENTID = ?", [(int) $o['EVENTID']])->TITLE ?? ''),
                    'QTY' => (int) $o['QTY'],
                    'TOTAL' => Money::r($o['TOTAL']),
                    'PAYDEADLINE' => (string) ($o['PAYDEADLINE'] ?? ''),
                    'CREATED' => (string) ($o['SYSCREATEDATE'] ?? ''),
                ];
            }, $rows ?: []),
        ]);
    }

    public static function order_detail($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        self::sweepExpiredOrders();
        $code = mb_substr(trim((string) ($param['ordercode'] ?? '')), 0, 30);
        $o = DB::selectOne("SELECT * FROM T_TICKET_ORDER WHERE ORDERCODE = ? AND BUYERUSER = ?", [$code, (string) $u['USERLOGIN']]);
        if (!$o) {
            return self::fail('Pesanan tidak ditemukan.');
        }
        return self::ok(['order' => self::orderDetailRow((array) $o)]);
    }

    /** Batalkan pesanan yang masih menunggu pembayaran (kuota dilepas). */
    public static function order_cancel($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $code = mb_substr(trim((string) ($param['ordercode'] ?? '')), 0, 30);
        try {
            return DB::transaction(function () use ($u, $code) {
                $o = DB::selectOne("SELECT * FROM T_TICKET_ORDER WITH (UPDLOCK, ROWLOCK) WHERE ORDERCODE = ? AND BUYERUSER = ?", [$code, (string) $u['USERLOGIN']]);
                if (!$o) {
                    return self::fail('Pesanan tidak ditemukan.');
                }
                $o = (array) $o;
                if (strtoupper(trim((string) $o['STATUS'])) !== self::ORDER_MENUNGGU) {
                    return self::fail('Pesanan tidak bisa dibatalkan pada status ini.');
                }
                $paid = (int) DB::selectOne("SELECT COUNT(*) AS C FROM T_ATTENDEE WHERE ORDERID = ? AND ISNULL(PAYSTATUS,'BELUM_BAYAR') <> 'BELUM_BAYAR'", [(int) $o['ORDERID']])->C;
                if ($paid > 0) {
                    return self::fail('Sebagian tiket sudah dibayar, batalkan lewat operator.');
                }
                // Lepaskan tiket: Tiket jadi BATAL supaya kuota kembali.
                foreach (DB::select("SELECT ATTENDEEID FROM T_ATTENDEE WHERE ORDERID = ?", [(int) $o['ORDERID']]) ?: [] as $a) {
                    Mmattendee::cancelTicket((int) $a->ATTENDEEID, 'Dibatalkan pembeli sebelum pembayaran', (string) $u['USERLOGIN'], 'portal', 'order_cancel');
                }
                // Kembalikan pemakaian promo bila sempat tercatat.
                if (!empty($o['PROMOCODE'])) {
                    PromoEngine::revert(0, (string) $u['USEREMAIL']);
                }
                DB::update("UPDATE T_TICKET_ORDER SET STATUS = ?, CLOSEDAT = GETDATE(), SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE() WHERE ORDERID = ?",
                    [self::ORDER_BATAL, (string) $u['USERLOGIN'], (int) $o['ORDERID']]);

                self::audit('PORTAL_ORDER_CANCEL', (string) $u['USERLOGIN'], ['ordercode' => $code]);
                return self::ok([], 'Pesanan dibatalkan.');
            });
        } catch (\Exception $e) {
            return self::fail('Pembatalan gagal: ' . $e->getMessage());
        }
    }

    /**
     * Sweep pesanan lewat batas waktu: status KEDALUWARSA + tiket BATAL
     * sehingga kuota dilepas. Dipanggil sebelummembaca daftar/detail pesanan
     * dan oleh timer (deploy tidak perlu scheduler baru).
     */
    public static function sweepExpiredOrders(): void
    {
        try {
            $rows = DB::select("
                SELECT ORDERID, ORDERCODE, BUYERUSER, BUYEREMAIL, TICKETTYPEID, QTY
                FROM T_TICKET_ORDER
                WHERE STATUS = ? AND PAYDEADLINE IS NOT NULL AND PAYDEADLINE < GETDATE()
            ", [self::ORDER_MENUNGGU]);
            foreach ($rows ?: [] as $r) {
                try {
                    DB::transaction(function () use ($r) {
                        foreach (DB::select("SELECT ATTENDEEID FROM T_ATTENDEE WHERE ORDERID = ?", [(int) $r->ORDERID]) ?: [] as $a) {
                            Mmattendee::cancelTicket((int) $a->ATTENDEEID, 'Kedaluwarsa otomatis', 'SYSTEM', 'portal', 'expired');
                        }
                        DB::update("UPDATE T_TICKET_ORDER SET STATUS = ?, CLOSEDAT = GETDATE(), SYSUPDATEUSER = 'SYSTEM', SYSUPDATEDATE = GETDATE() WHERE ORDERID = ?",
                            [self::ORDER_KEDALUWARSA, (int) $r->ORDERID]);
                    });
                } catch (\Throwable $e) {
                }
            }
        } catch (\Throwable $e) {
        }
    }

    // =====================================================================
    //  TIKET SAYA
    // =====================================================================

    public static function my_tickets($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $tab = strtolower(trim((string) ($param['tab'] ?? 'aktif')));
        $rows = DB::select("
            SELECT A.ATTENDEEID, A.TICKETCODE, A.NAME, A.EMAIL, A.PHONE,
                   A.PAYSTATUS, A.ATTENDSTATUS, A.TIKETSTATUS, A.CHECKINTIME, A.REGDATE,
                   A.ORDERCODE, A.EVENTID, A.QRVERSION,
                   E.TITLE AS EVENTTITLE, E.STARTAT, E.ENDAT, E.VENUE, E.CITYCODE,
                   T.NAME AS TYPENAME, T.PRICE,
                   (SELECT TOP 1 R.STATUS FROM T_TICKET_REFUND R
                     WHERE R.TICKETID = A.ATTENDEEID ORDER BY R.REFUNDID DESC) AS REFUNDSTATUS
            FROM T_ATTENDEE A
            JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            LEFT JOIN T_TICKET_TYPE T ON T.TICKETTYPEID = A.TICKETTYPEID
            WHERE A.EMAIL = ?
            ORDER BY A.ATTENDEEID DESC
        ", [(string) $u['USEREMAIL']]);

        $all = [];
        foreach ($rows ?: [] as $r) {
            $r = (array) $r;
            $ts = strtoupper(trim((string) $r['TIKETSTATUS']));
            $ps = strtoupper(trim((string) $r['PAYSTATUS']));
            $as = strtoupper(trim((string) $r['ATTENDSTATUS']));
            $rs = strtoupper(trim((string) ($r['REFUNDSTATUS'] ?? '')));
            if ($rs === 'DIAJUKAN') {
                $bucket = 'refund';
            } elseif ($ts === 'BATAL') {
                $bucket = 'refund';
            } elseif ($ps === 'BELUM_BAYAR') {
                $bucket = 'menunggu';
            } elseif ($as === 'HADIR') {
                $bucket = 'dipakai';
            } else {
                $bucket = 'aktif';
            }
            $all[$bucket][] = $r;
        }

        $cityName = function ($code) {
            if (trim((string) $code) === '') {
                return '';
            }
            $c = DB::selectOne("SELECT CITYNAME FROM T_CITY WHERE CITYCODE = ?", [$code]);
            return (string) ($c->CITYNAME ?? '');
        };

        $map = function (array $r) use ($cityName) {
            $used = strtoupper(trim((string) $r['ATTENDSTATUS'])) === 'HADIR';
            $cancelled = strtoupper(trim((string) $r['TIKETSTATUS'])) === 'BATAL';
            $refunded = strtoupper(trim((string) ($r['REFUNDSTATUS'] ?? ''))) === 'DIAJUKAN';
            $paid = strtoupper(trim((string) $r['PAYSTATUS'])) === 'LUNAS';
            // QR hanya untuk tiket aktif yang belum dipakai & belum batal/refund.
            $qrActive = $paid && !$used && !$cancelled && !$refunded;
            return [
                'ATTENDEEID' => (int) $r['ATTENDEEID'],
                'TICKETCODE' => (string) $r['TICKETCODE'],
                'HOLDER' => (string) $r['NAME'],
                'EVENTTITLE' => (string) $r['EVENTTITLE'],
                'EVENTID' => (int) $r['EVENTID'],
                'TYPENAME' => (string) ($r['TYPENAME'] ?? ''),
                'PRICE' => Money::r($r['PRICE']),
                'STARTAT' => (string) ($r['STARTAT'] ?? ''),
                'ENDAT' => (string) ($r['ENDAT'] ?? ''),
                'VENUE' => (string) ($r['VENUE'] ?? ''),
                'CITYNAME' => $cityName((string) ($r['CITYCODE'] ?? '')),
                'ORDERCODE' => (string) ($r['ORDERCODE'] ?? ''),
                'PAYSTATUS' => (string) $r['PAYSTATUS'],
                'ATTENDSTATUS' => (string) $r['ATTENDSTATUS'],
                'TIKETSTATUS' => (string) $r['TIKETSTATUS'],
                'REFUNDSTATUS' => (string) ($r['REFUNDSTATUS'] ?? ''),
                'REGDATE' => (string) ($r['REGDATE'] ?? ''),
                'CHECKINTIME' => (string) ($r['CHECKINTIME'] ?? ''),
                'QRACTIVE' => $qrActive,
                'QRTOKEN' => $qrActive ? (string) (TicketQr::issue((int) $r['ATTENDEEID'], (string) $r['TICKETCODE'], (int) ($r['QRVERSION'] ?? 1)) ?? '') : '',
                'CANREFUND' => ($paid && !$used && !$cancelled && !$refunded) ? true : false,
            ];
        };

        $keys = ['aktif', 'menunggu', 'dipakai', 'refund'];
        $tab = in_array($tab, $keys, true) ? $tab : 'aktif';
        $out = [];
        foreach ($keys as $k) {
            $out[$k] = array_map($map, $all[$k] ?? []);
        }
        $out['counts'] = [
            'aktif' => count($out['aktif']), 'menunggu' => count($out['menunggu']),
            'dipakai' => count($out['dipakai']), 'refund' => count($out['refund']),
        ];
        $out['tab'] = $tab;
        return self::ok($out);
    }

    // =====================================================================
    //  REFUND
    // =====================================================================

    /** Cek syarat refund memakai Mmrefund::checkTicket (aturan tidak diubah). */
    public static function refund_check($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $id = (int) ($param['attendeeid'] ?? 0);
        if (!self::ownsTicket($u, $id)) {
            return self::fail('Tiket tidak ditemukan.');
        }
        $chk = Mmrefund::checkTicket($id);
        return self::ok([
            'ok' => (bool) $chk['ok'],
            'reasons' => $chk['reasons'] ?? [],
            'price' => Money::r($chk['price'] ?? 0),
            'deadline' => (string) ($chk['deadline'] ?? ''),
        ]);
    }

    /** Ajukan refund -> T_TICKET_REFUND status DIAJUKAN; diputuskan operator. */
    public static function refund_apply($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        if (!self::rate('ref_' . $u['USERLOGIN'], 10, 3600)) {
            return self::failJson('Terlalu banyak pengajuan refund.', 429);
        }
        $id = (int) ($param['attendeeid'] ?? 0);
        if (!self::ownsTicket($u, $id)) {
            return self::fail('Tiket tidak ditemukan.');
        }
        $reason = trim((string) ($param['reason'] ?? ''));
        if ($reason === '') {
            return self::fail('Alasan refund wajib diisi.');
        }
        $chk = Mmrefund::checkTicket($id);
        if (!$chk['ok']) {
            $msg = 'Syarat refund belum terpenuhi: ' . implode('; ', $chk['reasons'] ?? []);
            return self::fail($msg);
        }
        try {
            $r = Mmrefund::process_apply([
                'VUSERLOGIN' => (string) $u['USERLOGIN'],
                'vdata' => json_encode([
                    'ATTENDEEID' => $id,
                    'REASON' => mb_substr($reason, 0, 200),
                ]),
            ]);
            $decoded = json_decode((string) ($r ?? ''), true);
            if (!is_array($decoded) || strtolower((string) ($decoded['success'] ?? '')) !== 'true') {
                return self::fail((string) ($decoded['message'] ?? 'Pengajuan refund gagal.'));
            }
            self::audit('PORTAL_REFUND_APPLY', (string) $u['USERLOGIN'], ['attendeeid' => $id]);
            return self::ok([], 'Pengajuan refund terkirim. Menunggu keputusan operator.');
        } catch (\Throwable $e) {
            return self::fail('Pengajuan refund gagal.');
        }
    }

    public static function refund_list($param)
    {
        $u = self::who();
        if (!$u) {
            return self::failJson('Silakan masuk terlebih dahulu.', 401);
        }
        $rows = DB::select("
            SELECT R.REFUNDID, R.REFUNDNO, R.TICKETID, R.NOMINAL, R.REASON, R.STATUS,
                   R.DECISIONNOTE, R.REQUESTTIME, A.TICKETCODE, E.TITLE AS EVENTTITLE
            FROM T_TICKET_REFUND R
            JOIN T_ATTENDEE A ON A.ATTENDEEID = R.TICKETID
            JOIN T_EVENT E ON E.EVENTID = A.EVENTID
            WHERE A.EMAIL = ?
            ORDER BY R.REFUNDID DESC
        ", [(string) $u['USEREMAIL']]);
        return self::ok(['rows' => array_map(function ($r) {
            $r = (array) $r;
            return [
                'REFUNDID' => (int) $r['REFUNDID'],
                'REFUNDNO' => (string) $r['REFUNDNO'],
                'TICKETCODE' => (string) $r['TICKETCODE'],
                'EVENTTITLE' => (string) $r['EVENTTITLE'],
                'NOMINAL' => Money::r($r['NOMINAL']),
                'REASON' => (string) $r['REASON'],
                'STATUS' => (string) $r['STATUS'],
                'DECISIONNOTE' => (string) ($r['DECISIONNOTE'] ?? ''),
                'REQUESTTIME' => (string) ($r['REQUESTTIME'] ?? ''),
            ];
        }, $rows ?: [])]);
    }

    private static function ownsTicket(array $u, int $attendeeid): bool
    {
        if ($attendeeid <= 0) {
            return false;
        }
        // Kepemilikan dari identitas token (EMAIL akun), bukan parameter.
        return (bool) DB::selectOne("SELECT TOP 1 ATTENDEEID FROM T_ATTENDEE WHERE ATTENDEEID = ? AND EMAIL = ?", [$attendeeid, (string) $u['USEREMAIL']]);
    }
}