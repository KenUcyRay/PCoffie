<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Berita (Content Management, module Marketing). Tabel dbo.T_NEWS.
// SEGMENT frontend: home/mnewsdata/mnewsdata. Menu CPMENU MCONTROL = mnewsdata.
//
// Status: DRAFT/TERJADWAL/TERBIT/DIARSIPKAN. TERJADWAL otomatis TERBIT
// saat diakses (lazy, tanpa scheduler). Slug beku setelah pernah terbit.
// Hapus permanen hanya DRAFT yang belum pernah terbit.
class Mmnewsdata extends Model
{
    use ColumnFilter;

    const MCODE = 60020002;

    const IMAGE_DIR = 'uploads/news';
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
    const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    const IMAGE_MAX = 2097152; // 2MB (sama seperti upload lain)

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'NEWSID' => 'A.NEWSID',
            'TITLE' => 'A.TITLE',
            'STATUS' => 'A.STATUS',
            'PUBLISHEDAT' => 'A.PUBLISHEDAT',
            'VIEWCOUNT' => 'A.VIEWCOUNT',
        ];
    }

    // Tolak bila group user tidak punya akses menu News Data.
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

    // TERJADWAL otomatis TERBIT saat waktunya tiba (lazy, tanpa scheduler).
    public static function applyPublishLazy(): void
    {
        try {
            DB::update("
                UPDATE T_NEWS
                SET STATUS = 'TERBIT', PUBLISHEDAT = SCHEDULEDAT,
                    EVERPUBLISHED = 'YES', SYSUPDATEDATE = GETDATE()
                WHERE STATUS = 'TERJADWAL'
                  AND SCHEDULEDAT IS NOT NULL AND SCHEDULEDAT <= GETDATE()
            ");
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal menerbitkan berita terjadwal otomatis.', [], $e);
        }
    }

    // Slug otomatis dari judul + angka (unik, retry bila tabrakan).
    private static function genSlug(string $title, $excludeId = null): string
    {
        $base = strtolower(trim((string) $title));
        $base = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $base) ?: $base;
        $base = preg_replace('/[^a-z0-9]+/', '-', $base);
        $base = trim((string) $base, '-');
        if ($base === '') {
            $base = 'berita';
        }
        $base = substr($base, 0, 120);
        for ($i = 0; $i < 50; $i++) {
            $slug = $i === 0 ? $base : $base . '-' . $i;
            $sql = "SELECT 1 AS X FROM T_NEWS WHERE SLUG = ?";
            $args = [$slug];
            if (!empty($excludeId)) {
                $sql .= " AND NEWSID <> ?";
                $args[] = $excludeId;
            }
            if (!DB::selectOne($sql, $args)) {
                return $slug;
            }
        }
        return $base . '-' . bin2hex(random_bytes(3));
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyPublishLazy();

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $cat = trim((string) ($param['catcode'] ?? ''));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.TITLE LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like];
        }
        if ($status !== '' && in_array($status, ['DRAFT', 'TERJADWAL', 'TERBIT', 'DIARSIPKAN'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($cat !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.NEWSCATCODE = ?';
            $args[] = $cat;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_NEWS A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.NEWSID DESC';

        $sql = "
            SELECT A.NEWSID, A.TITLE, A.SLUG, A.MAINIMAGE, A.NEWSCATCODE,
                   C.CATNAME, A.STATUS, A.PUBLISHEDAT, A.SCHEDULEDAT,
                   A.AUTHORLOGIN, A.VIEWCOUNT
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            " . $where . "
            ORDER BY " . $order . "
        ";
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

    // Ringkasan: jumlah per status.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyPublishLazy();

        $row = DB::selectOne("
            SELECT COUNT(*) AS TOTAL,
                   ISNULL(SUM(CASE WHEN A.STATUS = 'DRAFT' THEN 1 ELSE 0 END), 0) AS DRAFT,
                   ISNULL(SUM(CASE WHEN A.STATUS = 'TERJADWAL' THEN 1 ELSE 0 END), 0) AS TERJADWAL,
                   ISNULL(SUM(CASE WHEN A.STATUS = 'TERBIT' THEN 1 ELSE 0 END), 0) AS TERBIT,
                   ISNULL(SUM(CASE WHEN A.STATUS = 'DIARSIPKAN' THEN 1 ELSE 0 END), 0) AS DIARSIPKAN
            FROM T_NEWS A
        ");

        return json_encode(['success' => true, 'Rows' => [[
            'TOTAL' => $row ? (int) $row->TOTAL : 0,
            'DRAFT' => $row ? (int) $row->DRAFT : 0,
            'TERJADWAL' => $row ? (int) $row->TERJADWAL : 0,
            'TERBIT' => $row ? (int) $row->TERBIT : 0,
            'DIARSIPKAN' => $row ? (int) $row->DIARSIPKAN : 0,
        ]]]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyPublishLazy();

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, C.CATNAME
            FROM T_NEWS A
            LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
            WHERE A.NEWSID = ?
        ", [$id]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data berita tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. Return pesan error atau null bila lolos.
    private static function validate($vdata): ?string
    {
        $title = trim((string) ($vdata['TITLE'] ?? ''));
        $summary = trim((string) ($vdata['SUMMARY'] ?? ''));
        $body = trim((string) ($vdata['BODY'] ?? ''));
        $cat = trim((string) ($vdata['NEWSCATCODE'] ?? ''));

        if ($title === '') {
            return 'Judul wajib diisi.';
        }
        if (mb_strlen($title) > 150) {
            return 'Judul maksimal 150 karakter.';
        }
        if (mb_strlen($summary) > 300) {
            return 'Ringkasan maksimal 300 karakter.';
        }
        if ($body === '') {
            return 'Isi wajib diisi.';
        }
        if ($cat === '') {
            return 'Kategori wajib diisi.';
        }
        $catRow = DB::selectOne("SELECT CATCODE FROM T_NEWS_CATEGORY WHERE UPPER(CATCODE) = UPPER(?)", [$cat]);
        if (!$catRow) {
            return 'Kategori tidak ditemukan.';
        }
        $catActive = DB::selectOne("SELECT 1 AS X FROM T_NEWS_CATEGORY WHERE UPPER(CATCODE) = UPPER(?) AND UPPER(CATACTIVE) = 'YES'", [$cat]);
        if (!$catActive) {
            return 'Kategori sudah nonaktif.';
        }
        $evcat = trim((string) ($vdata['EVENTCATCODE'] ?? ''));
        if ($evcat !== '') {
            $evcatRow = DB::selectOne("SELECT CATCODE FROM T_CATEGORY WHERE UPPER(CATCODE) = UPPER(?)", [$evcat]);
            if (!$evcatRow) {
                return 'Kategori event tidak ditemukan.';
            }
        }
        $eventid = trim((string) ($vdata['EVENTID'] ?? ''));
        if ($eventid !== '') {
            if (filter_var($eventid, FILTER_VALIDATE_INT) === false) {
                return 'Event tidak valid.';
            }
            $ev = DB::selectOne("SELECT EVENTID FROM T_EVENT WHERE EVENTID = ?", [(int) $eventid]);
            if (!$ev) {
                return 'Event terkait tidak ditemukan.';
            }
        }
        return null;
    }

    private static function nullInt($v)
    {
        $v = trim((string) ($v ?? ''));
        if ($v === '' || filter_var($v, FILTER_VALIDATE_INT) === false) {
            return null;
        }
        return (int) $v;
    }

    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $by = $param['VUSERLOGIN'] ?? '';
        $user = $by !== '' ? DB::selectOne("SELECT USERID FROM CPUSER WHERE USERLOGIN = ?", [$by]) : null;
        $title = trim((string) $vdata['TITLE']);
        $slug = self::genSlug($title);

        DB::insert("
            INSERT INTO T_NEWS
                (TITLE, SLUG, SUMMARY, BODY, MAINIMAGE, NEWSCATCODE, EVENTCATCODE,
                 EVENTID, STATUS, AUTHORID, AUTHORLOGIN, VIEWCOUNT, EVERPUBLISHED,
                 SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?,
                 ?, 'DRAFT', ?, ?, 0, 'NO',
                 ?, GETDATE())
        ", [
            $title, $slug,
            mb_substr(trim((string) ($vdata['SUMMARY'] ?? '')), 0, 300),
            NewsHtml::sanitize((string) ($vdata['BODY'] ?? '')),
            mb_substr(trim((string) ($vdata['MAINIMAGE'] ?? '')), 0, 255),
            trim($vdata['NEWSCATCODE']),
            trim((string) ($vdata['EVENTCATCODE'] ?? '')) !== '' ? trim($vdata['EVENTCATCODE']) : null,
            self::nullInt($vdata['EVENTID'] ?? ''),
            $user ? (int) $user->USERID : null, $by !== '' ? mb_substr($by, 0, 25) : null,
            $by !== '' ? mb_substr($by, 0, 25) : null,
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mnewsdata', 'page' => 'News Data',
            'table' => 'T_NEWS', 'dataId' => $slug, 'summary' => 'NEWS ' . $slug,
            'before' => [],
            'after' => ['TITLE' => $title, 'STATUS' => 'DRAFT'],
            'userlogin' => $by,
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Berita berhasil dibuat.',
            'Rows' => [['NEWSID' => $id, 'SLUG' => $slug]],
        ]);
    }

    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $before = DB::selectOne("SELECT * FROM T_NEWS WHERE NEWSID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data berita tidak ditemukan.']);
        }
        // Slug beku setelah pernah terbit (walau judul diubah).
        $slug = strtoupper(trim((string) ($before->EVERPUBLISHED ?? 'NO'))) === 'YES'
            ? (string) $before->SLUG
            : self::genSlug(trim((string) $vdata['TITLE']), (int) $id);

        DB::update("
            UPDATE T_NEWS
            SET TITLE = ?, SLUG = ?, SUMMARY = ?, BODY = ?, MAINIMAGE = ?,
                NEWSCATCODE = ?, EVENTCATCODE = ?, EVENTID = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE NEWSID = ?
        ", [
            trim((string) $vdata['TITLE']), $slug,
            mb_substr(trim((string) ($vdata['SUMMARY'] ?? '')), 0, 300),
            NewsHtml::sanitize((string) ($vdata['BODY'] ?? '')),
            mb_substr(trim((string) ($vdata['MAINIMAGE'] ?? '')), 0, 255),
            trim($vdata['NEWSCATCODE']),
            trim((string) ($vdata['EVENTCATCODE'] ?? '')) !== '' ? trim($vdata['EVENTCATCODE']) : null,
            self::nullInt($vdata['EVENTID'] ?? ''),
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mnewsdata', 'page' => 'News Data',
            'table' => 'T_NEWS', 'dataId' => $slug,
            'summary' => 'NEWS ' . $slug,
            'before' => (array) $before,
            'after' => ['TITLE' => trim((string) $vdata['TITLE'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Berita berhasil diupdate.']);
    }

    // Ubah status generik (transisi divalidasi). Return JSON string.
    private static function setStatus(int $id, string $from, string $to, $extra, string $by, string $verb): string
    {
        $row = DB::selectOne("SELECT NEWSID, SLUG, TITLE, STATUS FROM T_NEWS WHERE NEWSID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data berita tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== $from) {
            return json_encode(['success' => 'false', 'message' => 'Hanya berita ' . $from . ' yang bisa ' . $verb . '.']);
        }

        $set = "STATUS = ?";
        $args = [$to];
        if ($to === 'TERBIT') {
            $set .= ", PUBLISHEDAT = GETDATE(), EVERPUBLISHED = 'YES'";
        }
        if ($to === 'TERJADWAL') {
            $set .= ", SCHEDULEDAT = ?";
            $args[] = $extra; // Y-m-d H:i:s
        }
        if ($to === 'DRAFT' && $from === 'TERBIT') {
            $set .= ", SCHEDULEDAT = NULL";
        }
        $set .= ", SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()";
        $args[] = $by !== '' ? mb_substr($by, 0, 25) : null;
        $args[] = $id;

        DB::update("UPDATE T_NEWS SET " . $set . " WHERE NEWSID = ?", $args);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mnewsdata', 'page' => 'News Data',
            'table' => 'T_NEWS', 'dataId' => (string) ($row->SLUG ?? $id),
            'summary' => 'NEWS ' . (string) ($row->SLUG ?? $id) . ' -> ' . $to,
            'before' => ['STATUS' => $from],
            'after' => ['STATUS' => $to],
            'userlogin' => $by,
        ]);

        return json_encode(['success' => 'true', 'message' => 'Berita ' . strtolower($verb) . '.']);
    }

    // Terbitkan: hanya dari DRAFT.
    public static function process_publish($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        return self::setStatus((int) $id, 'DRAFT', 'TERBIT', null, $param['VUSERLOGIN'] ?? '', 'diterbitkan');
    }

    // Jadwalkan: hanya dari DRAFT + jadwal di masa depan.
    public static function process_schedule($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;
        $atRaw = trim((string) ($vdata['SCHEDULEDAT'] ?? ''));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }
        if ($atRaw === '' || ($ts = strtotime($atRaw)) === false) {
            return json_encode(['success' => 'false', 'message' => 'Jadwal terbit tidak valid.']);
        }
        if ($ts <= time()) {
            return json_encode(['success' => 'false', 'message' => 'Jadwal terbit harus di masa depan.']);
        }

        return self::setStatus((int) $id, 'DRAFT', 'TERJADWAL', date('Y-m-d H:i:s', $ts), $param['VUSERLOGIN'] ?? '', 'dijadwalkan');
    }

    // Tarik kembali: TERBIT -> DRAFT.
    public static function process_retract($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        return self::setStatus((int) $id, 'TERBIT', 'DRAFT', null, $param['VUSERLOGIN'] ?? '', 'ditarik ke draft');
    }

    // Arsipkan: TERBIT -> DIARSIPKAN.
    public static function process_archive($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        return self::setStatus((int) $id, 'TERBIT', 'DIARSIPKAN', null, $param['VUSERLOGIN'] ?? '', 'diarsipkan');
    }

    // Kembalikan: DIARSIPKAN -> DRAFT.
    public static function process_restore($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        return self::setStatus((int) $id, 'DIARSIPKAN', 'DRAFT', null, $param['VUSERLOGIN'] ?? '', 'dikembalikan ke draft');
    }

    // Hapus: hanya DRAFT yang belum pernah terbit.
    public static function process_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['NEWSID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'NEWSID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT NEWSID, SLUG, TITLE, STATUS, EVERPUBLISHED, MAINIMAGE FROM T_NEWS WHERE NEWSID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data berita tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DRAFT'
            || strtoupper(trim((string) ($row->EVERPUBLISHED ?? 'NO'))) === 'YES') {
            return json_encode(['success' => 'false', 'message' => 'Hanya DRAFT yang belum pernah terbit yang bisa dihapus. Arsipkan saja.']);
        }

        DB::delete("DELETE FROM T_NEWS WHERE NEWSID = ?", [$id]);
        self::pruneImage((string) ($row->MAINIMAGE ?? ''));

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mnewsdata', 'page' => 'News Data',
            'table' => 'T_NEWS', 'dataId' => (string) ($row->SLUG ?? $id),
            'summary' => 'NEWS ' . (string) ($row->SLUG ?? $id),
            'before' => (array) $row,
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Berita berhasil dihapus.']);
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen). Sama seperti Mcppaymentmethod.
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload gambar utama. Dipanggil via multipart (field 'image'), bukan JSON.
    // Return {success, path, message}. Path relatif dari public/.
    public static function upload_image($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $file = $param['image'] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File gambar tidak ditemukan.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, self::IMAGE_EXTS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Gambar hanya boleh JPG, PNG, atau WebP.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, self::IMAGE_MIMES, true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file bukan gambar yang valid.']);
        }
        if ($file->getSize() > self::IMAGE_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran gambar maksimal 2MB.']);
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, self::IMAGE_DIR);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $name = 'news_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $file->move($dir, $name);

        return json_encode([
            'success' => 'true',
            'path' => self::IMAGE_DIR . '/' . $name,
            'message' => 'Gambar berhasil diupload.',
        ]);
    }

    // Hapus file gambar lama (best-effort, hanya dalam folder upload).
    private static function pruneImage(?string $old): void
    {
        $old = trim((string) $old);
        if ($old === '') {
            return;
        }
        if (strpos($old, self::IMAGE_DIR . '/') !== 0 || strpos($old, '..') !== false) {
            return;
        }
        $file = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $old);
        if (is_file($file)) {
            @unlink($file);
        }
    }
}
