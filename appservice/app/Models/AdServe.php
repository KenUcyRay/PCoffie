<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Helper data iklan untuk halaman publik (dipakai Home/event, TANPA auth).
// Kampanye AKTIF yang periodenya mencakup hari ini, kapasitas per posisi.
// Klik dicatat atomik ke T_AD_STAT_DAILY (UPDATE dulu, INSERT bila belum ada).
class AdServe extends Model
{
    // Iklan untuk satu posisi: rotasi tanggal+ID (stabil dalam sehari).
    // Return list array (bisa kosong). Tanpa auth.
    public static function forPosition(string $code, int $max = 3): array
    {
        $pos = DB::selectOne("
            SELECT POSITIONID, CAPACITY FROM T_AD_POSITION
            WHERE POSCODE = ? AND ISACTIVE = 'YES'
        ", [strtoupper(trim($code))]);
        if (!$pos) {
            return [];
        }

        $today = date('Y-m-d');
        $cap = max(1, min($max, (int) $pos->CAPACITY));
        $rows = DB::select("
            SELECT C.CAMPAIGNID, C.TITLE, C.BANNERIMAGE, C.LINKTYPE, C.EVENTID, C.LINKURL
            FROM T_AD_CAMPAIGN C
            WHERE C.POSITIONID = ? AND C.STATUS = 'AKTIF'
              AND C.STARTDATE <= ? AND C.ENDDATE >= ?
            ORDER BY C.CAMPAIGNID
        ", [(int) $pos->POSITIONID, $today, $today]);
        if (empty($rows)) {
            return [];
        }

        // Offset harian (stabil sehari, tanpa penyimpanan).
        $off = (int) date('z') % count($rows);
        $rot = array_merge(array_slice($rows, $off), array_slice($rows, 0, $off));

        $out = [];
        foreach (array_slice($rot, 0, $cap) as $r) {
            $href = '#';
            if (strtoupper(trim((string) $r->LINKTYPE)) === 'EVENT' && !empty($r->EVENTID)) {
                $href = '/tiket-app/event/' . (int) $r->EVENTID;
            } elseif (!empty($r->LINKURL)) {
                $href = (string) $r->LINKURL;
            }
            $out[] = [
                'CAMPAIGNID' => (int) $r->CAMPAIGNID,
                'TITLE' => (string) $r->TITLE,
                'BANNER' => !empty($r->BANNERIMAGE) ? ('/tiket-app/uploads/ads/' . $r->BANNERIMAGE) : '',
                'HREF' => $href,
            ];
        }
        return $out;
    }

    // Tayang (impression): dinaikkan SEKALIGUS dengan klik di recordClick —
    // halaman publik memanggil recordView per render batch akan membanjiri DB,
    // sehingga tayang dihitung dari recordClick saja? TIDAK: tayang dicatat
    // agregat ringan (1x per render halaman, bukan per slot).
    // Return true bila tercatat.
    public static function recordView(int $campaignId): bool
    {
        return self::bump($campaignId, 'IMPRESSIONS', 1);
    }

    // Klik: tayang+klik naik bersama (klik berarti tayang). Anti dobel via
    // token sekali pakai? Tetap hitung tiap klik (wajar untuk iklan).
    public static function recordClick(int $campaignId): bool
    {
        return self::bump($campaignId, 'CLICKS', 1, true);
    }

    // Tambah kolom hari ini secara atomik. $withView: klik ikut naikkan tayang.
    private static function bump(int $campaignId, string $col, int $n, bool $withView = false): bool
    {
        if ($campaignId <= 0 || ($col !== 'IMPRESSIONS' && $col !== 'CLICKS')) {
            return false;
        }
        $today = date('Y-m-d');
        $extra = $withView ? ', IMPRESSIONS = IMPRESSIONS + ' . $n : '';
        $hit = DB::update("
            UPDATE T_AD_STAT_DAILY
            SET " . $col . " = " . $col . " + " . $n . $extra . "
            WHERE CAMPAIGNID = ? AND STATDATE = ?
        ", [$campaignId, $today]);
        if ($hit > 0) {
            return true;
        }
        try {
            DB::insert("
                INSERT INTO T_AD_STAT_DAILY (CAMPAIGNID, STATDATE, IMPRESSIONS, CLICKS)
                VALUES (?, ?, ?, ?)
            ", [$campaignId, $today, $withView ? $n : ($col === 'IMPRESSIONS' ? $n : 0), $col === 'CLICKS' ? $n : 0]);
            return true;
        } catch (\Throwable $e) {
            // Balapan INSERT: baris sudah ada -> UPDATE lagi.
            DB::update("
                UPDATE T_AD_STAT_DAILY
                SET " . $col . " = " . $col . " + " . $n . $extra . "
                WHERE CAMPAIGNID = ? AND STATDATE = ?
            ", [$campaignId, $today]);
            return true;
        }
    }
}
