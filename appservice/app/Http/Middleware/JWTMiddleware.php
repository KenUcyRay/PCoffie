<?php

namespace App\Http\Middleware;

use Closure;
use Tymon\JWTAuth\Facades\JWTAuth;
use Tymon\JWTAuth\Exceptions\JWTException;
use Tymon\JWTAuth\Exceptions\TokenExpiredException;
use Illuminate\Support\Facades\DB;

class JWTMiddleware
{
    public function handle($request, Closure $next)
    {
        if (!$request->header('Authorization')) {
            return response()->json([
                'success' => 'false',
                'message' => 'Authorization Token not found'
            ], 400);
        }

        try {
            $token = $request->header('Authorization');
            if (strpos($token, 'Bearer ') === 0) {
                $token = str_replace('Bearer ', '', $token);
            } else {
                return response()->json([
                    'success' => 'false',
                    'message' => 'Authorization Token format is invalid'
                ], 400);
            }

            $payload = JWTAuth::parseToken()->getPayload()->toArray();

            if (!isset($payload['sub'])) {
                return response()->json([
                    'success' => 'false',
                    'message' => 'User not found in token'
                ], 404);
            }

            $user = DB::table('cpuser')
                ->where('useractive', 'YES')
                ->where('userlogin', $payload['sub'])
                ->first();

            if (empty($user)) {
                return response()->json([
                    'success' => 'false',
                    'message' => 'User not found'
                ], 404);
            }

            // Sesi DB (T_USER_SESSION): token lama tanpa ID sesi langsung ditolak
            // (paksa login ulang sekali setelah fitur sesi aktif). Sesi yang
            // dicabut/kedaluarsa/idle ditolak dengan 401 yang sama seperti token
            // tidak valid supaya frontend membuka dialog login ulang.
            $sid = trim((string) ($payload['jti'] ?? ''));
            if ($sid === '') {
                return response()->json([
                    'success' => 'false',
                    'message' => 'Token is invalid'
                ], 401);
            }

            $sess = \App\Models\Mcpsession::assertActive($sid);
            if (!$sess['ok']) {
                return response()->json([
                    'success' => 'false',
                    'message' => 'Token is invalid'
                ], 401);
            }
        } catch (TokenExpiredException $e) {
            return response()->json([
                'success' => 'false',
                'message' => 'Token has expired'
            ], 401);
        } catch (JWTException $e) {
            return response()->json([
                'success' => 'false',
                'message' => 'Token is invalid'
            ], 401);
        }

        return $next($request);
    }
}