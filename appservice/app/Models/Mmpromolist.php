<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

// Promo List (Discovery): katalog kode promo untuk pembaca/pembeli.
// Hanya baca. SEGMENT: home/mpromolist/mpromolist. Menu MCONTROL = mpromolist.
//
// Status memakai rumus kanonik Mmpromocode::displayStatus() (helper yang sama
// dipakai halaman pengelolaan). Filter status diterjemahkan ke predikat SQL
// agar pagination/count tetap benar. JANGAN memanggil PromoEngine::record /
// revert() dari halaman baca ini.
class Mmpromolist extends Model
{
    use ColumnFilter;

    const MCODE = 20020003;

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

    // Dipakai untuk count, list, dan ringkasan: jumlah pemakaian per promo.
    private static function usedJoin(): string
    {
        return " LEFT JOIN (
            SELECT PROMOID, COUNT(*) AS USEDCOUNT
            FROM T_PROMO_USAGE
            WHERE STATUS = 'DIPAKAI'
            GROUP BY PROMOID
        ) U ON U.PROMOID = A.PROMOID";
    }

    // Predikat SQL untuk status turunan Mmpromocode::displayStatus().
    private static function statusSql(string $status): array
    {
        $active = "UPPER(A.ISACTIVE) = 'YES'";
        $quota  = "(A.QUOTA IS NOT NULL AND A.QUOTA > 0 AND ISNULL(U.USEDCOUNT, 0) >= A.QUOTA)";
        $expired = "(A.ENDAT IS NOT NULL AND GETDATE() > A.ENDAT)";
        $future  = "(A.STARTAT IS NOT NULL AND GETDATE() < A.STARTAT)";

        switch ($status) {
            case 'NONAKTIF':
                return ["NOT $active", []];
            case 'AKAN_DATANG':
                return ["$active AND $future", []];
            case 'KEDALUWARSA':
                return ["$active AND $expired", []];
            case 'KUOTA_HABIS':
                return ["$active AND $quota", []];
            case 'BERLAKU':
            default:
                return ["$active AND NOT $future AND NOT $expired AND NOT $quota", []];
        }
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
        $disctype = strtoupper(trim((string) ($param['disctype'] ?? '')));
        $scopetype = strtoupper(trim((string) ($param['scopetype'] ?? '')));
        // Default publik: yang bisa dipakai (berlaku) dan yang akan datang.
        $status = strtoupper(trim((string) ($param['status'] ?? '')));
        if ($status === 'PUBLIK') {
            $status = 'PUBLIK';
        } elseif ($status === '') {
            $status = 'PUBLIK';
        }

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($status === 'PUBLIK') {
            $where = " WHERE UPPER(A.ISACTIVE) = 'YES'
                       AND NOT (A.ENDAT IS NOT NULL AND GETDATE() > A.ENDAT)
                       AND NOT (A.QUOTA IS NOT NULL AND A.QUOTA > 0 AND ISNULL(U.USEDCOUNT, 0) >= A.QUOTA)";
        } elseif (in_array($status, ['BERLAKU', 'AKAN_DATANG', 'KEDALUWARSA', 'KUOTA_HABIS', 'NONAKTIF'], true)) {
            [$pred, $pArgs] = self::statusSql($status);
            $where = ' WHERE ' . $pred;
            $args = $pArgs;
        } else {
            return json_encode(['success' => 'false', 'message' => 'Status tidak valid.']);
        }
        if ($q !== '') {
            $where .= ' AND (A.PROMOCODE LIKE ? OR A.DESCR LIKE ?)';
            $like = '%' . $q . '%';
            array_push($args, $like, $like);
        }
        if (in_array($disctype, ['PERSEN', 'NOMINAL'], true)) {
            $where .= ' AND A.DISCTYPE = ?';
            $args[] = $disctype;
        }
        if (in_array($scopetype, ['SEMUA', 'KATEGORI', 'EVENT'], true)) {
            $where .= ' AND A.SCOPETYPE = ?';
            $args[] = $scopetype;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);

        $countRow = DB::selectOne(
            "SELECT COUNT(*) AS TOTAL FROM T_PROMO A" . self::usedJoin() . $where,
            $args
        );
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $sort = strtolower(trim((string) ($param['sort'] ?? 'terbaru')));
        switch ($sort) {
            case 'kode':
                $order = 'A.PROMOCODE ASC';
                break;
            case 'berakhir':
                $order = 'A.ENDAT ASC';
                break;
            case 'kuota':
                $order = 'A.QUOTA ASC';
                break;
            case 'terpopuler':
                $order = 'ISNULL(U.USEDCOUNT, 0) DESC, A.PROMOCODE ASC';
                break;
            case 'terbaru':
            default:
                $sort = 'terbaru';
                $order = 'A.STARTAT DESC, A.PROMOID DESC';
        }

        $sql = "
            SELECT A.PROMOID, A.PROMOCODE, A.DESCR, A.DISCTYPE, A.DISCVALUE,
                   A.MAXDISC, A.MINPURCHASE, A.QUOTA, A.MAXPERBUYER,
                   A.STARTAT, A.ENDAT, A.SCOPETYPE, A.ISACTIVE,
                   ISNULL(U.USEDCOUNT, 0) AS USEDCOUNT
            FROM T_PROMO A
            " . self::usedJoin() . "
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $rows = [];
        foreach (DB::select($sql, $args) as $r) {
            $used = (int) ($r->USEDCOUNT ?? 0);
            $arr = (array) $r;
            $arr['USEDCOUNT'] = $used;
            // Rumus status kanonik (sama dengan halaman pengelolaan).
            $arr['DISPLAYSTATUS'] = Mmpromocode::displayStatus($r, $used);
            $arr['REMAIN'] = ($r->QUOTA === null || (int) $r->QUOTA <= 0) ? null : max(0, (int) $r->QUOTA - $used);
            $arr['SCOPES'] = self::scopesFor([(int) $r->PROMOID]);
            $rows[] = $arr;
        }

        return json_encode(['success' => true, 'Rows' => $rows, 'TotalRows' => $totalRows]);
    }

    // Target scope beberapa promo sekaligus (satu query).
    private static function scopesFor(array $ids): array
    {
        $ids = array_values(array_filter(array_map('intval', $ids)));
        if (empty($ids)) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        $out = [];
        foreach (DB::select("
            SELECT PROMOID, TARGETTYPE, TARGETCODE
            FROM T_PROMO_SCOPE
            WHERE PROMOID IN ($in)
            ORDER BY TARGETTYPE, TARGETCODE
        ", $ids) as $s) {
            $out[(int) $s->PROMOID][] = [
                'TARGETTYPE' => (string) $s->TARGETTYPE,
                'TARGETCODE' => (string) $s->TARGETCODE,
            ];
        }
        return $out;
    }

    // Ringkasan jumlah promo per status (dipakai kartu ringkasan).
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $out = ['BERLAKU' => 0, 'AKAN_DATANG' => 0, 'KEDALUWARSA' => 0, 'KUOTA_HABIS' => 0, 'NONAKTIF' => 0, 'TOTAL' => 0];
        foreach (array_keys($out) as $st) {
            [$pred] = self::statusSql($st);
            $row = DB::selectOne("SELECT COUNT(*) AS C FROM T_PROMO A" . self::usedJoin() . " WHERE " . $pred);
            $out[$st] = $row ? (int) $row->C : 0;
        }
        $row = DB::selectOne("SELECT COUNT(*) AS C FROM T_PROMO A" . self::usedJoin()
            . " WHERE UPPER(A.ISACTIVE) = 'YES'
                AND NOT (A.ENDAT IS NOT NULL AND GETDATE() > A.ENDAT)
                AND NOT (A.QUOTA IS NOT NULL AND A.QUOTA > 0 AND ISNULL(U.USEDCOUNT, 0) >= A.QUOTA)");
        $out['TOTAL'] = $row ? (int) $row->C : 0;
        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = (int) ($vdata['PROMOID'] ?? ($param['id'] ?? 0));
        if ($id <= 0) {
            return json_encode(['success' => 'false', 'message' => 'PROMOID tidak ditemukan.']);
        }
        $row = DB::selectOne("
            SELECT A.*, ISNULL(U.USEDCOUNT, 0) AS USEDCOUNT
            FROM T_PROMO A
            " . self::usedJoin() . "
            WHERE A.PROMOID = ?
        ", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Promo tidak ditemukan.']);
        }
        $used = (int) ($row->USEDCOUNT ?? 0);
        $arr = (array) $row;
        $arr['USEDCOUNT'] = $used;
        $arr['DISPLAYSTATUS'] = Mmpromocode::displayStatus($row, $used);
        $arr['REMAIN'] = ($row->QUOTA === null || (int) $row->QUOTA <= 0) ? null : max(0, (int) $row->QUOTA - $used);

        $scopes = DB::select("
            SELECT TARGETTYPE, TARGETCODE FROM T_PROMO_SCOPE
            WHERE PROMOID = ? ORDER BY TARGETTYPE, TARGETCODE
        ", [$id]);
        // Nama kategori/event agar tidak perlu membuka master lain.
        $names = [];
        foreach ($scopes as $s) {
            $code = (string) $s->TARGETCODE;
            $name = $code;
            if (strtoupper((string) $s->TARGETTYPE) === 'KATEGORI') {
                $c = DB::selectOne("SELECT CATNAME FROM T_CATEGORY WHERE CATCODE = ?", [$code]);
                if ($c) { $name = (string) $c->CATNAME; }
            } elseif (strtoupper((string) $s->TARGETTYPE) === 'EVENT') {
                $e = DB::selectOne("SELECT TITLE FROM T_EVENT WHERE EVENTID = ?", [(int) $code]);
                if ($e) { $name = (string) $e->TITLE; }
            }
            $names[] = ['TARGETTYPE' => (string) $s->TARGETTYPE, 'TARGETCODE' => $code, 'TARGETNAME' => $name];
        }
        $arr['SCOPES'] = $names;
        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }
}