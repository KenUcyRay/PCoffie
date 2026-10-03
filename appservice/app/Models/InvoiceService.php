<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Invoice: terbit otomatis oleh layanan pembayaran, TANPA endpoint tambah/
// ubah/hapus. Isi tidak berubah setelah terbit (hanya STATUS -> DIBATALKAN).
// Nomor unik INV/YYYYMM/6-digit via T_INVOICE_SEQUENCE (dikunci saat terbit).
class InvoiceService extends Model
{
    // Terbitkan invoice untuk pembayaran. $d: RECIPIENT, RECIPIENTEMAIL?,
    // RECIPIENTADDR?, LINES(array), TOTAL(int), ISSUEDATE(Y-m-d)?.
    // Return INVNO. Dipanggil dalam transaksi pemanggil.
    public static function issue(int $paymentId, string $refType, array $d): string
    {
        $ym = date('Ym', isset($d['ISSUEDATE']) ? strtotime($d['ISSUEDATE']) : time());

        // Kunci baris bulan (atau buat) supaya nomor urut tanpa ganda/loncat.
        $row = DB::selectOne("
            SELECT LASTNO FROM T_INVOICE_SEQUENCE WITH (UPDLOCK, HOLDLOCK)
            WHERE YYYYMM = ?
        ", [$ym]);
        if (!$row) {
            DB::insert("INSERT INTO T_INVOICE_SEQUENCE (YYYYMM, LASTNO) VALUES (?, 0)", [$ym]);
            $last = 0;
        } else {
            $last = (int) $row->LASTNO;
        }
        $next = $last + 1;
        DB::update("UPDATE T_INVOICE_SEQUENCE SET LASTNO = ? WHERE YYYYMM = ?", [$next, $ym]);
        $no = 'INV/' . $ym . '/' . str_pad((string) $next, 6, '0', STR_PAD_LEFT);

        DB::insert("
            INSERT INTO T_INVOICE
                (INVNO, PAYMENTID, REFTYPE, ISSUEDATE, RECIPIENT, RECIPIENTEMAIL,
                 RECIPIENTADDR, LINES, TOTAL, STATUS, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?,
                 ?, ?, ?, 'TERBIT', ?, GETDATE())
        ", [
            $no, $paymentId, strtoupper($refType),
            $d['ISSUEDATE'] ?? date('Y-m-d'),
            mb_substr(trim((string) ($d['RECIPIENT'] ?? '')), 0, 100),
            mb_substr(trim((string) ($d['RECIPIENTEMAIL'] ?? '')), 0, 100) ?: null,
            mb_substr(trim((string) ($d['RECIPIENTADDR'] ?? '')), 0, 500) ?: null,
            json_encode($d['LINES'] ?? [], JSON_UNESCAPED_UNICODE),
            (int) ($d['TOTAL'] ?? 0),
            mb_substr(trim((string) ($d['ACTOR'] ?? '')), 0, 25) ?: null,
        ]);

        return $no;
    }

    // Batalkan invoice milik pembayaran (dipanggil saat pembayaran dibatalkan).
    public static function cancelByPayment(int $paymentId, string $reason, string $actor): void
    {
        DB::update("
            UPDATE T_INVOICE
            SET STATUS = 'DIBATALKAN', CANCELREASON = ?,
                SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PAYMENTID = ? AND STATUS = 'TERBIT'
        ", [mb_substr($reason, 0, 200), mb_substr($actor, 0, 25) ?: null, $paymentId]);
    }
}
