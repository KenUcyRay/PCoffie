<?php

namespace App\Models;

/**
 * Filter per kolom untuk DataTable (components/DataTable.tsx).
 *
 * Frontend mengirim `filters` sebagai JSON string:
 *   {"USERLOGIN":"adi","USERACTIVE":"YES"}
 * Setiap entri jadi satu syarat AND dengan LIKE %nilai%, jadi bisa diklik dari
 * kolom mana pun. Nama kolom dibersihkan lebih dulu (hanya A-Z a-z 0-9 _)
 * supaya aman dari SQL injection.
 *
 * Backward compatible: kalau `filters` tidak dikirim, `q` tetap dipakai
 * seperti sebelumnya.
 */
trait ColumnFilter
{
    /**
     * @param  array $param payload request
     * @return array{0:string,1:array} [fragmen WHERE, argumen binding]
     */
    protected static function buildColumnFilter($param)
    {
        $raw  = $param['filters'] ?? '{}';
        $json = is_string($raw) ? json_decode($raw, true) : $raw;
        if (!is_array($json)) {
            return ['', []];
        }

        $where = '';
        $args  = [];
        foreach ($json as $col => $val) {
            $col = preg_replace('/[^A-Za-z0-9_]/', '', (string) $col);
            $val = trim((string) $val);
            // "" / "ALL" / "__ALL__" berarti tanpa filter pada kolom ini.
            $up  = strtoupper($val);
            if ($col === '' || $val === '' || $up === 'ALL' || $up === '__ALL__') {
                continue;
            }
            $where .= " AND A.$col LIKE ?";
            $args[] = '%' . $val . '%';
        }

        return [$where, $args];
    }
}