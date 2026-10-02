<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;

// Pencatat audit pusat (satu-satunya pintu tulis ke T_AUDIT_LOG).
//
// Cara pakai dari model lain (setelah aksi utama BERHASIL):
//   AuditTrail::log([
//     'action'   => 'CREATE',            // CREATE|UPDATE|DELETE|STATUS|EXPORT|LAINNYA
//     'mcontrol' => 'cp_userlogin',      // MCONTROL halaman asal
//     'page'     => 'User Login',        // nama halaman untuk dibaca manusia
//     'table'    => 'CPUSER',            // nama tabel yang diubah
//     'dataId'   => 'adi',              // business key baris (string)
//     'summary'  => 'USERLOGIN adi',     // ringkasan 1 baris
//     'before'   => $rowLama,            // array|null ([] untuk create)
//     'after'    => $rowBaru,            // array|null ([] untuk delete)
//     'userlogin'=> $param['VUSERLOGIN'] ?? '',
//   ]);
//
// - User/ID/IP/UA/waktu diisi otomatis (bukan dari parameter).
// - Kolom sensitif disamarkan otomatis (lihat SENSITIVE below).
// - Gagal mencatat TIDAK PERNAH menggagalkan aksi utama (try/catch + error_log).
// - Sengaja tanpa DB::transaction: project tidak memakai transaksi di mana pun;
//   pencatatan dilakukan setelah CUD sukses supaya tidak ada catatan tanpa perubahan.
class AuditTrail
{
    // Substring nama kolom (UPPER) yang nilainya disamarkan penuh.
    const SENSITIVE = [
        'PASSWORD', 'PASSWD', 'PASSHASH', 'PWD',
        'TOKEN', 'APIKEY', 'API_KEY', 'SECRET', 'CLIENTSECRET',
        'PIN', 'OTP', 'CVV', 'CVC',
    ];

    // Substring nama kolom (UPPER) yang ditampilkan sebagian (4 awal + 2 akhir).
    const PARTIAL = [
        'REKENING', 'NOREK', 'ACCNO', 'ACCOUNTNO', 'Norek',
        'KARTU', 'CARDNO', 'NOKARTU',
    ];

    public static function log(array $p): void
    {
        try {
            $login = trim((string) ($p['userlogin'] ?? ''));
            $user = null;
            if ($login !== '') {
                $user = DB::selectOne(
                    "SELECT USERID, USERNAME FROM CPUSER WHERE USERLOGIN = ?",
                    [$login]
                );
            }

            $ip = '';
            $ua = '';
            try {
                if (function_exists('request')) {
                    $req = request();
                    $ip = (string) ($req->ip() ?? '');
                    $ua = substr((string) ($req->userAgent() ?? ''), 0, 255);
                }
            } catch (\Throwable $e) {
                // CLI / tanpa request HTTP: biarkan kosong
            }

            DB::insert("
                INSERT INTO T_AUDIT_LOG
                    (USERID, USERLOGIN, USERNAME, ACTION, MCONTROL, PAGENAME,
                     TABLENAME, DATAID, SUMMARY, BEFOREJSON, AFTERJSON, USERIP, USERAGENT)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ", [
                $user ? (int) $user->USERID : null,
                $login !== '' ? $login : null,
                $user ? (string) ($user->USERNAME ?? '') : null,
                strtoupper(trim((string) ($p['action'] ?? 'LAINNYA'))),
                $p['mcontrol'] ?? null,
                $p['page'] ?? null,
                $p['table'] ?? null,
                isset($p['dataId']) ? (string) $p['dataId'] : null,
                isset($p['summary']) ? mb_substr((string) $p['summary'], 0, 200) : null,
                self::encode($p['before'] ?? []),
                self::encode($p['after'] ?? []),
                $ip !== '' ? $ip : null,
                $ua !== '' ? $ua : null,
            ]);
        } catch (\Throwable $e) {
            // Kegagalan mencatat tidak boleh menggagalkan aksi utama.
            error_log('[AuditTrail] gagal mencatat: ' . $e->getMessage());
        }
    }

    private static function encode($data): ?string
    {
        if (empty($data)) {
            return null;
        }
        $json = json_encode(self::mask(is_array($data) ? $data : (array) $data), JSON_UNESCAPED_UNICODE);
        return $json === false ? null : $json;
    }

    // Samarkan kolom sensitif. Public agar bisa diuji langsung.
    public static function mask(array $row): array
    {
        $out = [];
        foreach ($row as $k => $v) {
            $uk = strtoupper((string) $k);
            $hit = false;
            foreach (self::SENSITIVE as $s) {
                if (strpos($uk, $s) !== false) {
                    $hit = true;
                    break;
                }
            }
            if ($hit) {
                $out[$k] = '***';
                continue;
            }
            $part = false;
            foreach (self::PARTIAL as $s) {
                if (strpos($uk, strtoupper($s)) !== false) {
                    $part = true;
                    break;
                }
            }
            if ($part && is_string($v) && strlen($v) > 6) {
                $out[$k] = substr($v, 0, 4) . '****' . substr($v, -2);
                continue;
            }
            $out[$k] = $v;
        }
        return $out;
    }
}
