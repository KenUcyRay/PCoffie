<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Daftar menu per module (Master Data, module System). Tabel dbo.CPMENU
// — tabel SUDAH ADA, tidak diubah strukturnya.
// SEGMENT frontend: home/cpmenu/cpmenu. Menu CPMENU MCONTROL = cp_menu.
//
// Hanya nama tampilan (MNAME), urutan (MSHORT), dan expand awal (MEXPAND) yang
// boleh diubah. MCODE/MPARRENT/MMODULE/MCONTROL/MCHILDREN/MLEAF TIDAK BOLEH
// (mengunci halaman, tree, dan hak akses). Tanpa tambah/hapus.
class Mcpmenu extends Model
{
    use ColumnFilter;

    // Menu penjaga akses admin: struktur dan leaf-nya tidak boleh diubah.
    const GUARD_MENUS = ['cp_userlogin', 'cp_usergroup', 'cp_matrix', 'cp_menu'];

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'MCODE' => 'A.MCODE',
            'MNAME' => 'A.MNAME',
            'MCONTROL' => 'A.MCONTROL',
            'MSHORT' => 'A.MSHORT',
        ];
    }

    // Daftar menu satu module dalam struktur induk dan child.
    // Return {success, Rows: [{...induk, CHILDREN: [...]}]} — TANPA paging
    // (tree butuh utuh). Filter q = cari nama/control (tampilkan jalur cocok).
    public static function read_tree($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $module = trim((string) ($vdata['MMODULE'] ?? ($param['mmodule'] ?? '')));
        $q = trim((string) ($param['q'] ?? ''));

        if ($module === '') {
            return json_encode(['success' => 'false', 'message' => 'MMODULE tidak ditemukan.']);
        }

        $mod = DB::selectOne("
            SELECT DEFCODE, DEFNAME FROM CPMATRIX
            WHERE DEFMODULE = 'MODULE MENU' AND DEFCODE = ?
        ", [$module]);
        if (!$mod) {
            return json_encode(['success' => 'false', 'message' => 'Module tidak ditemukan.']);
        }

        $rows = DB::select("
            SELECT A.MCODE, A.MPARRENT, A.MMODULE, A.MNAME, A.MCONTROL,
                   A.MCHILDREN, A.MEXPAND, A.MLEAF, A.MSHORT
            FROM CPMENU A
            WHERE A.MMODULE = ?
            ORDER BY A.MPARRENT, A.MSHORT, A.MCODE
        ", [$module]);

        // Bangun tree 2 level di PHP (induk MPARRENT=0, child mengacu MCODE).
        $byParent = [];
        foreach ($rows as $r) {
            $byParent[(string) $r->MPARRENT][] = $r;
        }
        $build = function ($parent) use (&$build, $byParent) {
            $out = [];
            foreach ($byParent[(string) $parent] ?? [] as $r) {
                $kids = $build($r->MCODE);
                $out[] = array_merge((array) $r, ['CHILDREN' => $kids]);
            }
            return $out;
        };
        $tree = $build('0');

        // Filter q: hanya jalur yang cocok (nama/control, case-insensitive).
        if ($q !== '') {
            $lq = mb_strtolower($q);
            $keep = function ($nodes) use (&$keep, $lq) {
                $out = [];
                foreach ($nodes as $n) {
                    $kids = $keep($n['CHILDREN'] ?? []);
                    $hit = mb_stripos((string) ($n['MNAME'] ?? ''), $lq) !== false
                        || mb_stripos((string) ($n['MCONTROL'] ?? ''), $lq) !== false;
                    if ($hit || !empty($kids)) {
                        $n['CHILDREN'] = $kids;
                        $out[] = $n;
                    }
                }
                return $out;
            };
            $tree = $keep($tree);
        }

        return json_encode([
            'success' => true,
            'Module' => ['MMODULE' => $mod->DEFCODE, 'MNAME' => $mod->DEFNAME],
            'Rows' => $tree,
        ]);
    }

    public static function read_detail($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $mcode = $vdata['MCODE'] ?? null;

        if ($mcode === null || $mcode === '') {
            return json_encode(['success' => 'false', 'message' => 'MCODE tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.MCODE, A.MPARRENT, A.MMODULE, A.MNAME, A.MCONTROL,
                   A.MCHILDREN, A.MEXPAND, A.MLEAF, A.MSHORT,
                   B.DEFNAME AS MMODULE_NAME,
                   (SELECT COUNT(*) FROM CPMENUACCESS C WHERE C.RMENUID = A.MCODE) AS GROUPCOUNT
            FROM CPMENU A
            LEFT JOIN CPMATRIX B ON A.MMODULE = B.DEFCODE AND B.DEFMODULE = 'MODULE MENU'
            WHERE A.MCODE = ?
        ", [$mcode]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data menu tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. Return pesan error atau null bila lolos.
    // MCODE/MPARRENT/MMODULE/MCONTROL/MCHILDREN/MLEAF TIDAK BOLEH diubah.
    private static function validate($vdata): ?string
    {
        $mname = trim((string) ($vdata['MNAME'] ?? ''));
        $mshort = trim((string) ($vdata['MSHORT'] ?? ''));
        $mexpand = strtoupper(trim((string) ($vdata['MEXPAND'] ?? 'FALSE')));

        if ($mname === '') {
            return 'Nama menu wajib diisi.';
        }
        if (strlen($mname) > 40) {
            return 'Nama maksimal 40 karakter.';
        }
        if (!in_array($mexpand, ['TRUE', 'FALSE'], true)) {
            return 'Expand harus TRUE atau FALSE.';
        }
        if ($mshort === '') {
            return 'Urutan wajib diisi.';
        }
        if (filter_var($mshort, FILTER_VALIDATE_INT) === false || (int) $mshort < 0) {
            return 'Urutan harus angka bulat tidak negatif.';
        }

        return null;
    }

    public static function process_update($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $mcode = $vdata['MCODE'] ?? null;

        if ($mcode === null || $mcode === '') {
            return json_encode(['success' => 'false', 'message' => 'MCODE tidak ditemukan.']);
        }

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $before = DB::selectOne("
            SELECT MCODE, MPARRENT, MMODULE, MNAME, MCONTROL, MCHILDREN, MEXPAND, MLEAF, MSHORT
            FROM CPMENU WHERE MCODE = ?
        ", [$mcode]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data menu tidak ditemukan.']);
        }

        // Urutan tidak boleh bentrok dengan menu lain yang satu induk + module.
        $dup = DB::selectOne("
            SELECT 1 AS X FROM CPMENU
            WHERE MMODULE = ? AND MPARRENT = ? AND MSHORT = ? AND MCODE <> ?
        ", [$before->MMODULE, $before->MPARRENT, (int) trim($vdata['MSHORT']), $mcode]);
        if ($dup) {
            return json_encode(['success' => 'false', 'message' => 'Urutan sudah dipakai menu lain dalam grup ini.']);
        }

        DB::update("
            UPDATE CPMENU
            SET MNAME = ?, MSHORT = ?, MEXPAND = ?
            WHERE MCODE = ?
        ", [
            trim($vdata['MNAME']), (int) trim($vdata['MSHORT']),
            strtoupper(trim($vdata['MEXPAND'] ?? 'FALSE')), $mcode,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_menu', 'page' => 'Menu List',
            'table' => 'CPMENU', 'dataId' => (string) $mcode, 'summary' => 'MENU ' . (string) $before->MNAME,
            'before' => ['MNAME' => (string) $before->MNAME, 'MSHORT' => (string) $before->MSHORT],
            'after' => ['MNAME' => trim($vdata['MNAME']), 'MSHORT' => trim($vdata['MSHORT'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Menu berhasil diupdate.']);
    }
}
