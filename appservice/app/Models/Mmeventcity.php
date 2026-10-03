<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Event by City (Discovery): ringkasan katalog per kota. Hanya baca.
// SEGMENT: home/meventcity/meventcity. Menu MCONTROL = meventcity.
//
// Sama persis dengan Event by Category tetapi dikelompokkan per kota aktif
// (nama, provinsi, zona waktu). Rumus terjual & status = Event List.
class Mmeventcity extends Model
{
    use ColumnFilter;

    const MCODE = 20010004;

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

        $cat = strtoupper(trim((string) ($param['cat'] ?? '')));
        $from = trim((string) ($param['datefrom'] ?? ''));
        $to   = trim((string) ($param['dateto'] ?? ''));

        $where = '';
        $args = [];
        if ($cat !== '') {
            $where .= ' WHERE UPPER(E.CATCODE) = ?';
            $args[] = $cat;
        }
        if ($from !== '' && strtotime($from) !== false) {
            $where .= ($where ? ' AND' : ' WHERE') . ' E.STARTAT >= ?';
            $args[] = date('Y-m-d 00:00:00', strtotime($from));
        }
        if ($to !== '' && strtotime($to) !== false) {
            $where .= ($where ? ' AND' : ' WHERE') . ' E.STARTAT <= ?';
            $args[] = date('Y-m-d 23:59:59', strtotime($to));
        }

        $rows = DB::select("
            SELECT E.EVENTID, E.CITYCODE, ISNULL(C.CITYNAME, E.CITYCODE) AS CITYNAME,
                   C.CITYPROV, C.CITYTZ,
                   E.STATUS, E.ENDAT, E.STARTAT,
                   ISNULL(Q.QUOTA, 0) AS QUOTA, ISNULL(S.SOLD, 0) AS SOLD
            FROM T_EVENT E
            LEFT JOIN T_CITY C ON C.CITYCODE = E.CITYCODE
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
            $code = (string) $r->CITYCODE;
            if (!isset($by[$code])) {
                $by[$code] = [
                    'CITYCODE' => $code, 'CITYNAME' => (string) $r->CITYNAME,
                    'CITYPROV' => (string) ($r->CITYPROV ?? ''), 'CITYTZ' => (string) ($r->CITYTZ ?? ''),
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

        // Kota aktif tanpa event tetap muncul (0).
        foreach (DB::select("SELECT CITYCODE, CITYNAME, CITYPROV, CITYTZ FROM T_CITY WHERE CITYACTIVE = 'YES' ORDER BY CITYNAME, CITYCODE") as $c) {
            if (!isset($by[$c->CITYCODE])) {
                $by[$c->CITYCODE] = [
                    'CITYCODE' => (string) $c->CITYCODE, 'CITYNAME' => (string) $c->CITYNAME,
                    'CITYPROV' => (string) ($c->CITYPROV ?? ''), 'CITYTZ' => (string) ($c->CITYTZ ?? ''),
                    'UPCOMING' => 0, 'TOTAL' => 0, 'SOLD' => 0, 'NEAR' => 0, 'SOLD_OUT' => 0, 'NEXTAT' => null,
                ];
            }
        }

        $out = array_values($by);
        usort($out, fn($a, $b) => strcmp($a['CITYNAME'], $b['CITYNAME']));
        return json_encode(['success' => true, 'Rows' => $out]);
    }
}
