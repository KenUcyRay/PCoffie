<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Katalog produk (Merchandise Shop, module Merchandise). Hanya baca.
// SEGMENT frontend: home/mproduct/mproduct. Menu CPMENU MCONTROL = mproduct.
//
// Memakai ulang query Mmproductdata::catalogList/catalogDetail (tanpa salin).
// Default: produk AKTIF stok>0 dari penjual AKTIF.
class Mmproduct extends Model
{
    const MCODE = 50010002;

    // Tolak bila group user tidak punya akses menu Product List.
    // Return pesan error atau null bila lolos.
    private static function requireAccess($param): ?string
    {
        $res = json_decode(Mhak_akses::menu_akses([
            'VUSERLOGIN' => $param['VUSERLOGIN'] ?? '',
            'vdata' => json_encode(['mcode' => self::MCODE]),
        ]), true) ?: [];
        if (strtolower(trim((string) ($res['success'] ?? 'false'))) !== 'true') {
            return (string) ($res['message'] ?? 'Anda tidak memiliki hak akses untuk membuka menu ini.');
        }
        return null;
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        [$rows, $total] = Mmproductdata::catalogList($param);
        if (is_string($rows) && strpos($rows, '__ERROR__') === 0) {
            return json_encode(['success' => 'false', 'message' => substr($rows, 9)]);
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $total
        ]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PRODUCTID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PRODUCTID tidak ditemukan.']);
        }

        $arr = Mmproductdata::catalogDetail((int) $id);
        if (!$arr) {
            return json_encode(['success' => 'false', 'message' => 'Data produk tidak ditemukan.']);
        }

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }
}
