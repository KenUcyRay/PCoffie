<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Kirim pesan broadcast (Broadcast Message, module System).
// Tabel dbo.T_MESSAGE + dbo.T_MESSAGE_RECIPIENT.
// SEGMENT frontend: home/cpmessagesend/cpmessagesend. Menu CPMENU MCONTROL = cp_message_send.
//
// read_groups/read_users/preview_count/process_send. Pengiriman ATOMIK dalam
// satu transaksi DB (satu-satunya transaksi di project, terbatas method ini):
// pesan + seluruh baris penerima tersimpan semuanya atau tidak sama sekali.
// Klik ganda dicegah idempotency key (kolom IDEMPOTENCYKEY, unik bila diisi).
class Mcpmessagesend extends Model
{
    const MCODE = 10050002;

    // Tolak bila group user tidak punya akses menu Send Message.
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

    // Daftar group untuk pilihan target (dari CPMATRIX GROUP_USERLOGIN).
    public static function read_groups($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $result = DB::select("
            SELECT DEFCODE, DEFNAME FROM CPMATRIX
            WHERE DEFMODULE = 'GROUP_USERLOGIN'
            ORDER BY DEFCODE
        ");

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    // Cari user aktif untuk pilihan target (q opsional, maks 100 baris).
    public static function read_users($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $q = trim((string) ($param['q'] ?? ''));
        $where = " WHERE USERACTIVE = 'YES'";
        $args = [];
        if ($q !== '') {
            $where .= " AND (USERLOGIN LIKE ? OR USERNAME LIKE ?)";
            $args = ['%' . $q . '%', '%' . $q . '%'];
        }

        $result = DB::select("
            SELECT TOP 100 USERID, USERLOGIN, USERNAME, USERGROUP
            FROM CPUSER
            " . $where . "
            ORDER BY USERLOGIN
        ", $args);

        return json_encode(['success' => true, 'Rows' => $result]);
    }

    // Selesaikan daftar penerima: ALL/GROUP/USER -> user aktif, tanpa duplikat.
    // Return [ ['USERID'=>, 'USERLOGIN'=>], ... ]. User nonaktif/unknown diabaikan.
    // Daftar dibekukan saat kirim (snapshot ke T_MESSAGE_RECIPIENT).
    private static function resolveRecipients(string $type, array $targets): array
    {
        if ($type === 'ALL') {
            $rows = DB::select("
                SELECT USERID, USERLOGIN FROM CPUSER
                WHERE USERACTIVE = 'YES' ORDER BY USERID
            ");
        } elseif ($type === 'GROUP') {
            $groups = [];
            foreach ($targets as $g) {
                $g = trim((string) $g);
                if ($g !== '') {
                    $groups[] = $g;
                }
            }
            if (empty($groups)) {
                return [];
            }
            $ph = implode(',', array_fill(0, count($groups), '?'));
            $rows = DB::select("
                SELECT USERID, USERLOGIN FROM CPUSER
                WHERE USERACTIVE = 'YES' AND USERGROUP IN (" . $ph . ")
                ORDER BY USERID
            ", $groups);
        } elseif ($type === 'USER') {
            $ids = [];
            foreach ($targets as $id) {
                if (filter_var($id, FILTER_VALIDATE_INT) !== false && (int) $id > 0) {
                    $ids[] = (int) $id;
                }
            }
            if (empty($ids)) {
                return [];
            }
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $rows = DB::select("
                SELECT USERID, USERLOGIN FROM CPUSER
                WHERE USERACTIVE = 'YES' AND USERID IN (" . $ph . ")
                ORDER BY USERID
            ", $ids);
        } else {
            return [];
        }

        // Hapus duplikat per USERID.
        $out = [];
        $seen = [];
        foreach ($rows as $r) {
            $uid = (int) $r->USERID;
            if (isset($seen[$uid])) {
                continue;
            }
            $seen[$uid] = true;
            $out[] = ['USERID' => $uid, 'USERLOGIN' => (string) $r->USERLOGIN];
        }
        return $out;
    }

    // Pratinjau jumlah penerima sebelum kirim.
    public static function preview_count($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $type = strtoupper(trim((string) ($vdata['TARGETTYPE'] ?? '')));
        $targets = $vdata['TARGET'] ?? [];
        if (!is_array($targets)) {
            $targets = [];
        }

        if ($type !== 'ALL' && $type !== 'GROUP' && $type !== 'USER') {
            return json_encode(['success' => 'false', 'message' => 'Jenis target harus ALL, GROUP, atau USER.']);
        }

        $recips = self::resolveRecipients($type, $targets);
        $sample = array_slice(array_column($recips, 'USERLOGIN'), 0, 5);

        return json_encode(['success' => true, 'Rows' => [[
            'COUNT' => count($recips),
            'SAMPLE' => implode(', ', $sample),
        ]]]);
    }

    // Validasi isi kiriman. $vdata sudah disanitasi. Return pesan atau null.
    private static function validate($vdata): ?string
    {
        $title = trim((string) ($vdata['TITLE'] ?? ''));
        $body = trim((string) ($vdata['BODY'] ?? ''));
        $prio = strtoupper(trim((string) ($vdata['PRIORITY'] ?? '')));
        $type = strtoupper(trim((string) ($vdata['TARGETTYPE'] ?? '')));
        $targets = $vdata['TARGET'] ?? [];
        $expRaw = trim((string) ($vdata['EXPIRESAT'] ?? ''));

        if ($title === '') {
            return 'Judul wajib diisi.';
        }
        if (mb_strlen($title) > 100) {
            return 'Judul maksimal 100 karakter.';
        }
        if ($body === '') {
            return 'Isi pesan wajib diisi.';
        }
        if (mb_strlen($body) > 2000) {
            return 'Isi pesan maksimal 2000 karakter.';
        }
        if (!in_array($prio, ['INFO', 'PENTING', 'DARURAT'], true)) {
            return 'Prioritas harus INFO, PENTING, atau DARURAT.';
        }
        if (!in_array($type, ['ALL', 'GROUP', 'USER'], true)) {
            return 'Jenis target harus ALL, GROUP, atau USER.';
        }
        if (($type === 'GROUP' || $type === 'USER') && (!is_array($targets) || count($targets) === 0)) {
            return 'Target wajib dipilih untuk jenis GROUP atau USER.';
        }
        if ($expRaw !== '') {
            $ts = strtotime($expRaw);
            if ($ts === false) {
                return 'Format waktu berakhir tampil tidak valid.';
            }
            if ($ts <= time()) {
                return 'Waktu berakhir tampil harus di masa depan.';
            }
        }
        return null;
    }

    // Kirim pesan + seluruh baris penerima dalam SATU transaksi. Idempotency:
    // IDEMPOTENCYKEY yang sama mengembalikan pesan yang sudah ada (tanpa ganda).
    public static function process_send($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $raw = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $by = $param['VUSERLOGIN'] ?? '';

        // Sanitasi XSS: teks biasa, tanpa HTML.
        $vdata = [
            'TITLE' => mb_substr(trim(strip_tags((string) ($raw['TITLE'] ?? ''))), 0, 100),
            'BODY' => mb_substr(trim(strip_tags((string) ($raw['BODY'] ?? ''))), 0, 2000),
            'PRIORITY' => strtoupper(trim((string) ($raw['PRIORITY'] ?? ''))),
            'TARGETTYPE' => strtoupper(trim((string) ($raw['TARGETTYPE'] ?? ''))),
            'TARGET' => $raw['TARGET'] ?? [],
            'EXPIRESAT' => trim((string) ($raw['EXPIRESAT'] ?? '')),
        ];
        $idem = mb_substr(trim((string) ($raw['IDEMPOTENCYKEY'] ?? '')), 0, 64);

        $err = self::validate($vdata);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }
        if (!is_array($vdata['TARGET'])) {
            $vdata['TARGET'] = [];
        }

        // Klik ganda: kunci yang sama -> kembalikan kiriman yang sudah ada.
        if ($idem !== '') {
            $dup = DB::selectOne("SELECT MSGID, TITLE, RECIPIENTCOUNT FROM T_MESSAGE WHERE IDEMPOTENCYKEY = ?", [$idem]);
            if ($dup) {
                return json_encode([
                    'success' => 'true',
                    'message' => 'Pesan sudah terkirim sebelumnya (' . (int) $dup->RECIPIENTCOUNT . ' penerima).',
                    'Rows' => [['MSGID' => $dup->MSGID]],
                ]);
            }
        }

        $recips = self::resolveRecipients($vdata['TARGETTYPE'], $vdata['TARGET']);
        if (count($recips) === 0) {
            return json_encode(['success' => 'false', 'message' => 'Tidak ada penerima aktif untuk target ini.']);
        }

        $expTs = null;
        if ($vdata['EXPIRESAT'] !== '') {
            $expTs = date('Y-m-d H:i:s', (int) strtotime($vdata['EXPIRESAT']));
        }
        $targetJson = $vdata['TARGETTYPE'] === 'ALL' ? null
            : mb_substr(json_encode(array_values($vdata['TARGET']), JSON_UNESCAPED_UNICODE) ?: '[]', 0, 4000);

        $sender = DB::selectOne("SELECT USERID FROM CPUSER WHERE USERLOGIN = ?", [$by]);

        $pdo = DB::getPdo();
        try {
            $pdo->beginTransaction();

            DB::insert("
                INSERT INTO T_MESSAGE
                    (TITLE, BODY, PRIORITY, TARGETTYPE, TARGETJSON, CHANNEL,
                     SENTAT, EXPIRESAT, STATUS, RECIPIENTCOUNT,
                     SENDERID, SENDERLOGIN, IDEMPOTENCYKEY,
                     SYSCREATEUSER, SYSCREATEDATE)
                VALUES (?, ?, ?, ?, ?, 'IN_APP',
                     GETDATE(), ?, 'TERKIRIM', ?,
                     ?, ?, ?,
                     ?, GETDATE())
            ", [
                $vdata['TITLE'], $vdata['BODY'], $vdata['PRIORITY'], $vdata['TARGETTYPE'], $targetJson,
                $expTs, count($recips),
                $sender ? (int) $sender->USERID : null, $by !== '' ? mb_substr($by, 0, 25) : null,
                $idem !== '' ? $idem : null,
                $by !== '' ? mb_substr($by, 0, 25) : null,
            ]);
            $msgid = (int) $pdo->lastInsertId();

            // Baris penerima dibekukan saat kirim (500 baris per batch).
            foreach (array_chunk($recips, 500) as $chunk) {
                $ph = [];
                $args = [];
                foreach ($chunk as $rcp) {
                    $ph[] = '(?, ?, ?, ?)';
                    $args[] = $msgid;
                    $args[] = $rcp['USERID'];
                    $args[] = mb_substr($rcp['USERLOGIN'], 0, 25);
                    $args[] = 'BELUM_DIBACA';
                }
                DB::insert("
                    INSERT INTO T_MESSAGE_RECIPIENT (MSGID, USERID, USERLOGIN, READSTATUS)
                    VALUES " . implode(',', $ph) . "
                ", $args);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignored) {
                // abaikan
            }
            // Balapan idempotency: baris sudah ada -> anggap sudah terkirim.
            if ($idem !== '' && stripos($e->getMessage(), 'IX_T_MESSAGE_IDEMPOTENCY') !== false) {
                $dup = DB::selectOne("SELECT MSGID, RECIPIENTCOUNT FROM T_MESSAGE WHERE IDEMPOTENCYKEY = ?", [$idem]);
                if ($dup) {
                    return json_encode([
                        'success' => 'true',
                        'message' => 'Pesan sudah terkirim sebelumnya (' . (int) $dup->RECIPIENTCOUNT . ' penerima).',
                        'Rows' => [['MSGID' => $dup->MSGID]],
                    ]);
                }
            }
            SysLog::log('ERROR', 'API', 'Gagal mengirim pesan.', ['title' => $vdata['TITLE']], $e);
            return json_encode(['success' => 'false', 'message' => 'Gagal mengirim pesan. Silakan coba lagi.']);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'cp_message_send', 'page' => 'Send Message',
            'table' => 'T_MESSAGE', 'dataId' => (string) $msgid,
            'summary' => 'PESAN ' . $vdata['TITLE'] . ' (' . $vdata['TARGETTYPE'] . ', ' . count($recips) . ' penerima)',
            'before' => [],
            'after' => ['TITLE' => $vdata['TITLE'], 'PRIORITY' => $vdata['PRIORITY'], 'TARGETTYPE' => $vdata['TARGETTYPE'], 'RECIPIENTCOUNT' => count($recips)],
            'userlogin' => $by,
        ]);

        return json_encode([
            'success' => 'true',
            'message' => 'Pesan terkirim ke ' . count($recips) . ' penerima.',
            'Rows' => [['MSGID' => $msgid]],
        ]);
    }
}
