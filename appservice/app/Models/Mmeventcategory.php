<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Event by Category (Discovery): ringkasan katalog per kategori. Hanya baca.
// SEGMENT: home/meventcategory/meventcategory. Menu MCONTROL = meventcategory.
//
// Kategori tanpa event tetap tampil (angka 0). Angkanya memakai rumus terjual
// & status yang sama dengan Event List (peserta AKTIF+LUNAS vs kuota tipe
// aktif). Daftar event per kategori memakai endpoint Event List (read_data).
class Mmeventcategory extends Model
{
    use ColumnFilter;

    const MCODE = 20010003;

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

    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $city = strtoupper(trim((string) ($param['city'] ?? '')));
        $from = trim((string) ($param['datefrom'] ?? ''));
        $to   = trim((string) ($param['dateto'] ?? ''));

        $where = '';
        $args = [];
        if ($city !== '') {
            $where .= ' WHERE UPPER(E.CITYCODE) = ?';
            $args[] = $city;
        }
        if ($from !== '' && strtotime($from) !== false) {
            $where .= ($where ? ' AND' : ' WHERE') . ' E.STARTAT >= ?';
            $args[] = date('Y-m-d 00:00:00', strtotime($from));
        }
        if ($to !== '' && strtotime($to) !== false) {
            $where .= ($where ? ' AND' : ' WHERE') . ' E.STARTAT <= ?';
            $args[] = date('Y-m-d 23:59:59', strtotime($to));
        }

        // Agregat per event untuk hitung SOLD, lalu kelompokkan per kategori.
        $rows = DB::select("
            SELECT E.EVENTID, E.CATCODE, ISNULL(C.CATNAME, E.CATCODE) AS CATNAME,
                   E.STATUS, E.ENDAT, E.STARTAT,
                   ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD
            FROM T_EVENT E
            LEFT JOIN T_CATEGORY C ON C.CATCODE = E.CATCODE
            LEFT JOIN (
                SELECT EVENTID, SUM(QUOTA) AS QUOTA FROM T_TICKET_TYPE
                WHERE ISACTIVE = 'YES' GROUP BY EVENTID
            ) Q ON Q.EVENTID = E.EVENTID
            LEFT JOIN (
                SELECT EVENTID, COUNT(*) AS SOLD FROM T_ATTENDEE
                WHERE TIKETSTATUS = 'AKTIF' AND PAYSTATUS = 'LUNAS'
                GROUP BY EVENTID
            ) S ON S.EVENTID = E.EVENTID
            " . $where . "
            ORDER BY E.EVENTID
        ", $args);

        $by = [];
        foreach ($rows as $r) {
            $code = (string) $r->CATCODE;
            if (!isset($by[$code])) {
                $by[$code] = [
                    'CATCODE' => $code, 'CATNAME' => (string) $r->CATNAME,
                    'UPCOMING' => 0, 'TOTAL' => 0, 'SOLD' => 0,
                    'NEAR' => 0, 'SOLD_OUT' => 0, 'NEXTAT' => null,
                ];
            }
            $by[$code]['TOTAL']++;

            $upcoming = strtoupper(trim((string) $r->STATUS)) === 'PUBLISHED'
                && ($r->ENDAT === null || strtotime((string) $r->ENDAT) >= time());
            if (!$upcoming) {
                continue;
            }
            $by[$code]['UPCOMING']++;
            $by[$code]['SOLD'] += (int) $r->SOLD;
            $quota = (int) $r->QUOTA;
            $sold = (int) $r->SOLD;
            if ($quota > 0 && $sold >= $quota) {
                $by[$code]['SOLD_OUT']++;
            } elseif ($quota > 0 && $sold >= (int) floor($quota * 0.9)) {
                $by[$code]['NEAR']++;
            }
            if (!empty($r->STARTAT)) {
                $ts = strtotime((string) $r->STARTAT);
                if ($by[$code]['NEXTAT'] === null || $ts < strtotime($by[$code]['NEXTAT'])) {
                    $by[$code]['NEXTAT'] = date('Y-m-d H:i:s', $ts);
                }
            }
        }

        // Kategori aktif yang belum punya event tetap muncul (0).
        foreach (DB::select("SELECT CATCODE, CATNAME FROM T_CATEGORY WHERE CATACTIVE = 'YES' ORDER BY CATSORT, CATCODE") as $c) {
            if (!isset($by[$c->CATCODE])) {
                $by[$c->CATCODE] = [
                    'CATCODE' => (string) $c->CATCODE, 'CATNAME' => (string) $c->CATNAME,
                    'UPCOMING' => 0, 'TOTAL' => 0, 'SOLD' => 0, 'NEAR' => 0, 'SOLD_OUT' => 0, 'NEXTAT' => null,
                ];
            }
        }

        $out = array_values($by);
        usort($out, fn($a, $b) => strcmp($a['CATNAME'], $b['CATNAME']));
        return json_encode(['success' => true, 'Rows' => $out]);
    }
}
