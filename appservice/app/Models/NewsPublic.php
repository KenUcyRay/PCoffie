<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Fungsi bantu berita untuk halaman publik nanti (tanpa halaman admin).
// TANPA cek hak akses menu (dipakai publik). Rate-limit + cegah hitungan
// ganda memakai file kecil di storage (tanpa tabel baru):
//   storage/app/news_view/<md5(sid+newsid)> = timestamp hit terakhir.
//
// Cara pakai dari halaman publik nanti:
//   $list = \App\Models\NewsPublic::published(['cat' => 'INFO', 'limit' => 10]);
//   $one  = \App\Models\NewsPublic::bySlug('jadwal-konser-raya');
//   \App\Models\NewsPublic::hitView($newsid, $sid); // $sid = fingerprint pengunjung
class NewsPublic
{
    // Direktori throttle (dibuat otomatis).
    private static function throttleDir(): string
    {
        try {
            $base = function_exists('storage_path') ? storage_path('app/news_view') : sys_get_temp_dir() . '/tiket-news-view';
        } catch (\Throwable $e) {
            $base = sys_get_temp_dir() . '/tiket-news-view';
        }
        if (!is_dir($base)) {
            @mkdir($base, 0755, true);
        }
        return $base;
    }

    // Daftar berita TERBIT (filter kategori + cari judul + paging).
    // Return ['Rows' => [...], 'TotalRows' => n].
    public static function published(array $opt = []): array
    {
        try {
            Mmnewsdata::applyPublishLazy();

            $limit = isset($opt['limit']) ? max(0, (int) $opt['limit']) : 10;
            $offset = isset($opt['offset']) ? max(0, (int) $opt['offset']) : 0;
            $cat = trim((string) ($opt['cat'] ?? ''));
            $q = trim((string) ($opt['q'] ?? ''));

            $where = " WHERE A.STATUS = 'TERBIT'";
            $args = [];
            if ($cat !== '') {
                $where .= " AND A.NEWSCATCODE = ?";
                $args[] = $cat;
            }
            if ($q !== '') {
                $where .= " AND A.TITLE LIKE ?";
                $args[] = '%' . $q . '%';
            }

            $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_NEWS A" . $where, $args);
            $total = $countRow ? (int) $countRow->TOTAL : 0;

            $sql = "
                SELECT A.NEWSID, A.TITLE, A.SLUG, A.SUMMARY, A.MAINIMAGE,
                       A.NEWSCATCODE, C.CATNAME, A.PUBLISHEDAT, A.VIEWCOUNT
                FROM T_NEWS A
                LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
                " . $where . "
                ORDER BY A.PUBLISHEDAT DESC, A.NEWSID DESC
            ";
            if ($limit > 0) {
                $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
            }

            return ['Rows' => DB::select($sql, $args), 'TotalRows' => $total];
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal membaca berita publik.', [], $e);
            return ['Rows' => [], 'TotalRows' => 0];
        }
    }

    // Satu berita TERBIT berdasarkan slug (null bila tidak ada).
    public static function bySlug(string $slug)
    {
        try {
            Mmnewsdata::applyPublishLazy();

            $row = DB::selectOne("
                SELECT A.NEWSID, A.TITLE, A.SLUG, A.SUMMARY, A.BODY, A.MAINIMAGE,
                       A.NEWSCATCODE, C.CATNAME, A.PUBLISHEDAT, A.VIEWCOUNT,
                       A.AUTHORLOGIN
                FROM T_NEWS A
                LEFT JOIN T_NEWS_CATEGORY C ON C.CATCODE = A.NEWSCATCODE
                WHERE A.SLUG = ? AND A.STATUS = 'TERBIT'
            ", [trim($slug)]);
            return $row ?: null;
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal membaca berita by slug.', [], $e);
            return null;
        }
    }

    // Tambah jumlah dibaca. Cegah hitungan ganda dari sumber sama dalam
    // 10 menit (klik ganda/refresh) + batasi 30 hit/jam per sumber.
    // Return true bila dihitung.
    public static function hitView(int $newsid, string $sid): bool
    {
        try {
            $sid = trim($sid);
            if ($newsid <= 0 || $sid === '') {
                return false;
            }
            $dir = self::throttleDir();
            $f = $dir . DIRECTORY_SEPARATOR . md5($sid . ':' . $newsid) . '.hits';
            $now = time();
            $hits = [];
            if (is_file($f)) {
                $raw = @json_decode((string) @file_get_contents($f), true);
                if (is_array($raw)) {
                    // Hanya hit 1 jam terakhir yang dihitung (untuk laju).
                    $hits = array_values(array_filter($raw, function ($t) use ($now) {
                        return is_numeric($t) && ($now - (int) $t) < 3600;
                    }));
                }
            }
            if (count($hits) >= 30) {
                return false; // laju terlampaui
            }
            if (!empty($hits) && ($now - (int) max($hits)) < 600) {
                return false; // ganda dalam 10 menit terakhir
            }
            $hits[] = $now;
            @file_put_contents($f, json_encode(array_slice($hits, -30)));

            DB::update("
                UPDATE T_NEWS SET VIEWCOUNT = VIEWCOUNT + 1 WHERE NEWSID = ?
            ", [$newsid]);
            return true;
        } catch (\Throwable $e) {
            SysLog::log('ERROR', 'API', 'Gagal mencatat view berita.', [], $e);
            return false;
        }
    }
}
