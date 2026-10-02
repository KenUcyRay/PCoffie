<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// PENTING: nama file & class ini SENGAJA tanpa underscore ("Mcpusergroup"),
// karena frontend cp_usergroup.js manggil ke URL "cpusergroup/cpusergroup"
// (tanpa underscore) — beda dari MCONTROL "cp_usergroup" (pakai underscore)
// yang dipakai buat nentuin folder/file VIEW-nya. Dua hal ini independen:
// - MCONTROL (di CPMENU)         -> nentuin path file VIEW (app/cp_usergroup/cp_usergroup.js)
// - segmen pertama URL (/{A}/{B}) -> nentuin nama class MODEL backend (M+A)
class Mcpusergroup extends Model
{
    use ColumnFilter;

    // {method: read_data, limit?, offset?, q?, filters?} -> daftar group (paging + filter kolom).
    public static function read_data($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = " WHERE A.DEFMODULE = 'GROUP_USERLOGIN'";
        $args  = [];
        if ($q !== '') {
            $where .= " AND (A.DEFCODE LIKE ? OR A.DEFNAME LIKE ?)";
            $like   = '%' . $q . '%';
            $args   = [$like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM CPMATRIX A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "SELECT A.DEFID, A.DEFMODULE, A.DEFCODE, A.DEFNAME FROM CPMATRIX A" . $where . " ORDER BY A.DEFCODE";

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

    public static function create_group($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $defcode = trim($vdata['DEFCODE'] ?? '');
        $defname = trim($vdata['DEFNAME'] ?? $defcode);

        if ($defcode === '') {
            return json_encode(['success' => 'false', 'message' => 'Nama Group tidak boleh kosong.']);
        }

        $exists = DB::select(
            "SELECT 1 AS X FROM CPMATRIX WHERE DEFMODULE='GROUP_USERLOGIN' AND DEFCODE=?",
            [$defcode]
        );

        if (!empty($exists)) {
            return json_encode(['success' => 'false', 'message' => 'Group User sudah ada.']);
        }

        DB::insert(
            "INSERT INTO CPMATRIX (DEFMODULE, DEFCODE, DEFNAME, SYSCREATEUSER, SYSCREATEDATE)
             VALUES ('GROUP_USERLOGIN', ?, ?, ?, GETDATE())",
            [$defcode, $defname, $param['VUSERLOGIN'] ?? '']
        );

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'cp_usergroup', 'page' => 'User Group',
            'table' => 'CPMATRIX', 'dataId' => $defcode, 'summary' => 'GROUP ' . $defcode,
            'before' => [], 'after' => ['DEFCODE' => $defcode, 'DEFNAME' => $defname],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Group User berhasil dibuat.']);
    }

    public static function delete_akses_group($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $defid = $vdata['DEFID'] ?? null;

        if (empty($defid)) {
            return json_encode(['success' => 'false', 'message' => 'Data tidak ditemukan.']);
        }

        $exists = DB::select("SELECT 1 AS X FROM CPMATRIX WHERE DEFID = ?", [$defid]);

        if (empty($exists)) {
            return json_encode(['success' => 'false', 'message' => 'Data tidak ditemukan.']);
        }

        $beforeGrp = DB::selectOne("SELECT DEFID, DEFCODE, DEFNAME FROM CPMATRIX WHERE DEFID = ?", [$defid]);

        DB::delete("DELETE FROM CPMATRIX WHERE DEFID = ?", [$defid]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'cp_usergroup', 'page' => 'User Group',
            'table' => 'CPMATRIX', 'dataId' => $defid, 'summary' => 'GROUP ' . ($beforeGrp->DEFCODE ?? $defid),
            'before' => $beforeGrp ? (array) $beforeGrp : [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Group User berhasil dihapus.']);
    }

    // dipanggil saat 1 baris group di-klik -> return FLAT list menu (bukan nested),
    // frontend yang bangun tree-nya sendiri (lihat buildTreeMenuData di cp_usergroup.js)
    public static function read_akses_menu($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $vgroup_user = $vdata['DEFCODE'] ?? '';

        if (empty($vgroup_user)) {
            return json_encode(['success' => 'false', 'message' => 'DEFCODE group tidak ditemukan.']);
        }

        $SQL = "
        SELECT A.MCODE, A.MPARRENT, A.MMODULE, A.MNAME, A.MCONTROL, A.MCHILDREN,
               A.MEXPAND, A.MLEAF, A.MSHORT,
               B.DEFSHORT AS MMODULE_SHORT, B.DEFNAME AS MMODULE_NAME,
               CASE WHEN C.RMENUID IS NOT NULL THEN 'TRUE' ELSE 'FALSE' END AS CHECKED
        FROM CPMENU A
        LEFT JOIN CPMATRIX B ON A.MMODULE = B.DEFCODE AND B.DEFMODULE = 'MODULE MENU'
        LEFT JOIN CPMENUACCESS C ON A.MCODE = C.RMENUID AND C.RGROUP = ?
        ORDER BY B.DEFSHORT, A.MSHORT
        ";

        $rows = DB::select($SQL, [$vgroup_user]);

        return json_encode([
            'success' => true,
            'Rows' => $rows,
        ]);
    }

    public static function update_akses_group($param)
    {
        $vheader = json_decode($param['vheader'] ?? '{}', true) ?: [];
        $vdata = $param['vdata'] ?? '[]';
        $vgroup_user = $vheader['DEFCODE'] ?? '';

        if (empty($vgroup_user)) {
            return json_encode(['success' => 'false', 'message' => 'Group User tidak ditemukan.']);
        }

        // vdata yang dikirim cp_usergroup.js formatnya [{MCODE, MPARRENT}, ...]
        // kita rapikan dulu jadi format yang sama kayak versi lama: [{GROUP_USER, MCODE}, ...]
        $arrChecked = json_decode($vdata, true) ?: [];
        $vdataForSql = json_encode(array_map(function ($row) use ($vgroup_user) {
            return ['GROUP_USER' => $vgroup_user, 'MCODE' => $row['MCODE'] ?? null];
        }, $arrChecked));

        $SQL = "
            DECLARE @VJSONDATA nvarchar(max) = ?;
            DECLARE @VGROUP_USER varchar(30) = ?;

            WITH TBL_JSON as (
                SELECT GROUP_USER, MCODE FROM OPENJSON(@VJSONDATA)
                WITH (GROUP_USER varchar(max), MCODE varchar(max))
            ),
            TBL_JOIN as (
                SELECT A.GROUP_USER, B.MCODE, B.MMODULE
                FROM TBL_JSON A
                LEFT JOIN CPMENU B on A.MCODE = B.MCODE
                WHERE B.MMODULE is not NULL
            ),
            TARGET as (SELECT * FROM CPMENUACCESS WHERE RGROUP = @VGROUP_USER)
            MERGE INTO TARGET
            USING TBL_JOIN SOURCE
            ON TARGET.RGROUP = SOURCE.GROUP_USER AND TARGET.RMODULE = SOURCE.MMODULE AND TARGET.RMENUID = SOURCE.MCODE
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (RGROUP, RMODULE, RMENUID) VALUES (SOURCE.GROUP_USER, SOURCE.MMODULE, SOURCE.MCODE)
            WHEN NOT MATCHED BY SOURCE THEN DELETE;

            -- VALIDASI ULANG: pastikan parent chain (sampai 4 level) ikut ke-insert
            DECLARE @NTBL_ACC as table (RGROUP varchar(25), RMENUID varchar(20), RMODULE varchar(50));

            WITH TBL_ACC as (
                SELECT A.RGROUP, A.RMENUID, B.MPARRENT as MPARRENT1 FROM CPMENUACCESS A
                LEFT JOIN CPMENU B on A.RMENUID = B.MCODE WHERE RGROUP = @VGROUP_USER
            ),
            TBL_ACC2 as (
                SELECT A.RGROUP, A.RMENUID, A.MPARRENT1, B.MPARRENT as MPARRENT2 FROM TBL_ACC A
                LEFT JOIN CPMENU B on A.MPARRENT1 = B.MCODE WHERE RGROUP = @VGROUP_USER
            ),
            TBL_ACC3 as (
                SELECT A.RGROUP, A.RMENUID, A.MPARRENT1, A.MPARRENT2, B.MPARRENT as MPARRENT3 FROM TBL_ACC2 A
                LEFT JOIN CPMENU B on A.MPARRENT2 = B.MCODE WHERE RGROUP = @VGROUP_USER
            ),
            TBL_ACC4 as (
                SELECT A.RGROUP, A.RMENUID, A.MPARRENT1, A.MPARRENT2, A.MPARRENT3, B.MPARRENT as MPARRENT4 FROM TBL_ACC3 A
                LEFT JOIN CPMENU B on A.MPARRENT3 = B.MCODE WHERE RGROUP = @VGROUP_USER
            )
            INSERT INTO @NTBL_ACC (RGROUP, RMENUID)
            SELECT RGROUP, RMENUID FROM TBL_ACC4 UNION ALL
            SELECT RGROUP, MPARRENT1 FROM TBL_ACC4 UNION ALL
            SELECT RGROUP, MPARRENT2 FROM TBL_ACC4 UNION ALL
            SELECT RGROUP, MPARRENT3 FROM TBL_ACC4 UNION ALL
            SELECT RGROUP, MPARRENT4 FROM TBL_ACC4;

            DELETE FROM @NTBL_ACC WHERE RMENUID is NULL or RMENUID = '0';

            UPDATE T SET T.RMODULE = S.MMODULE
            FROM @NTBL_ACC T INNER JOIN CPMENU S on T.RMENUID = S.MCODE;

            WITH TARGET2 as (SELECT * FROM CPMENUACCESS WHERE RGROUP = @VGROUP_USER)
            MERGE INTO TARGET2
            USING (SELECT DISTINCT RGROUP, RMENUID, RMODULE FROM @NTBL_ACC) SOURCE2
            ON TARGET2.RGROUP = SOURCE2.RGROUP AND TARGET2.RMENUID = SOURCE2.RMENUID
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (RGROUP, RMODULE, RMENUID) VALUES (SOURCE2.RGROUP, SOURCE2.RMODULE, SOURCE2.RMENUID);
        ";

        $beforeAcc = array_map(function ($r) { return (string) $r->RMENUID; }, DB::select(
            "SELECT RMENUID FROM CPMENUACCESS WHERE RGROUP = ?", [$vgroup_user]
        ));

        DB::statement($SQL, [$vdataForSql, $vgroup_user]);

        $afterAcc = array_map(function ($r) { return (string) ($r['MCODE'] ?? ''); }, $arrChecked);

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_usergroup', 'page' => 'User Group',
            'table' => 'CPMENUACCESS', 'dataId' => $vgroup_user,
            'summary' => 'GROUP ' . $vgroup_user . ' akses ' . count($beforeAcc) . ' -> ' . count($afterAcc) . ' menu',
            'before' => ['RMENUID' => $beforeAcc],
            'after' => ['RMENUID' => $afterAcc],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Data berhasil di update']);
    }
}