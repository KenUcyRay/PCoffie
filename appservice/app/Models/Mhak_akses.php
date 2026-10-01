<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

class Mhak_akses extends Model
{
    // dipanggil setiap kali user klik menu -> validasi ulang ke server,
    // apakah group user masih punya akses ke menu tsb di CPMENUACCESS
    public static function menu_akses($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $userlogin = $param['VUSERLOGIN'] ?? '';

        $mcode = $vdata['mcode'] ?? ($vdata['pid'] ?? null);

        if (empty($userlogin) || empty($mcode)) {
            return json_encode(['success' => 'false', 'message' => 'Data tidak lengkap.']);
        }

        $user = DB::selectOne("SELECT USERGROUP FROM CPUSER WHERE USERLOGIN = ?", [$userlogin]);

        if (!$user || empty($user->USERGROUP)) {
            return json_encode(['success' => 'false', 'message' => 'User/Group tidak ditemukan.']);
        }

        $exists = DB::select(
            "SELECT 1 AS X FROM CPMENUACCESS WHERE RGROUP = ? AND RMENUID = ?",
            [$user->USERGROUP, $mcode]
        );

        if (empty($exists)) {
            return json_encode([
                'success' => 'false',
                'message' => 'Anda tidak memiliki hak akses untuk membuka menu ini.',
            ]);
        }

        return json_encode(['success' => 'true', 'message' => 'OK']);
    }
}