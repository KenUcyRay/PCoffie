<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Daftar module aplikasi (Master Data, module System). Tabel dbo.CPMATRIX
// (DEFMODULE = 'MODULE MENU') — tabel SUDAH ADA, tidak diubah strukturnya.
// SEGMENT frontend: home/cpmatrix/cpmatrix. Menu CPMENU MCONTROL = cp_matrix.
//
// Hanya nama tampilan (DEFNAME), urutan (DEFSHORT), dan ikon (DEFIMAGE) yang
// boleh diubah. DEFCODE/DEFMODULE/DEFID TIDAK BOLEH (mengunci akses & sidebar).
// Tanpa tambah/hapus.
class Mcpmatrix extends Model
{
    use ColumnFilter;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'DEFID' => 'A.DEFID',
            'DEFCODE' => 'A.DEFCODE',
            'DEFNAME' => 'A.DEFNAME',
            'DEFSHORT' => 'A.DEFSHORT',
        ];
    }

    public static function read_data($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.DEFMODULE = 'MODULE MENU'";
        $args  = [];
        if ($q !== '') {
            $where .= " AND (A.DEFCODE LIKE ? OR A.DEFNAME LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM CPMATRIX A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default urutan, kode.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.DEFSHORT, A.DEFCODE';

        $sql = "
            SELECT A.DEFID, A.DEFCODE, A.DEFNAME, A.DEFSHORT, A.DEFIMAGE,
                   (SELECT COUNT(*) FROM CPMENU M WHERE M.MMODULE = A.DEFCODE AND M.MPARRENT = 0) AS PARENTCOUNT,
                   (SELECT COUNT(*) FROM CPMENU M WHERE M.MMODULE = A.DEFCODE AND M.MLEAF = 'TRUE') AS LEAFCOUNT
            FROM CPMATRIX A
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
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $defid = $vdata['DEFID'] ?? null;

        if (empty($defid)) {
            return json_encode(['success' => 'false', 'message' => 'DEFID tidak ditemukan.']);
        }

        $row = DB::selectOne("
            SELECT A.DEFID, A.DEFCODE, A.DEFNAME, A.DEFSHORT, A.DEFIMAGE,
                   (SELECT COUNT(*) FROM CPMENU M WHERE M.MMODULE = A.DEFCODE AND M.MPARRENT = 0) AS PARENTCOUNT,
                   (SELECT COUNT(*) FROM CPMENU M WHERE M.MMODULE = A.DEFCODE AND M.MLEAF = 'TRUE') AS LEAFCOUNT
            FROM CPMATRIX A
            WHERE A.DEFMODULE = 'MODULE MENU' AND A.DEFID = ?
        ", [$defid]);

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data module tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$row]]);
    }

    // Validasi form. Return pesan error atau null bila lolos.
    // DEFCODE/DEFMODULE TIDAK BOLEH diubah (hanya DEFNAME/DEFSHORT/DEFIMAGE).
    private static function validate($vdata): ?string
    {
        $defname = trim((string) ($vdata['DEFNAME'] ?? ''));
        $defshort = trim((string) ($vdata['DEFSHORT'] ?? ''));
        $defimage = trim((string) ($vdata['DEFIMAGE'] ?? ''));

        if ($defname === '') {
            return 'Nama module wajib diisi.';
        }
        if (strlen($defname) > 200) {
            return 'Nama maksimal 200 karakter.';
        }
        if (strlen($defimage) > 100) {
            return 'Nama ikon maksimal 100 karakter.';
        }
        if ($defshort === '') {
            return 'Urutan wajib diisi.';
        }
        if (filter_var($defshort, FILTER_VALIDATE_INT) === false || (int) $defshort < 0) {
            return 'Urutan harus angka bulat tidak negatif.';
        }

        // Urutan tidak boleh bentrok dengan module lain (per DEFMODULE).
        $defid = $vdata['DEFID'] ?? null;
        $dup = DB::selectOne("
            SELECT 1 AS X FROM CPMATRIX
            WHERE DEFMODULE = 'MODULE MENU' AND DEFSHORT = ? AND DEFID <> ?
        ", [(int) $defshort, $defid ?: 0]);
        if ($dup) {
            return 'Urutan sudah dipakai module lain.';
        }

        return null;
    }

    public static function process_update($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $defid = $vdata['DEFID'] ?? null;

        if (empty($defid)) {
            return json_encode(['success' => 'false', 'message' => 'DEFID tidak ditemukan.']);
        }

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }

        $before = DB::selectOne("
            SELECT DEFID, DEFCODE, DEFNAME, DEFSHORT, DEFIMAGE FROM CPMATRIX
            WHERE DEFMODULE = 'MODULE MENU' AND DEFID = ?
        ", [$defid]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data module tidak ditemukan.']);
        }

        DB::update("
            UPDATE CPMATRIX
            SET DEFNAME = ?, DEFSHORT = ?, DEFIMAGE = NULLIF(?, ''),
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE DEFMODULE = 'MODULE MENU' AND DEFID = ?
        ", [
            trim($vdata['DEFNAME']), (int) trim($vdata['DEFSHORT']),
            trim($vdata['DEFIMAGE'] ?? ''), $param['VUSERLOGIN'] ?? '', $defid,
        ]);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_matrix', 'page' => 'Module List',
            'table' => 'CPMATRIX', 'dataId' => $before->DEFCODE, 'summary' => 'MODULE ' . $before->DEFCODE,
            'before' => ['DEFNAME' => (string) $before->DEFNAME, 'DEFSHORT' => (string) $before->DEFSHORT],
            'after' => ['DEFNAME' => trim($vdata['DEFNAME']), 'DEFSHORT' => trim($vdata['DEFSHORT'])],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Module berhasil diupdate.']);
    }
}
