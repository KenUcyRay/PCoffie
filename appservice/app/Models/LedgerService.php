<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Buku besar Finance: satu-satunya jalan menulis T_LEDGER (selain BACKFILL).
// Hanya-tambah (trigger DB). Saldo = SUM per bucket; dana berpindah lewat
// pasangan entri lawan dalam satu transaksi. Tanpa koreksi manual.
//
// Jenis entri: SALE (PENDING +), RELEASE (PENDING -/AVAILABLE +),
// REVERSAL (PENDING -), REFUND (AVAILABLE -), WITHDRAWAL (AVAILABLE -),
// WITHDRAWAL_REVERSAL (AVAILABLE +).
class LedgerService extends Model
{
    // Satu entri. $e: SELLERID, BUCKET, ENTRYTYPE, AMOUNT(int, bertanda),
    // REFTYPE, REFID, NOTE?, ACTOR?. Bole dipanggil dalam transaksi pemanggil.
    public static function add(array $e): int
    {
        $bucket = strtoupper(trim((string) ($e['BUCKET'] ?? '')));
        $type = strtoupper(trim((string) ($e['ENTRYTYPE'] ?? '')));
        $allowedBucket = ['PENDING', 'AVAILABLE'];
        $allowedType = ['SALE', 'RELEASE', 'REVERSAL', 'REFUND', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL'];
        if (!in_array($bucket, $allowedBucket, true) || !in_array($type, $allowedType, true)) {
            throw new \InvalidArgumentException('Entri buku besar tidak valid.');
        }
        DB::insert("
            INSERT INTO T_LEDGER
                (ACCOUNT, SELLERID, BUCKET, ENTRYTYPE, AMOUNT,
                 REFTYPE, REFID, NOTE, ACTOR)
            VALUES ('SELLER', ?, ?, ?, ?,
                 ?, ?, ?, ?)
        ", [
            (int) $e['SELLERID'], $bucket, $type, (int) ($e['AMOUNT'] ?? 0),
            strtoupper(trim((string) ($e['REFTYPE'] ?? ''))), (int) ($e['REFID'] ?? 0),
            mb_substr(trim((string) ($e['NOTE'] ?? '')), 0, 200) ?: null,
            mb_substr(trim((string) ($e['ACTOR'] ?? '')), 0, 25) ?: null,
        ]);
        return (int) DB::getPdo()->lastInsertId();
    }

    // Saldo per bucket dari buku besar. Return ['PENDING'=>int,'AVAILABLE'=>int].
    public static function balance(int $sellerId): array
    {
        $out = ['PENDING' => 0, 'AVAILABLE' => 0];
        $rows = DB::select("
            SELECT BUCKET, ISNULL(SUM(AMOUNT), 0) AS S FROM T_LEDGER
            WHERE SELLERID = ? GROUP BY BUCKET
        ", [$sellerId]);
        foreach ($rows as $r) {
            $b = strtoupper(trim((string) $r->BUCKET));
            if (isset($out[$b])) {
                $out[$b] = (int) round((float) $r->S);
            }
        }
        return $out;
    }

    // Jumlah entri jenis tertentu untuk referensi (penjaga sekali-proses).
    public static function entryCount(string $type, string $refType, int $refId, ?int $sellerId = null): int
    {
        $sql = "SELECT COUNT(*) AS C FROM T_LEDGER WHERE ENTRYTYPE = ? AND REFTYPE = ? AND REFID = ?";
        $args = [strtoupper($type), strtoupper($refType), $refId];
        if ($sellerId !== null) {
            $sql .= " AND SELLERID = ?";
            $args[] = $sellerId;
        }
        $row = DB::selectOne($sql, $args);
        return $row ? (int) $row->C : 0;
    }

    // Net satu referensi di satu bucket (SALE+REFUND+REVERSAL+RELEASE...).
    // Pelepasan/pengembalian memakai net ini, bukan SUM SALE saja, supaya
    // refund parsial sebelumnya ikut terhitung dan tidak double-count.
    public static function bucketNet(string $refType, int $refId, string $bucket): int
    {
        $row = DB::selectOne("
            SELECT ISNULL(SUM(AMOUNT), 0) AS S FROM T_LEDGER
            WHERE REFTYPE = ? AND REFID = ? AND BUCKET = ?
        ", [strtoupper($refType), $refId, strtoupper($bucket)]);
        return $row ? Money::r($row->S) : 0;
    }
}
