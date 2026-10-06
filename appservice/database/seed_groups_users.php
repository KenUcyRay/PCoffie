<?php

// Seed data: 5 group baru + akses menu + 1 akun login per group, dan
// merapikan akses GROUP_ADMIN menjadi hanya Module System.
//
// CARA JALANKAN (dari root repo tiket-app):
//   php appservice/database/seed_groups_users.php
//
// IDEMPOTENT: aman dijalankan berulang. Group & akun di-insert bila belum ada;
// akses menu tiap group dihapus lalu disisipkan ulang dari daftar tetap (hasilnya
// sama setiap kali dijalankan).
//
// Mengikuti logika aplikasi:
//  - group  -> CPMATRIX(DEFMODULE='GROUP_USERLOGIN')            (Mcpusergroup::create_group)
//  - akun   -> CPUSER dengan dbo.app_encrypt(password)          (Mcpuserlogin::create_user)
//  - akses  -> CPMENUACCESS(RGROUP, RMODULE, RMENUID) + semua   (Mcpusergroup::update_akses_group)
//              ancestor dari CPMENU.MPARRENT
//
// PENTING: password seed ini sengaja lemah dan dibuat langsung lewat
// dbo.app_encrypt (tidak melalui kebijakan password di Security Setting).
// Hanya untuk development/testing. Ganti atau nonaktifkan sebelum production.

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';

use Illuminate\Support\Facades\DB;

// ---------------------------------------------------------------------------
// Definisi group baru: kode => [nama, daftar MCODE leaf yang diizinkan]
// ---------------------------------------------------------------------------
$GROUPS = [
    // GROUP_EVENT removed — PCOFFIE warnet (see z_drop_event_family.sql)
    'GROUP_OFFICER' => [
        'name'  => 'Petugas Gerbang',
        'menus' => [
            40020002, // Scan Ticket
            40020003, // Scan History
        ],
    ],
    'GROUP_MERCH' => [
        'name'  => 'Operator Merchandise',
        'menus' => [
            20000001, // Home (Discovery, top-level)
            50010002, // Product List
            50010003, // My Purchase
            50020002, // Product Data
            50020003, // Seller Order
        ],
    ],
    'GROUP_MARKETING' => [
        'name'  => 'Operator Pemasaran',
        'menus' => [
            20000001, // Home (Discovery, top-level)
            20020002, // News List
            20020003, // Promo List
            60010002, // Promo Code
            60010003, // Ad Campaign
            60020002, // News Data
            60020003, // News Category
        ],
    ],
    'GROUP_FINANCE' => [
        'name'  => 'Keuangan',
        'menus' => [
            70010002, // Payment History
            70010003, // Invoice List
            70020002, // Sales Report
            70020003, // Payout Request
            70030002, // Seller Balance
            70030003, // Withdrawal
            70040001, // Bank Account (top-level)
        ],
    ],
];

// Akun: userlogin => [nama tampilan, group]
$USERS = [
    'officer'   => ['Petugas Gerbang',      'GROUP_OFFICER'],
    'merch'     => ['Operator Merchandise', 'GROUP_MERCH'],
    'marketing' => ['Operator Pemasaran',   'GROUP_MARKETING'],
    'finance'   => ['Keuangan',             'GROUP_FINANCE'],
];

// Akses Module System yang WAJIB ada untuk GROUP_ADMIN (leaf).
$ADMIN_SYSTEM_MENUS = [
    10000001, // User Login
    10000002, // User Group
    10010002, // Module List
    10010003, // Menu List
    10020002, // Category Data
    10020003, // City Data
    10020004, // Bank Data
    10020005, // Payment Method
    10020006, // Fee Setting
    10030002, // Security Setting
    10030003, // Session List
    10030004, // Blocked Access
    10040002, // Audit Log
    10040003, // System Log
    10040004, // Login History
    10050002, // Send Message
    10050003, // Message History
    10060002, // General Setting
    10060003, // Notification Template
];

// MODSYSTEM boleh tetap ada untuk admin (User Login/User Group/Module List/Menu
// List tidak boleh hilang agar admin tidak terkunci).
$ADMIN_KEEP_MODULES = ['MODSYSTEM'];

$log = function (string $msg) {
    echo $msg, PHP_EOL;
};

// Leaf + semua ancestor-nya (parent chain dari CPMENU.MPARRENT) -> daftar baris
// CPMENUACCESS (MCODE => MMODULE) yang harus ada agar child tampil di sidebar.
function resolveRows(array $leafMcodes): array
{
    global $app;
    $mcodes = array_map('intval', $leafMcodes);
    $rows = [];
    $frontier = $mcodes;
    for ($level = 0; $level < 5 && !empty($frontier); $level++) {
        $in = implode(',', array_fill(0, count($frontier), '?'));
        $found = DB::select(
            "SELECT MCODE, MPARRENT, MMODULE FROM CPMENU WHERE MCODE IN ($in)",
            $frontier
        );
        $parents = [];
        foreach ($found as $r) {
            $rows[(int) $r->MCODE] = (string) $r->MMODULE;
            $p = (int) $r->MPARRENT;
            if ($p !== 0) {
                $parents[$p] = $p;
            }
        }
        $missing = array_diff($mcodes, array_keys($rows));
        if (!empty($missing)) {
            $names = [];
            foreach ($missing as $m) {
                $names[] = $m;
            }
            throw new \RuntimeException('MCODE tidak ada di CPMENU: ' . implode(',', $names));
        }
        $frontier = array_values(array_unique($parents));
    }
    return $rows;
}

// Terapkan daftar akses untuk satu group (hapus akses lama group tsb, lalu
// sisipkan daftar hasil resolveRows). Idempotent.
function applyAccess(string $rgroup, array $rows): int
{
    DB::delete('DELETE FROM CPMENUACCESS WHERE RGROUP = ?', [$rgroup]);
    $added = 0;
    foreach ($rows as $mcode => $rmodule) {
        DB::insert(
            'INSERT INTO CPMENUACCESS (RGROUP, RMODULE, RMENUID) VALUES (?, ?, ?)',
            [$rgroup, $rmodule, (string) $mcode]
        );
        $added++;
    }
    return $added;
}

$log('== Seed group, akses menu, dan akun login ==');

$summary = [];

// ---------------------------------------------------------------------------
// 1. Group baru (CPMATRIX DEFMODULE='GROUP_USERLOGIN')
// ---------------------------------------------------------------------------
foreach ($GROUPS as $code => $def) {
    $exists = DB::select(
        "SELECT DEFID FROM CPMATRIX WHERE DEFMODULE = 'GROUP_USERLOGIN' AND DEFCODE = ?",
        [$code]
    );
    if (empty($exists)) {
        DB::insert(
            "INSERT INTO CPMATRIX (DEFMODULE, DEFCODE, DEFNAME, SYSCREATEUSER, SYSCREATEDATE)
             VALUES ('GROUP_USERLOGIN', ?, ?, 'system', GETDATE())",
            [$code, $def['name']]
        );
        $log("group dibuat : $code ({$def['name']})");
    } else {
        $log("group sudah ada: $code");
    }
}
$log('');

// ---------------------------------------------------------------------------
// 2. Akses menu GROUP_ADMIN: hanya Module System (hapus menu di luar System)
// ---------------------------------------------------------------------------
$adminKeepRows = resolveRows($ADMIN_SYSTEM_MENUS);
// pastikan hanya baris MODSYSTEM yang dipertahankan
$onlySystem = [];
foreach ($adminKeepRows as $mcode => $module) {
    if (in_array($module, $ADMIN_KEEP_MODULES, true)) {
        $onlySystem[$mcode] = $module;
    }
}
$adminKeepRows = $onlySystem;
if (count($adminKeepRows) !== count($ADMIN_SYSTEM_MENUS) + 7) {
    // 19 leaf + 7 section parent MODSYSTEM
    throw new \RuntimeException('Jumlah baris MODSYSTEM untuk admin tidak sesuai: ' . count($adminKeepRows));
}
$n = applyAccess('GROUP_ADMIN', $adminKeepRows);
$log("GROUP_ADMIN : akses diset ulang -> $n baris (19 menu System + 7 induk modul)");

// ---------------------------------------------------------------------------
// 3. Akses menu group baru
// ---------------------------------------------------------------------------
foreach ($GROUPS as $code => $def) {
    $rows = resolveRows($def['menus']);
    $n = applyAccess($code, $rows);
    $summary[$code] = ['menus' => count($def['menus']), 'rows' => $n];
    $log("akses $code : $n baris CPMENUACCESS (dari " . count($def['menus']) . ' menu)');
}
$log('');

// ---------------------------------------------------------------------------
// 4. Akun login (CPUSER) - password lewat dbo.app_encrypt seperti Mcpuserlogin
// ---------------------------------------------------------------------------
foreach ($USERS as $login => $def) {
    $exists = DB::select('SELECT USERID FROM CPUSER WHERE USERLOGIN = ?', [$login]);
    if (!empty($exists)) {
        $log("akun sudah ada: $login");
        continue;
    }
    DB::insert(
        "INSERT INTO CPUSER (USERLOGIN, USERNAME, USERPASSWORD, USERGROUP, USERACTIVE,
                             USEREMAIL, SYSCREATEUSER, SYSCREATEDATE)
         VALUES (?, ?, dbo.app_encrypt(?), ?, 'YES', ?, 'system', GETDATE())",
        [
            $login,
            $def[0],
            $login, // password = username (lemah, hanya dev/test)
            $def[1],
            $login . '@app.local',
        ]
    );
    $log("akun dibuat  : $login (group {$def[1]}, password = $login)");
}

$log('');
$log('== Ringkasan ==');
$rows = DB::select('SELECT RGROUP, COUNT(*) AS C FROM CPMENUACCESS GROUP BY RGROUP ORDER BY RGROUP');
foreach ($rows as $r) {
    $log("  " . str_pad($r->RGROUP, 18) . ' ' . $r->C . ' baris akses');
}
$users = DB::select('SELECT USERLOGIN, USERGROUP, USERACTIVE FROM CPUSER ORDER BY USERID');
foreach ($users as $u) {
    $log('  ' . str_pad($u->USERLOGIN, 18) . ' group=' . $u->USERGROUP . ' aktif=' . $u->USERACTIVE);
}
$log('');
$log('PERINGATAN: password seed (sama dengan username) tidak memenuhi Security');
$log('Setting dan hanya untuk development/testing. Ganti/nonaktifkan sebelum production.');