<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Data event (Event Management, module Event). Tabel dbo.T_EVENT.
// SEGMENT frontend: home/meventdata/meventdata. Menu CPMENU MCONTROL = meventdata.
//
// Status: DRAFT/PUBLISHED/ENDED/CANCELLED. ENDED otomatis (lazy) saat ENDAT
// terlewat. Publish/unpublish/batalkan/duplikat/hapus mengikuti aturan
// transisi di bawah; transisi tidak valid ditolak dengan pesan jelas.
// Terjual DIHITUNG dari T_ATTENDEE aktif+lunas (tanpa kolom jumlah).
class Mmeventdata extends Model
{
    use ColumnFilter;

    const MCODE = 30010002;

    const POSTER_DIR = 'uploads/event';
    const POSTER_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
    const POSTER_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    const POSTER_MAX = 2097152; // 2MB (sama seperti logo payment)

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'EVENTID' => 'A.EVENTID',
            'EVENTCODE' => 'A.EVENTCODE',
            'TITLE' => 'A.TITLE',
            'STATUS' => 'A.STATUS',
            'STARTAT' => 'A.STARTAT',
            'CITYCODE' => 'A.CITYCODE',
            'CATCODE' => 'A.CATCODE',
            'CATNAME' => 'C.CATNAME',
            'CITYNAME' => 'K.CITYNAME',
        ];
    }

    // Tolak bila group user tidak punya akses menu Event Data.
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

    // ENDED otomatis (lazy): event DRAFT/PUBLISHED yang ENDAT-nya terlewat
    // menjadi ENDED saat data diakses. Tanpa scheduler.
    public static function applyEndedLazy(): void
    {
        try {
            DB::update("
                UPDATE T_EVENT SET STATUS = 'ENDED', SYSUPDATEDATE = GETDATE()
                WHERE STATUS IN ('DRAFT', 'PUBLISHED')
                  AND ENDAT IS NOT NULL AND ENDAT <= GETDATE()
            ");
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal menandai event ENDED otomatis.', [], $e);
        }
    }

    // Agregat kuota (tipe aktif) + terjual (peserta aktif+lunas) per event.
    private static function salesJoin(): string
    {
        return " LEFT JOIN (
            SELECT EVENTID, SUM(QUOTA) AS QUOTA
            FROM T_TICKET_TYPE WHERE ISACTIVE = 'YES' GROUP BY EVENTID
        ) Q ON Q.EVENTID = A.EVENTID
        LEFT JOIN (
            SELECT EVENTID, COUNT(*) AS SOLD
            FROM T_ATTENDEE
            WHERE TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
            GROUP BY EVENTID
        ) S ON S.EVENTID = A.EVENTID";
    }

    // Jumlah peserta (semua status tiket) satu event.
    private static function attendeeCount(int $eventid): int
    {
        $row = DB::selectOne("SELECT COUNT(*) AS C FROM T_ATTENDEE WHERE EVENTID = ?", [$eventid]);
        return $row ? (int) $row->C : 0;
    }

    private static function typeCount(int $eventid, bool $activeOnly): int
    {
        $row = DB::selectOne(
            "SELECT COUNT(*) AS C FROM T_TICKET_TYPE WHERE EVENTID = ?" . ($activeOnly ? " AND ISACTIVE = 'YES'" : ""),
            [$eventid]
        );
        return $row ? (int) $row->C : 0;
    }

    // Syarat publish yang belum terpenuhi. [] = siap publish.
    private static function missingForPublish($row): array
    {
        $missing = [];
        if (trim((string) ($row->POSTER ?? '')) === '') {
            $missing[] = 'Poster belum diupload.';
        }
        if (empty($row->STARTAT) || empty($row->ENDAT)) {
            $missing[] = 'Jadwal mulai dan selesai belum lengkap.';
        } elseif (strtotime((string) $row->ENDAT) < strtotime((string) $row->STARTAT)) {
            $missing[] = 'Tanggal selesai sebelum tanggal mulai.';
        }
        if (self::typeCount((int) $row->EVENTID, true) < 1) {
            $missing[] = 'Belum punya tipe tiket aktif.';
        }
        return $missing;
    }

    // Kode event otomatis: EV-YYYYMMDD-XXXX (unik, retry bila tabrakan).
    private static function genCode(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $code = 'EV-' . date('Ymd') . '-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $hit = DB::selectOne("SELECT 1 AS X FROM T_EVENT WHERE EVENTCODE = ?", [$code]);
            if (!$hit) {
                return $code;
            }
        }
        return 'EV-' . date('YmdHis') . '-' . bin2hex(random_bytes(3));
    }

    // Slug otomatis dari judul + angka (unik, retry bila tabrakan).
    private static function genSlug(string $title, ?int $excludeId = null): string
    {
        $base = strtolower(trim((string) $title));
        $base = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $base) ?: $base;
        $base = preg_replace('/[^a-z0-9]+/', '-', $base);
        $base = trim((string) $base, '-');
        if ($base === '') {
            $base = 'event';
        }
        $base = substr($base, 0, 120);
        for ($i = 0; $i < 50; $i++) {
            $slug = $i === 0 ? $base : $base . '-' . $i;
            $sql = "SELECT 1 AS X FROM T_EVENT WHERE SLUG = ?";
            $args = [$slug];
            if ($excludeId) {
                $sql .= " AND EVENTID <> ?";
                $args[] = $excludeId;
            }
            if (!DB::selectOne($sql, $args)) {
                return $slug;
            }
        }
        return $base . '-' . bin2hex(random_bytes(3));
    }

    // Susun WHERE daftar event. Return [$where, $args] atau pesan error.
    private static function buildWhere($param)
    {
        $q = trim((string) ($param['q'] ?? ''));
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        $cat = trim((string) ($param['catcode'] ?? ''));
        $city = trim((string) ($param['citycode'] ?? ''));
        $dateFrom = trim((string) ($param['date_from'] ?? ''));
        $dateTo = trim((string) ($param['date_to'] ?? ''));

        if ($dateFrom !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) {
            return ['__ERROR__Format tanggal harus YYYY-MM-DD.', []];
        }
        if ($dateTo !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            return ['__ERROR__Format tanggal harus YYYY-MM-DD.', []];
        }
        if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) {
            return ['__ERROR__Tanggal mulai tidak boleh sesudah tanggal akhir.', []];
        }

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.TITLE LIKE ? OR A.EVENTCODE LIKE ? OR A.VENUE LIKE ? OR A.ORGNAME LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like, $like, $like];
        }
        if ($status !== '' && in_array($status, ['DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.STATUS = ?';
            $args[] = $status;
        }
        if ($cat !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CATCODE = ?';
            $args[] = $cat;
        }
        if ($city !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.CITYCODE = ?';
            $args[] = $city;
        }
        if ($dateFrom !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'CAST(A.STARTAT AS DATE) >= ?';
            $args[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'CAST(A.STARTAT AS DATE) <= ?';
            $args[] = $dateTo;
        }

        return [$where, $args];
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyEndedLazy();

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;

        [$where, $args] = self::buildWhere($param);
        if (strpos($where, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($where, 9)]);
        }

        // Filter per kolom grid (DataTable) digabung.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);
        if ($fWhere !== '') {
            $where .= ($where === '' ? ' WHERE 1=1' : '') . $fWhere;
            $args = array_merge($args, $fArgs);
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_EVENT A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default terbaru dulu.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.STARTAT DESC, A.EVENTID DESC';

        $sql = "
            SELECT A.EVENTID, A.EVENTCODE, A.SLUG, A.TITLE, A.CATCODE, A.CITYCODE,
                   C.CATNAME, K.CITYNAME,
                   A.VENUE, A.STARTAT, A.ENDAT, A.POSTER, A.ORGNAME, A.STATUS,
                   ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD
            FROM T_EVENT A
            LEFT JOIN T_CATEGORY C ON C.CATCODE = A.CATCODE
            LEFT JOIN T_CITY K ON K.CITYCODE = A.CITYCODE
            " . self::salesJoin() . "
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

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyEndedLazy();

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.*, ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD
            FROM T_EVENT A
            " . self::salesJoin() . "
            WHERE A.EVENTID = ?
        ", [$id]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Daftar event untuk dropdown halaman lain (kode, judul, tanggal, status).
    // open_only=YES (default): hanya yang belum selesai (DRAFT/PUBLISHED).
    public static function read_dropdown($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        self::applyEndedLazy();

        $q = trim((string) ($param['q'] ?? ''));
        $openOnly = strtoupper(trim((string) ($param['open_only'] ?? 'YES'))) !== 'NO';

        $where = $openOnly ? " WHERE A.STATUS IN ('DRAFT', 'PUBLISHED')" : '';
        $args = [];
        if ($q !== '') {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . '(A.TITLE LIKE ? OR A.EVENTCODE LIKE ?)';
            $args = ['%' . $q . '%', '%' . $q . '%'];
        }

        $result = DB::select("
            SELECT TOP 100 A.EVENTID, A.EVENTCODE, A.TITLE, A.STARTAT, A.STATUS
            FROM T_EVENT A
            " . $where . "
            ORDER BY A.STARTAT DESC, A.EVENTID DESC
        ", $args);

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    // Validasi form tambah/ubah. $isNew = cek tanggal mulai tidak boleh lampau.
    // Return pesan error atau null bila lolos.
    private static function validate($vdata, bool $isNew): ?string
    {
        $title = trim((string) ($vdata['TITLE'] ?? ''));
        $cat = trim((string) ($vdata['CATCODE'] ?? ''));
        $city = trim((string) ($vdata['CITYCODE'] ?? ''));
        $venue = trim((string) ($vdata['VENUE'] ?? ''));
        $address = trim((string) ($vdata['ADDRESS'] ?? ''));
        $startRaw = trim((string) ($vdata['STARTAT'] ?? ''));
        $endRaw = trim((string) ($vdata['ENDAT'] ?? ''));
        $org = trim((string) ($vdata['ORGNAME'] ?? ''));

        if ($title === '') {
            return 'Judul wajib diisi.';
        }
        if (mb_strlen($title) > 150) {
            return 'Judul maksimal 150 karakter.';
        }
        if ($cat === '') {
            return 'Kategori wajib diisi.';
        }
        $catRow = DB::selectOne("SELECT CATCODE FROM T_CATEGORY WHERE UPPER(CATCODE) = UPPER(?)", [$cat]);
        if (!$catRow) {
            return 'Kategori tidak ditemukan.';
        }
        $catActive = DB::selectOne("SELECT 1 AS X FROM T_CATEGORY WHERE UPPER(CATCODE) = UPPER(?) AND UPPER(CATACTIVE) = 'YES'", [$cat]);
        if (!$catActive) {
            return 'Kategori sudah nonaktif.';
        }
        if ($city === '') {
            return 'Kota wajib diisi.';
        }
        $cityRow = DB::selectOne("SELECT CITYCODE FROM T_CITY WHERE UPPER(CITYCODE) = UPPER(?)", [$city]);
        if (!$cityRow) {
            return 'Kota tidak ditemukan.';
        }
        $cityActive = DB::selectOne("SELECT 1 AS X FROM T_CITY WHERE UPPER(CITYCODE) = UPPER(?) AND UPPER(CITYACTIVE) = 'YES'", [$city]);
        if (!$cityActive) {
            return 'Kota sudah nonaktif.';
        }
        if ($venue === '') {
            return 'Venue wajib diisi.';
        }
        if (mb_strlen($venue) > 150) {
            return 'Venue maksimal 150 karakter.';
        }
        if ($address === '') {
            return 'Alamat venue wajib diisi.';
        }
        if (mb_strlen($address) > 500) {
            return 'Alamat maksimal 500 karakter.';
        }
        if ($startRaw === '' || ($startTs = strtotime($startRaw)) === false) {
            return 'Tanggal mulai tidak valid.';
        }
        if ($endRaw === '' || ($endTs = strtotime($endRaw)) === false) {
            return 'Tanggal selesai tidak valid.';
        }
        if ($endTs < $startTs) {
            return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
        }
        if ($isNew && date('Y-m-d', $startTs) < date('Y-m-d')) {
            return 'Tanggal mulai event baru tidak boleh di masa lalu.';
        }
        if ($org === '') {
            return 'Nama penyelenggara wajib diisi.';
        }
        if (mb_strlen($org) > 100) {
            return 'Nama penyelenggara maksimal 100 karakter.';
        }
        $contact = trim((string) ($vdata['ORGCONTACT'] ?? ''));
        if (mb_strlen($contact) > 100) {
            return 'Kontak penyelenggara maksimal 100 karakter.';
        }
        if ($contact !== '' && strpos($contact, '@') !== false && filter_var($contact, FILTER_VALIDATE_EMAIL) === false) {
            return 'Kontak email penyelenggara tidak valid.';
        }
        foreach (['LATITUDE' => [-90, 90, 'Latitude'], 'LONGITUDE' => [-180, 180, 'Longitude']] as $k => $rule) {
            $raw = trim((string) ($vdata[$k] ?? ''));
            if ($raw === '') {
                continue;
            }
            if (!is_numeric($raw) || (float) $raw < $rule[0] || (float) $raw > $rule[1]) {
                return $rule[2] . ' harus antara ' . $rule[0] . ' dan ' . $rule[1] . '.';
            }
        }
        if (mb_strlen((string) ($vdata['DESCR'] ?? '')) > 10000) {
            return 'Deskripsi maksimal 10000 karakter.';
        }
        if (mb_strlen((string) ($vdata['TERMS'] ?? '')) > 10000) {
            return 'Syarat dan ketentuan maksimal 10000 karakter.';
        }
        return null;
    }

    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validate($vdata, true);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $code = self::genCode();
        $title = trim((string) $vdata['TITLE']);
        $slug = self::genSlug($title);

        DB::insert("
            INSERT INTO T_EVENT
                (EVENTCODE, SLUG, TITLE, DESCR, CATCODE, CITYCODE, VENUE, ADDRESS,
                 LATITUDE, LONGITUDE, STARTAT, ENDAT, POSTER, ORGNAME, ORGCONTACT,
                 TERMS, STATUS, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?,
                 ?, 'DRAFT', ?, GETDATE())
        ", [
            $code, $slug, $title,
            mb_substr(trim(strip_tags((string) ($vdata['DESCR'] ?? ''))), 0, 10000),
            trim($vdata['CATCODE']), trim($vdata['CITYCODE']),
            trim($vdata['VENUE']), trim($vdata['ADDRESS']),
            trim((string) ($vdata['LATITUDE'] ?? '')) === '' ? null : (float) trim($vdata['LATITUDE']),
            trim((string) ($vdata['LONGITUDE'] ?? '')) === '' ? null : (float) trim($vdata['LONGITUDE']),
            date('Y-m-d H:i:s', strtotime(trim($vdata['STARTAT']))),
            date('Y-m-d H:i:s', strtotime(trim($vdata['ENDAT']))),
            mb_substr(trim((string) ($vdata['POSTER'] ?? '')), 0, 255),
            trim($vdata['ORGNAME']), mb_substr(trim((string) ($vdata['ORGCONTACT'] ?? '')), 0, 100),
            mb_substr(trim(strip_tags((string) ($vdata['TERMS'] ?? ''))), 0, 10000),
            $param['VUSERLOGIN'] ?? '',
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => $code, 'summary' => 'EVENT ' . $code . ' ' . $title,
            'before' => [],
            'after' => ['EVENTCODE' => $code, 'TITLE' => $title, 'STATUS' => 'DRAFT'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Event berhasil dibuat.',
            'Rows' => [['EVENTID' => $id, 'EVENTCODE' => $code]],
        ]);
    }

    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $before = DB::selectOne("SELECT * FROM T_EVENT WHERE EVENTID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        $st = strtoupper(trim((string) $before->STATUS));
        if ($st === 'ENDED' || $st === 'CANCELLED') {
            return json_encode(['success' => 'false', 'message' => 'Event ' . $st . ' tidak bisa diubah.']);
        }

        $err = self::validate($vdata, false);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $title = trim((string) $vdata['TITLE']);
        $slug = self::genSlug($title, (int) $id);

        DB::update("
            UPDATE T_EVENT
            SET TITLE = ?, SLUG = ?, DESCR = ?, CATCODE = ?, CITYCODE = ?,
                VENUE = ?, ADDRESS = ?, LATITUDE = ?, LONGITUDE = ?,
                STARTAT = ?, ENDAT = ?, POSTER = ?, ORGNAME = ?, ORGCONTACT = ?,
                TERMS = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE EVENTID = ?
        ", [
            $title, $slug,
            mb_substr(trim(strip_tags((string) ($vdata['DESCR'] ?? ''))), 0, 10000),
            trim($vdata['CATCODE']), trim($vdata['CITYCODE']),
            trim($vdata['VENUE']), trim($vdata['ADDRESS']),
            trim((string) ($vdata['LATITUDE'] ?? '')) === '' ? null : (float) trim($vdata['LATITUDE']),
            trim((string) ($vdata['LONGITUDE'] ?? '')) === '' ? null : (float) trim($vdata['LONGITUDE']),
            date('Y-m-d H:i:s', strtotime(trim($vdata['STARTAT']))),
            date('Y-m-d H:i:s', strtotime(trim($vdata['ENDAT']))),
            mb_substr(trim((string) ($vdata['POSTER'] ?? '')), 0, 255),
            trim($vdata['ORGNAME']), mb_substr(trim((string) ($vdata['ORGCONTACT'] ?? '')), 0, 100),
            mb_substr(trim(strip_tags((string) ($vdata['TERMS'] ?? ''))), 0, 10000),
            $param['VUSERLOGIN'] ?? '', $id,
        ]);

        // Prune poster lama bila diganti.
        self::prunePoster((string) ($before->POSTER ?? ''), trim((string) ($vdata['POSTER'] ?? '')));

        // Perubahan kategori/jadwal/venue pada PUBLISHED berpeserta tercatat
        // eksplisit (di luar before/after penuh) supaya mudah dibaca.
        $note = [];
        if ($st === 'PUBLISHED' && self::attendeeCount((int) $id) > 0) {
            foreach (['CATCODE' => 'Kategori', 'CITYCODE' => 'Kota', 'VENUE' => 'Venue', 'ADDRESS' => 'Alamat', 'STARTAT' => 'Mulai', 'ENDAT' => 'Selesai'] as $col => $label) {
                $old = trim((string) ($before->$col ?? ''));
                $new = trim((string) ($vdata[$col] ?? $old));
                if ($col === 'STARTAT' || $col === 'ENDAT') {
                    $old = $old !== '' ? date('Y-m-d H:i:s', strtotime($old)) : '';
                    $new = date('Y-m-d H:i:s', strtotime(trim($vdata[$col])));
                }
                if ($old !== $new) {
                    $note[] = $label . ': ' . ($old === '' ? '-' : $old) . ' -> ' . ($new === '' ? '-' : $new);
                }
            }
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => (string) ($before->EVENTCODE ?? $id),
            'summary' => 'EVENT ' . (string) ($before->EVENTCODE ?? $id) . ($note ? ' [' . implode('; ', $note) . ']' : ''),
            'before' => (array) $before,
            'after' => ['TITLE' => $title, 'CATCODE' => trim($vdata['CATCODE']), 'CITYCODE' => trim($vdata['CITYCODE']), 'STATUS' => $st],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Event berhasil diupdate.']);
    }

    // Publish: hanya dari DRAFT + syarat lengkap. Return daftar kurang bila belum.
    public static function process_publish($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        self::applyEndedLazy();
        $row = DB::selectOne("SELECT * FROM T_EVENT WHERE EVENTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DRAFT') {
            return json_encode(['success' => 'false', 'message' => 'Hanya event DRAFT yang bisa dipublish.']);
        }

        $missing = self::missingForPublish($row);
        if (!empty($missing)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Belum bisa publish. Yang kurang: ' . implode(' ', $missing),
                'Rows' => [['MISSING' => $missing]],
            ]);
        }

        DB::update("
            UPDATE T_EVENT
            SET STATUS = 'PUBLISHED', PUBLISHEDAT = GETDATE(),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE EVENTID = ?
        ", [$param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => (string) ($row->EVENTCODE ?? $id),
            'summary' => 'EVENT ' . (string) ($row->EVENTCODE ?? $id) . ' -> PUBLISHED',
            'before' => ['STATUS' => 'DRAFT'],
            'after' => ['STATUS' => 'PUBLISHED'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Event berhasil dipublish.']);
    }

    // Unpublish (kembali DRAFT): hanya dari PUBLISHED yang belum ada peserta.
    public static function process_unpublish($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT EVENTID, EVENTCODE, STATUS FROM T_EVENT WHERE EVENTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'PUBLISHED') {
            return json_encode(['success' => 'false', 'message' => 'Hanya event PUBLISHED yang bisa di-unpublish.']);
        }
        $n = self::attendeeCount((int) $id);
        if ($n > 0) {
            return json_encode(['success' => 'false', 'message' => 'Event sudah punya ' . $n . ' peserta, tidak bisa di-unpublish. Batalkan saja.']);
        }

        DB::update("
            UPDATE T_EVENT
            SET STATUS = 'DRAFT', PUBLISHEDAT = NULL,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE EVENTID = ?
        ", [$param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => (string) ($row->EVENTCODE ?? $id),
            'summary' => 'EVENT ' . (string) ($row->EVENTCODE ?? $id) . ' -> DRAFT',
            'before' => ['STATUS' => 'PUBLISHED'],
            'after' => ['STATUS' => 'DRAFT'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Event dikembalikan ke DRAFT.']);
    }

    // Batalkan: dari PUBLISHED, alasan wajib. Pengembalian dana urusan module lain.
    public static function process_cancel($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;
        $reason = trim((string) ($vdata['REASON'] ?? ''));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }
        if ($reason === '') {
            return json_encode(['success' => 'false', 'message' => 'Alasan pembatalan wajib diisi.']);
        }
        if (mb_strlen($reason) > 200) {
            return json_encode(['success' => 'false', 'message' => 'Alasan maksimal 200 karakter.']);
        }

        $row = DB::selectOne("SELECT EVENTID, EVENTCODE, STATUS FROM T_EVENT WHERE EVENTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'PUBLISHED') {
            return json_encode(['success' => 'false', 'message' => 'Hanya event PUBLISHED yang bisa dibatalkan.']);
        }

        $n = self::attendeeCount((int) $id);

        DB::update("
            UPDATE T_EVENT
            SET STATUS = 'CANCELLED', CANCELREASON = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE EVENTID = ?
        ", [mb_substr($reason, 0, 200), $param['VUSERLOGIN'] ?? '', $id]);

        $msg = 'Event berhasil dibatalkan.';
        if ($n > 0) {
            $msg .= ' ' . $n . ' peserta terdampak (pengembalian dana ditangani module lain).';
        }

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => (string) ($row->EVENTCODE ?? $id),
            'summary' => 'EVENT ' . (string) ($row->EVENTCODE ?? $id) . ' -> CANCELLED (' . $n . ' peserta)',
            'before' => ['STATUS' => 'PUBLISHED'],
            'after' => ['STATUS' => 'CANCELLED', 'CANCELREASON' => $reason],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Duplikat: salin event + tipe tiketnya sebagai DRAFT baru ("(Salinan)"),
    // tanpa peserta. Transaksi: dua tabel berubah.
    public static function process_duplicate($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $src = DB::selectOne("SELECT * FROM T_EVENT WHERE EVENTID = ?", [$id]);
        if (!$src) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }

        $code = self::genCode();
        $title = trim((string) $src->TITLE) . ' (Salinan)';
        $slug = self::genSlug($title);

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            DB::insert("
                INSERT INTO T_EVENT
                    (EVENTCODE, SLUG, TITLE, DESCR, CATCODE, CITYCODE, VENUE, ADDRESS,
                     LATITUDE, LONGITUDE, STARTAT, ENDAT, POSTER, ORGNAME, ORGCONTACT,
                     TERMS, STATUS, SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?, ?, ?,
                     ?, 'DRAFT', ?, GETDATE())
            ", [
                $code, $slug, mb_substr($title, 0, 150),
                $src->DESCR, $src->CATCODE, $src->CITYCODE, $src->VENUE, $src->ADDRESS,
                $src->LATITUDE, $src->LONGITUDE, $src->STARTAT, $src->ENDAT,
                $src->POSTER, $src->ORGNAME, $src->ORGCONTACT, $src->TERMS,
                $param['VUSERLOGIN'] ?? '',
            ]);
            $newId = (int) $pdo->lastInsertId();

            $types = DB::select("
                SELECT NAME, DESCR, PRICE, QUOTA, MAXPERSON, SALESTART, SALEEND, SORTORDER, ISACTIVE
                FROM T_TICKET_TYPE WHERE EVENTID = ? ORDER BY SORTORDER, TICKETTYPEID
            ", [$id]);
            foreach ($types as $t) {
                DB::insert("
                    INSERT INTO T_TICKET_TYPE
                        (EVENTID, NAME, DESCR, PRICE, QUOTA, MAXPERSON, SALESTART, SALEEND,
                         SORTORDER, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE())
                ", [
                    $newId, $t->NAME, $t->DESCR, $t->PRICE, $t->QUOTA, $t->MAXPERSON,
                    $t->SALESTART, $t->SALEEND, $t->SORTORDER, $t->ISACTIVE,
                    $param['VUSERLOGIN'] ?? '',
                ]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            SysLog::log('ERROR', 'API', 'Gagal menduplikat event.', ['event' => $id], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal menduplikat event. Silakan coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => $code,
            'summary' => 'DUPLIKAT ' . (string) ($src->EVENTCODE ?? $id) . ' -> ' . $code,
            'before' => [],
            'after' => ['EVENTCODE' => $code, 'TITLE' => $title, 'STATUS' => 'DRAFT'],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Event berhasil diduplikat sebagai DRAFT.',
            'Rows' => [['EVENTID' => $newId, 'EVENTCODE' => $code]],
        ]);
    }

    // Hapus: hanya DRAFT yang belum pernah dipublish, tanpa tipe maupun peserta.
    public static function process_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['EVENTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'EVENTID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT EVENTID, EVENTCODE, TITLE, STATUS, PUBLISHEDAT, POSTER FROM T_EVENT WHERE EVENTID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data event tidak ditemukan.']);
        }
        if (strtoupper(trim((string) $row->STATUS)) !== 'DRAFT' || !empty($row->PUBLISHEDAT)) {
            return json_encode(['success' => 'false', 'message' => 'Hanya event DRAFT yang belum pernah dipublish yang bisa dihapus. Batalkan atau arsipkan saja.']);
        }
        if (self::typeCount((int) $id, false) > 0) {
            return json_encode(['success' => 'false', 'message' => 'Event sudah punya tipe tiket, tidak bisa dihapus.']);
        }
        if (self::attendeeCount((int) $id) > 0) {
            return json_encode(['success' => 'false', 'message' => 'Event sudah punya peserta, tidak bisa dihapus.']);
        }

        DB::delete("DELETE FROM T_EVENT WHERE EVENTID = ?", [$id]);
        self::prunePoster((string) ($row->POSTER ?? ''), '');

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'meventdata', 'page' => 'Event Data',
            'table' => 'T_EVENT', 'dataId' => (string) ($row->EVENTCODE ?? $id),
            'summary' => 'EVENT ' . (string) ($row->EVENTCODE ?? $id),
            'before' => (array) $row,
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Event berhasil dihapus.']);
    }

    // Root public/ dihitung dari lokasi file (tanpa helper public_path
    // yang tidak tersedia di Lumen). Sama seperti Mcppaymentmethod.
    private static function publicDir(): string
    {
        return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public';
    }

    // Upload poster. Dipanggil via multipart (field 'poster'), bukan JSON.
    // Return {success, path, message}. Path relatif dari public/.
    public static function upload_poster($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $file = $param['poster'] ?? null;
        if (!$file || !($file instanceof \Illuminate\Http\UploadedFile)) {
            return json_encode(['success' => 'false', 'message' => 'File poster tidak ditemukan.']);
        }
        if (!$file->isValid()) {
            return json_encode(['success' => 'false', 'message' => 'Upload file gagal, coba lagi.']);
        }
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, self::POSTER_EXTS, true)) {
            return json_encode(['success' => 'false', 'message' => 'Poster hanya boleh JPG, PNG, atau WebP.']);
        }
        $mime = strtolower((string) $file->getMimeType());
        if (!in_array($mime, self::POSTER_MIMES, true)) {
            return json_encode(['success' => 'false', 'message' => 'Isi file bukan gambar yang valid.']);
        }
        if ($file->getSize() > self::POSTER_MAX) {
            return json_encode(['success' => 'false', 'message' => 'Ukuran poster maksimal 2MB.']);
        }

        $dir = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, self::POSTER_DIR);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $name = 'evt_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $file->move($dir, $name);

        return json_encode([
            'success' => 'true',
            'path' => self::POSTER_DIR . '/' . $name,
            'message' => 'Poster berhasil diupload.',
        ]);
    }

    // Hapus file poster lama bila diganti/dihapus record. Best-effort, hanya di
    // dalam folder upload (tidak pernah menyentuh path lain).
    private static function prunePoster(?string $old, ?string $now): void
    {
        $old = trim((string) $old);
        $now = trim((string) $now);
        if ($old === '' || $old === $now) {
            return;
        }
        if (strpos($old, self::POSTER_DIR . '/') !== 0 || strpos($old, '..') !== false) {
            return;
        }
        $file = self::publicDir() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $old);
        if (is_file($file)) {
            @unlink($file);
        }
    }
}
