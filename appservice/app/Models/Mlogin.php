<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
use App\Custom\userJWT;
use Tymon\JWTAuth\Facades\JWTAuth;

class Mlogin extends Model
{
    // gabungkan dtmenu_header (module/parent) + dtmenu (child) jadi 1 array flat,
    // dan rename DEFSHORT/DEFNAME -> MMODULE_SHORT/MMODULE_NAME sesuai yang
    // dibutuhkan Cmode_desktop.js::buildModuleTreeData()
    private static function buildFlatMenu($rawHeaderJson, $rawSubJson)
    {
        $headers = json_decode($rawHeaderJson ?? '[]', true) ?: [];
        $subs = json_decode($rawSubJson ?? '[]', true) ?: [];

        $all = array_merge($headers, $subs);

        // PENTING: ALM_SQLTOJSON (function SQL Server) mengonversi SEMUA kolom
        // jadi string, termasuk yang harusnya angka (MCODE, MPARRENT, MENUID, dst).
        // Frontend (Cmode_desktop.js::buildModuleTreeNodes) bandingin nilai ini pakai
        // strict equality (===) terhadap angka JS asli (mis. baseParent=0), jadi
        // "0" (string) !== 0 (number) -> tree jadi kosong. Makanya di-cast ke int di sini.
        $intFields = ['MENUID', 'MCODE', 'MPARRENT', 'MSHORT', 'MMODULE_SHORT'];

        return array_map(function ($row) use ($intFields) {
            if (array_key_exists('DEFSHORT', $row)) {
                $row['MMODULE_SHORT'] = $row['DEFSHORT'];
            }
            if (array_key_exists('DEFNAME', $row)) {
                $row['MMODULE_NAME'] = $row['DEFNAME'];
            }

            foreach ($intFields as $f) {
                if (array_key_exists($f, $row) && $row[$f] !== null && $row[$f] !== '') {
                    $row[$f] = (int) $row[$f];
                }
            }

            return $row;
        }, $all);
    }

    // ALM_SQLTOJSON (SQL Server) selalu bungkus hasil "FOR XML PATH, ROOT" jadi
    // ARRAY walau cuma 1 baris. Tapi UTIL.Auth.js::extractUser() di frontend
    // butuh 'profile' berupa OBJEK user tunggal, bukan array berisi 1 objek -
    // kalau dibiarkan array, semua pengecekan userObj.USERLOGIN gagal dan
    // sistem fallback ke "Guest". Jadi di-unwrap di sini.
    private static function unwrapProfile($rawProfileJson)
    {
        $decoded = json_decode($rawProfileJson ?? '[]', true);

        if (is_array($decoded) && isset($decoded[0]) && is_array($decoded[0])) {
            $profile = $decoded[0];
        } elseif (is_array($decoded)) {
            $profile = $decoded;
        } else {
            return $rawProfileJson;
        }

        // GROUPMODEL gak ada di SP_USERLOGIN/SP_USER_RELOAD (SP lama, gak mau diubah),
        // jadi diambil terpisah di sini lalu digabung ke profile.
        if (!empty($profile['USERLOGIN'])) {
            $row = DB::selectOne("SELECT GROUPMODEL FROM CPUSER WHERE USERLOGIN = ?", [$profile['USERLOGIN']]);
            $profile['GROUPMODEL'] = ($row && $row->GROUPMODEL) ? $row->GROUPMODEL : 'mode_desktop';
        }

        return json_encode($profile);
    }

    public static function handleAction($method, $params)
    {
        switch ($method) {
            case 'login':
                return self::login($params);
            case 'reload':
            case 'me':
                return self::reload($params);
            default:
                return json_encode([
                    'success' => 'false',
                    'message' => 'Action not recognized'
                ]);
        }
    }

    public static function login($params)
    {
        $SQL_CALLSP = "EXEC SP_USERLOGIN ?, ?";

        $data = [
            $params['userlogin'] ?? '',
            $params['userpassword'] ?? '',
        ];

        $typed = trim((string) ($params['userlogin'] ?? ''));

        // IP request (untuk cek/blokir IP). '' bila tanpa HTTP (CLI).
        $ip = '';
        try {
            if (function_exists('request')) {
                $rip = (string) (request()->ip() ?? '');
                $ip = $rip !== '' ? mb_substr($rip, 0, 45) : '';
            }
        } catch (\Throwable $ignored) {
            // CLI / tanpa request HTTP
        }

        // Blokir diperiksa SEBELUM password (Blocked Access). Pesan ke pengguna
        // tetap umum; percobaan dicatat BLOCKED (titik TODO(blocked-access)).
        if (Mcpblocked::isBlocked($typed, $ip) !== null) {
            LoginTrail::record('BLOCKED', $typed, 'BLOCKED');
            return json_encode([
                'success' => 'false',
                'message' => 'User atau Password salah..',
            ]);
        }

        $result = DB::select($SQL_CALLSP, $data);

        if (!empty($result) && $result[0]->success === 'true') {
            LoginTrail::record('SUCCESS', $typed);

            $cpUserJWT = new userJWT($data[0], $data[1]);
            $token = JWTAuth::fromUser($cpUserJWT);

            // Sesi login: baris AKTIF di T_USER_SESSION + tegakkan batas sesi
            // per user. Gagal di sini tidak menggagalkan login (fail-open).
            try {
                $urow2 = DB::selectOne("SELECT USERID FROM CPUSER WHERE USERLOGIN = ?", [$typed]);
                $uid = $urow2 ? (int) $urow2->USERID : null;
                $sid = Mcpsession::sessionIdFromToken($token);
                $expTs = Mcpsession::expiryFromToken($token);
                Mcpsession::createFromLogin($typed, $uid, $sid, $expTs, $ip);
                Mcpsession::enforceLimit($uid, $typed, $sid);
            } catch (\Throwable $e) {
                SysLog::log('ERROR', 'AUTH', 'Gagal menyiapkan sesi login.', ['user' => $typed], $e);
            }

            $flatMenu = self::buildFlatMenu($result[0]->dtmenu_header, $result[0]->dtmenu);

            $hasil = [
                'success' => 'true',
                'message' => 'Login Success..',
                'token'   => $token,
                'dtmenu'  => json_encode($flatMenu),
                'profile' => self::unwrapProfile($result[0]->profile),
            ];
        } else {
            // Alasan rinci HANYA untuk log (tidak dikirim ke pengguna).
            // Urutan cek: user tidak ada -> nonaktif; mekanisme blokir akun/IP
            // belum ada (dikerjakan di Blocked Access) — titik panggilnya di bawah.
            $reason = 'WRONG_PASSWORD';
            if ($typed === '') {
                $reason = 'USER_NOT_FOUND';
            } else {
                $urow = DB::selectOne("SELECT USERACTIVE FROM CPUSER WHERE USERLOGIN = ?", [$typed]);
                if (!$urow) {
                    $reason = 'USER_NOT_FOUND';
                } elseif (strtoupper(trim((string) ($urow->USERACTIVE ?? ''))) !== 'YES') {
                    $reason = 'INACTIVE';
                }
            }
            LoginTrail::record('FAILED', $typed, $reason);

            // Blokir otomatis: gagal beruntun mencapai batas Security Setting.
            // Dievaluasi SETELAH FAILED tercatat agar hitungannya pas dengan
            // percobaan ini. Pesan ke pengguna tidak berubah (umum).
            Mcpblocked::evaluateAuto($typed, $ip);

            $hasil = [
                'success' => 'false',
                'message' => $result[0]->message ?? 'User atau Password salah..',
            ];
        }

        return json_encode($hasil);
    }

    public static function reload($params)
    {
        $SQL_CALLSP = "EXEC SP_USER_RELOAD ?";
        $data = [$params['userlogin'] ?? ''];

        $result = DB::select($SQL_CALLSP, $data);

        if (!empty($result) && $result[0]->success === 'true') {
            $flatMenu = self::buildFlatMenu($result[0]->dtmenu_header, $result[0]->dtmenu);

            $hasil = [
                'success' => 'true',
                'message' => 'Reload Success..',
                'dtmenu'  => json_encode($flatMenu),
                'profile' => self::unwrapProfile($result[0]->profile),
            ];
        } else {
            $hasil = [
                'success' => 'false',
                'message' => 'Reload gagal..',
            ];
        }

        return json_encode($hasil);
    }
}