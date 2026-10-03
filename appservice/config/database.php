<?php

use Illuminate\Support\Str;

/*
| Override config/database.php milik Lumen.
|
| Yang ditambahkan hanya opsi TLS untuk koneksi sqlsrv. Driver ODBC 18+
| memaksa enkripsi dan memverifikasi sertifikat server; SQL Server memakai
| sertifikat self-signed, sehingga koneksi gagal dengan:
|   SSL Provider: [error:0A000086] certificate verify failed: self-signed certificate
|
| DB_TRUST_SERVER_CERTIFICATE=1 membuat driver mempercayai sertifikat
| tersebut (SQL Server ada di mesin yang sama, jadi ini cukup aman).
| Kalau nanti SQL Server memakai sertifikat dari CA resmi, set nilainya ke 0.
*/

return [

    'default' => env('DB_CONNECTION', 'sqlsrv'),

    'connections' => [

        'sqlsrv' => [
            'driver' => 'sqlsrv',
            'host' => env('DB_HOST', 'localhost'),
            'port' => env('DB_PORT', 1433),
            'database' => env('DB_DATABASE', 'forge'),
            'username' => env('DB_USERNAME', 'forge'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => env('DB_PREFIX', ''),
            'encrypt' => env('DB_ENCRYPT', 'yes'),
            'trust_server_certificate' => env('DB_TRUST_SERVER_CERTIFICATE', '1'),
        ],

    ],

    'migrations' => 'migrations',

    'redis' => [

        'client' => env('REDIS_CLIENT', 'phpredis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug(env('APP_NAME', 'lumen'), '_').'_database_'),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
        ],

        'cache' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
        ],

    ],

];