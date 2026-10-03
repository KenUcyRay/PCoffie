<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Inbox pesan milik user yang login (dipakai ikon lonceng di header).
// Tanpa tabel baru: baca dari dbo.T_MESSAGE + dbo.T_MESSAGE_RECIPIENT.
// SEGMENT frontend: home/cpmessageinbox/cpmessageinbox (model ini tidak punya
// menu CPMENU — inbox milik tiap user, TANPA cek hak akses menu).
//
// Identitas SELALU dari token/sesi ($param['VUSERLOGIN']), bukan dari parameter
// request: user hanya bisa membaca pesannya sendiri. Pesan DITARIK atau yang
// waktu tampilnya sudah berakhir tidak ditampilkan.
class Mcpmessageinbox extends Model
{
    // Syarat pesan masih tampil di inbox: TERKIRIM dan belum lewat EXPIRESAT.
    private static function visibleWhere(): string
    {
        return "M.STATUS = 'TERKIRIM' AND (M.EXPIRESAT IS NULL OR M.EXPIRESAT > GETDATE())";
    }

    public static function read_unread_count($param)
    {
        $me = $param['VUSERLOGIN'] ?? '';
        if ($me === '') {
            return json_encode(['success' => 'false', 'message' => 'User tidak dikenal.']);
        }

        $row = DB::selectOne("
            SELECT COUNT(*) AS UNREAD,
                   SUM(CASE WHEN M.PRIORITY = 'DARURAT' THEN 1 ELSE 0 END) AS URGENT
            FROM T_MESSAGE_RECIPIENT R
            JOIN T_MESSAGE M ON M.MSGID = R.MSGID
            WHERE R.USERLOGIN = ? AND R.READSTATUS = 'BELUM_DIBACA'
              AND " . self::visibleWhere() . "
        ", [$me]);

        return json_encode(['success' => true, 'Rows' => [[
            'UNREAD' => (int) ($row->UNREAD ?? 0),
            'URGENT' => (int) ($row->URGENT ?? 0),
        ]]]);
    }

    // Daftar pesan milik sendiri, terbaru dulu (paging + cari judul).
    public static function read_data($param)
    {
        $me = $param['VUSERLOGIN'] ?? '';
        if ($me === '') {
            return json_encode(['success' => 'false', 'message' => 'User tidak dikenal.']);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $unreadOnly = strtoupper(trim((string) ($param['unread_only'] ?? ''))) === 'YES';

        $where = " WHERE R.USERLOGIN = ? AND " . self::visibleWhere();
        $args = [$me];
        if ($unreadOnly) {
            $where .= " AND R.READSTATUS = 'BELUM_DIBACA'";
        }
        if ($q !== '') {
            $where .= " AND M.TITLE LIKE ?";
            $args[] = '%' . $q . '%';
        }

        $countRow  = DB::selectOne("
            SELECT COUNT(*) AS TOTAL
            FROM T_MESSAGE_RECIPIENT R
            JOIN T_MESSAGE M ON M.MSGID = R.MSGID
            " . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "
            SELECT M.MSGID, M.TITLE, M.BODY, M.PRIORITY, M.SENTAT, M.EXPIRESAT,
                   M.SENDERLOGIN, R.READSTATUS, R.READTIME
            FROM T_MESSAGE_RECIPIENT R
            JOIN T_MESSAGE M ON M.MSGID = R.MSGID
            " . $where . "
            ORDER BY M.SENTAT DESC, M.MSGID DESC
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);

        return json_encode([
            'success' => true,
            'Rows' => $result,
            'TotalRows' => $totalRows
        ]);
    }

    // Tandai satu pesan milik sendiri sudah dibaca.
    public static function mark_read($param)
    {
        $me = $param['VUSERLOGIN'] ?? '';
        if ($me === '') {
            return json_encode(['success' => 'false', 'message' => 'User tidak dikenal.']);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $msgid = $vdata['MSGID'] ?? null;

        if (empty($msgid)) {
            return json_encode(['success' => 'false', 'message' => 'MSGID tidak ditemukan.']);
        }

        // Hanya baris milik sendiri DAN pesannya masih tampil.
        $hit = DB::selectOne("
            SELECT R.RECIPIENTID FROM T_MESSAGE_RECIPIENT R
            JOIN T_MESSAGE M ON M.MSGID = R.MSGID
            WHERE R.MSGID = ? AND R.USERLOGIN = ?
              AND " . self::visibleWhere() . "
        ", [$msgid, $me]);

        if (!$hit) {
            return json_encode(['success' => 'false', 'message' => 'Data pesan tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_MESSAGE_RECIPIENT
            SET READSTATUS = 'DIBACA', READTIME = GETDATE()
            WHERE RECIPIENTID = ? AND READSTATUS = 'BELUM_DIBACA'
        ", [$hit->RECIPIENTID]);

        return json_encode(['success' => 'true', 'message' => 'Pesan ditandai sudah dibaca.']);
    }

    // Tandai SEMUA pesan milik sendiri yang masih tampil sudah dibaca.
    public static function mark_all_read($param)
    {
        $me = $param['VUSERLOGIN'] ?? '';
        if ($me === '') {
            return json_encode(['success' => 'false', 'message' => 'User tidak dikenal.']);
        }

        $n = DB::update("
            UPDATE R SET READSTATUS = 'DIBACA', READTIME = GETDATE()
            FROM T_MESSAGE_RECIPIENT R
            JOIN T_MESSAGE M ON M.MSGID = R.MSGID
            WHERE R.USERLOGIN = ? AND R.READSTATUS = 'BELUM_DIBACA'
              AND " . self::visibleWhere() . "
        ", [$me]);

        return json_encode([
            'success' => 'true',
            'message' => $n > 0 ? $n . ' pesan ditandai sudah dibaca.' : 'Tidak ada pesan belum dibaca.',
        ]);
    }
}
