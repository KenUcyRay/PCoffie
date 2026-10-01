<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

class Mpin_desktop extends Model
{
    public static function read_data($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $userlogin = $vdata['USERLOGIN'] ?? ($param['VUSERLOGIN'] ?? '');

        if (empty($userlogin)) {
            return json_encode(['success' => 'false', 'message' => 'USERLOGIN tidak ditemukan.']);
        }

        $rows = DB::select(
            "SELECT MENUID, MNAME FROM CPUSERPIN WHERE USERLOGIN = ? ORDER BY ID",
            [$userlogin]
        );

        return json_encode([
            'success' => true,
            'Rows' => $rows,
        ]);
    }

    public static function create_data($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $userlogin = $vdata['USERLOGIN'] ?? ($param['VUSERLOGIN'] ?? '');
        $menuid = $vdata['MENUID'] ?? null;
        $mname = $vdata['MNAME'] ?? '';

        if (empty($userlogin) || empty($menuid)) {
            return json_encode(['success' => 'false', 'message' => 'Data tidak lengkap.']);
        }

        $exists = DB::select(
            "SELECT 1 AS X FROM CPUSERPIN WHERE USERLOGIN = ? AND MENUID = ?",
            [$userlogin, $menuid]
        );

        if (empty($exists)) {
            DB::insert(
                "INSERT INTO CPUSERPIN (USERLOGIN, MENUID, MNAME, SYSCREATEDATE) VALUES (?, ?, ?, GETDATE())",
                [$userlogin, $menuid, $mname]
            );
        }

        return json_encode(['success' => 'true', 'message' => 'Shortcut berhasil di-pin.']);
    }

    public static function delete_data($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $userlogin = $vdata['USERLOGIN'] ?? ($param['VUSERLOGIN'] ?? '');
        $menuid = $vdata['MENUID'] ?? null;

        if (empty($userlogin) || empty($menuid)) {
            return json_encode(['success' => 'false', 'message' => 'Data tidak lengkap.']);
        }

        DB::delete(
            "DELETE FROM CPUSERPIN WHERE USERLOGIN = ? AND MENUID = ?",
            [$userlogin, $menuid]
        );

        return json_encode(['success' => 'true', 'message' => 'Shortcut berhasil dihapus.']);
    }
}