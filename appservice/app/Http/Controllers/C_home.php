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

        $result = \App\Models\Mlogin::handleAction($method, $params);

        return response($result, 200)->header('Content-Type', 'application/json');
    }

    public function logout(Request $request)
    {
        // Ambil user dari token SEBELUM invalidate (sesudahnya token mati).
        // Catatan: hanya menambah pencatatan; respons dan perilaku tidak berubah.
        $typed = '';
        try {
            $payload = JWTAuth::parseToken()->getPayload()->toArray();
            $typed = (string) ($payload['sub'] ?? '');
        } catch (\Exception $e) {
            // token sudah invalid/expired: tetap catat (user kosong) di bawah
        }
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

    public function general($A, $B, Request $request)
    {
        $jwt_data = JWTAuth::parseToken()->getPayload()->toArray();
        $payload = $request->all();
        $payload['VUSERLOGIN'] = $jwt_data['sub'];

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
