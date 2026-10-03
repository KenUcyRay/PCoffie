<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tymon\JWTAuth\Facades\JWTAuth;

class C_home extends Controller
{
    public function index()
    {
        return response()->json(["message" => "halo, backend app-core jalan"]);
    }

    // dipakai buat test koneksi database dari browser, tanpa perlu token
    public function check_db()
    {
        try {
            $result = DB::select("SELECT GETDATE() AS SERVER_TIME");
            return response()->json([
                'success' => true,
                'message' => 'Koneksi database berhasil',
                'data' => $result
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Koneksi database gagal: ' . $e->getMessage()
            ], 500);
        }
    }

    public function auth(Request $request)
    {
        $params = $request->all();
        $method = $params['method'] ?? 'login';

        // request 'reload'/'me' biasanya gak kirim userlogin di body,
        // dia ngandelin token JWT dari header Authorization
        // ('me' = alias universal untuk frontend baru)
        if (in_array($method, ['reload', 'me']) && empty($params['userlogin'])) {
            try {
                $jwt_data = JWTAuth::parseToken()->getPayload()->toArray();
                $params['userlogin'] = $jwt_data['sub'] ?? '';
            } catch (\Exception $e) {
                return response()->json([
                    'success' => 'false',
                    'message' => 'Token tidak ditemukan/tidak valid untuk reload'
                ], 401);
            }
        }

        // Validasi sesi untuk reload/me (watcher 30 detik frontend mengandalkan
        // 401 di sini untuk menendang ke login ulang; auth/* di luar grup jwt).
        if (in_array($method, ['reload', 'me'])) {
            try {
                $mePayload = JWTAuth::parseToken()->getPayload()->toArray();
                $meSid = trim((string) ($mePayload['jti'] ?? ''));
                if ($meSid === '') {
                    return response()->json([
                        'success' => 'false',
                        'message' => 'Token tidak valid untuk sesi.'
                    ], 401);
                }
                $meSess = \App\Models\Mcpsession::assertActive($meSid);
                if (!$meSess['ok']) {
                    $msg = [
                        'NOSESSION' => 'Sesi login tidak ditemukan. Silakan login kembali.',
                        'EXPIRED' => 'Masa berlaku sesi habis. Silakan login kembali.',
                        'IDLE' => 'Sesi habis karena tidak aktif. Silakan login kembali.',
                        'DICABUT' => 'Sesi login sudah dicabut. Silakan login kembali.',
                        'KEDALUWARSA' => 'Sesi login sudah kedaluwarsa. Silakan login kembali.',
                        'LOGOUT' => 'Sesi login sudah berakhir. Silakan login kembali.',
                        'ERROR' => 'Sesi login tidak dapat diperiksa. Silakan login kembali.',
                    ];
                    return response()->json([
                        'success' => 'false',
                        'message' => $msg[(string) ($meSess['code'] ?? '')] ?? 'Sesi login tidak valid.'
                    ], 401);
                }
            } catch (\Exception $e) {
                return response()->json([
                    'success' => 'false',
                    'message' => 'Sesi login tidak valid.'
                ], 401);
            }
        }

        $result = \App\Models\Mlogin::handleAction($method, $params);

        return response($result, 200)->header('Content-Type', 'application/json');
    }

    public function logout(Request $request)
    {
        // Ambil user dari token SEBELUM invalidate (sesudahnya token mati).
        // Catatan: hanya menambah pencatatan; respons dan perilaku tidak berubah.
        $typed = '';
        $sid = null;
        try {
            $payload = JWTAuth::parseToken()->getPayload()->toArray();
            $typed = (string) ($payload['sub'] ?? '');
            $sid = trim((string) ($payload['jti'] ?? ''));
            if ($sid === '') {
                $sid = null;
            }
        } catch (\Exception $e) {
            // token sudah invalid/expired: tetap catat (user kosong) di bawah
        }
        // Tandai sesi LOGOUT di T_USER_SESSION (best-effort).
        \App\Models\Mcpsession::markLogoutBySid($sid, $typed !== '' ? $typed : 'SYSTEM');
        try {
            JWTAuth::parseToken()->invalidate();
        } catch (\Exception $e) {
            // token sudah invalid/expired, anggap saja logout tetap sukses
        }
        \App\Models\LoginTrail::record('LOGOUT', $typed);

        return response()->json([
            'success' => 'true',
            'message' => 'Logout berhasil',
        ]);
    }

    // Identitas publik aplikasi TANPA login. Hanya Mcpsetting::read_public
    // (4 kolom identitas); tidak ada dispatcher umum di sini.
    public function public_setting(Request $request)
    {
        $result = \App\Models\Mcpsetting::read_public($request->all());

        return response($result, 200)->header('Content-Type', 'application/json');
    }

    public function general($A, $B, Request $request)
    {
        $jwt_data = JWTAuth::parseToken()->getPayload()->toArray();
        $payload = $request->all();
        $payload['VUSERLOGIN'] = $jwt_data['sub'];

        // Akun pembeli (GROUP_USER) TIDAK BOLEH memakai Console.
        // Satu titik pemeriksaan di sini menutup SELURUH dispatcher Console
        // (home/{A}/{B} dan fallback /{A}/{B}), jadi tidak ada halaman Console
        // yang bisa dibuka hanya dengan menebak URL API.
        try {
            $grp = DB::selectOne("SELECT TOP 1 USERGROUP FROM CPUSER WHERE USERLOGIN = ?", [$jwt_data['sub']]);
            if ($grp && strtoupper(trim((string) $grp->USERGROUP)) === 'GROUP_USER') {
                return response()->json([
                    'success' => 'false',
                    'message' => 'Akun pembeli tidak punya akses Console. Gunakan portal /tiket-app/.'
                ], 403);
            }
        } catch (\Exception $e) {
            // bila cek group gagal, biarkan lanjut ke cek hak akses di model
        }

        $modelClass = "\\App\\Models\\" . ucfirst('M' . $A);

        if (!class_exists($modelClass)) {
            return response()->json([
                'success' => 'false',
                'message' => "Model $modelClass tidak ditemukan"
            ], 404);
        }

        $method = ($A !== $B) ? 'read' : ($payload['method'] ?? 'read');

        if (!method_exists($modelClass, $method)) {
            return response()->json([
                'success' => 'false',
                'message' => "Method '$method' tidak ditemukan di $modelClass"
            ], 404);
        }

        try {
            $result = $modelClass::$method($payload);
            return response($result, 200)->header('Content-Type', 'application/json');
        } catch (\Exception $e) {
            return response()->json([
                'success' => 'false',
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }
}
