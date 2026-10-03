<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Kode promo tiket (Marketing Tools, module Marketing).
// Tabel dbo.T_PROMO + dbo.T_PROMO_SCOPE + dbo.T_PROMO_USAGE.
// SEGMENT frontend: home/mpromocode/mpromocode. Menu CPMENU MCONTROL = mpromocode.
//
// Terpakai DIHITUNG dari T_PROMO_USAGE DIPAKAI (tanpa kolom). Validasi +
// hitung untuk module lain di PromoEngine (dipakai uji kode di sini).
class Mmpromocode extends Model
{
    use ColumnFilter;

    const MCODE = 60010002;

    // Kolom yang boleh di-sort (whitelist) => kolom SQL. Selain ini -> default.
    private static function sortMap(): array
    {
        return [
            'PROMOID' => 'A.PROMOID',
            'PROMOCODE' => 'A.PROMOCODE',
            'DISCTYPE' => 'A.DISCTYPE',
            'STARTAT' => 'A.STARTAT',
            'ENDAT' => 'A.ENDAT',
            'ISACTIVE' => 'A.ISACTIVE',
        ];
    }

    // Tolak bila group user tidak punya akses menu Promo Code.
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

    // Status tampilan: AKAN_DATANG/BERLAKU/KEDALUWARSA/KUOTA_HABIS/NONAKTIF.
    public static function displayStatus($row, int $used): string
    {
        if (strtoupper(trim((string) ($row->ISACTIVE ?? ''))) !== 'YES') {
            return 'NONAKTIF';
        }
        $now = time();
        if (!empty($row->STARTAT) && $now < strtotime((string) $row->STARTAT)) {
            return 'AKAN_DATANG';
        }
        if (!empty($row->ENDAT) && $now > strtotime((string) $row->ENDAT)) {
            return 'KEDALUWARSA';
        }
        if ($row->QUOTA !== null && (int) $row->QUOTA > 0 && $used >= (int) $row->QUOTA) {
            return 'KUOTA_HABIS';
        }
        return 'BERLAKU';
    }

    public static function read_data($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q = trim((string) ($param['q'] ?? ''));
        $type = strtoupper(trim((string) ($param['disctype'] ?? '')));
        $scope = strtoupper(trim((string) ($param['scopetype'] ?? '')));
        $active = strtoupper(trim((string) ($param['isactive'] ?? $param['status'] ?? '')));

        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args = [];
        if ($q !== '') {
            $where = " WHERE (A.PROMOCODE LIKE ? OR A.DESCR LIKE ?)";
            $like = '%' . $q . '%';
            $args = [$like, $like];
        }
        if ($type !== '' && in_array($type, ['PERSEN', 'NOMINAL'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.DISCTYPE = ?';
            $args[] = $type;
        }
        if ($scope !== '' && in_array($scope, ['SEMUA', 'KATEGORI', 'EVENT'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.SCOPETYPE = ?';
            $args[] = $scope;
        }
        if ($active !== '' && in_array($active, ['YES', 'NO'], true)) {
            $where .= ($where === '' ? ' WHERE ' : ' AND ') . 'A.ISACTIVE = ?';
            $args[] = $active;
        }
        $where .= $fWhere;
        $args = array_merge($args, $fArgs);
        if ($where !== '' && stripos(ltrim($where), 'WHERE') !== 0) {
            $where = ' WHERE 1=1' . $where;
        }

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_PROMO A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        // Sorting divalidasi whitelist (anti SQL injection); default kode.
        $map     = self::sortMap();
        $sortKey = strtoupper(trim((string) ($param['sort'] ?? '')));
        $dir     = strtoupper(trim((string) ($param['dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';
        $order   = isset($map[$sortKey]) ? $map[$sortKey] . ' ' . $dir : 'A.PROMOCODE';

        $sql = "
            SELECT A.PROMOID, A.PROMOCODE, A.DESCR, A.DISCTYPE, A.DISCVALUE,
                   A.MAXDISC, A.MINPURCHASE, A.QUOTA, A.MAXPERBUYER,
                   A.STARTAT, A.ENDAT, A.SCOPETYPE, A.ISACTIVE,
                   (SELECT COUNT(*) FROM T_PROMO_USAGE U
                     WHERE U.PROMOID = A.PROMOID AND U.STATUS = 'DIPAKAI') AS USEDCOUNT
            FROM T_PROMO A
            " . $where . "
            ORDER BY " . $order . "
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, $args);
        $rows = [];
        foreach ($result as $r) {
            $arr = (array) $r;
            $arr['DISPLAYSTATUS'] = self::displayStatus($r, (int) ($r->USEDCOUNT ?? 0));
            $rows[] = $arr;
        }

        return json_encode([
            'success' => true,
            'Rows' => $rows,
            'TotalRows' => $totalRows
        ]);
    }

    // Ringkasan: jumlah per status tampilan + total potongan diberikan.
    public static function read_summary($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $rows = DB::select("SELECT * FROM T_PROMO ORDER BY PROMOID");
        $out = ['BERLAKU' => 0, 'AKAN_DATANG' => 0, 'KEDALUWARSA' => 0, 'KUOTA_HABIS' => 0, 'NONAKTIF' => 0, 'TOTALDISC' => '0'];
        foreach ($rows as $r) {
            $used = PromoEngine::usedCount((int) $r->PROMOID);
            $st = self::displayStatus($r, $used);
            if (isset($out[$st])) {
                $out[$st]++;
            }
        }
        $t = DB::selectOne("
            SELECT ISNULL(SUM(DISCAMOUNT), 0) AS S FROM T_PROMO_USAGE WHERE STATUS = 'DIPAKAI'
        ");
        $out['TOTALDISC'] = $t ? (string) $t->S : '0';

        return json_encode(['success' => true, 'Rows' => [$out]]);
    }

    public static function read_detail($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PROMOID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PROMOID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT * FROM T_PROMO WHERE PROMOID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data promo tidak ditemukan.']);
        }

        $arr = (array) $row;
        $arr['USEDCOUNT'] = PromoEngine::usedCount((int) $id);
        $arr['DISPLAYSTATUS'] = self::displayStatus($row, $arr['USEDCOUNT']);
        $arr['SCOPES'] = DB::select("
            SELECT TARGETTYPE, TARGETCODE FROM T_PROMO_SCOPE
            WHERE PROMOID = ? ORDER BY TARGETTYPE, TARGETCODE
        ", [$id]);

        return json_encode(['success' => true, 'Rows' => [$arr]]);
    }

    // Riwayat pemakaian satu promo (paging).
    public static function read_usage($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PROMOID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PROMOID tidak ditemukan.']);
        }

        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;

        $countRow = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM T_PROMO_USAGE WHERE PROMOID = ?", [$id]);
        $total = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "
            SELECT USAGEID, EVENTID, BUYEREMAIL, BEFOREAMOUNT, DISCAMOUNT,
                   USEDATETIME, STATUS, REFERENCENO
            FROM T_PROMO_USAGE WHERE PROMOID = ?
            ORDER BY USEDATETIME DESC, USAGEID DESC
        ";
        if ($limit > 0) {
            $sql .= " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
        }

        $result = DB::select($sql, [$id]);
        // Email disamarkan sebagian (konsisten pola maskContact).
        foreach ($result as $r) {
            $e = trim((string) ($r->BUYEREMAIL ?? ''));
            if ($e !== '' && strpos($e, '@') !== false) {
                [$u, $d] = explode('@', $e, 2);
                $r->BUYEREMAIL = substr($u, 0, 2) . '****@' . $d;
            }
        }

        return json_encode(['success' => true, 'Rows' => $result, 'TotalRows' => $total]);
    }

    // Validasi form. $used = jumlah terpakai (untuk aturan kunci).
    // Return pesan error atau null bila lolos.
    private static function validate($vdata, int $used, $excludeId = null): ?string
    {
        $code = strtoupper(trim((string) ($vdata['PROMOCODE'] ?? '')));
        $desc = trim((string) ($vdata['DESCR'] ?? ''));
        $type = strtoupper(trim((string) ($vdata['DISCTYPE'] ?? '')));
        $valRaw = trim((string) ($vdata['DISCVALUE'] ?? ''));
        $maxRaw = trim((string) ($vdata['MAXDISC'] ?? ''));
        $minRaw = trim((string) ($vdata['MINPURCHASE'] ?? ''));
        $quotaRaw = trim((string) ($vdata['QUOTA'] ?? ''));
        $maxBuyerRaw = trim((string) ($vdata['MAXPERBUYER'] ?? ''));
        $startRaw = trim((string) ($vdata['STARTAT'] ?? ''));
        $endRaw = trim((string) ($vdata['ENDAT'] ?? ''));
        $scope = strtoupper(trim((string) ($vdata['SCOPETYPE'] ?? '')));

        if ($code === '') {
            return 'Kode wajib diisi.';
        }
        if (!preg_match('/^[A-Z0-9\-]{4,20}$/', $code)) {
            return 'Kode 4-20 karakter huruf besar, angka, dan strip.';
        }
        if ($type !== 'PERSEN' && $type !== 'NOMINAL') {
            return 'Jenis harus PERSEN atau NOMINAL.';
        }
        if ($valRaw === '' || !is_numeric($valRaw) || (float) $valRaw <= 0) {
            return 'Nilai potongan wajib lebih dari 0.';
        }
        if ($type === 'PERSEN' && ((float) $valRaw < 1 || (float) $valRaw > 100)) {
            return 'Persen harus antara 1 dan 100.';
        }
        if ($maxRaw !== '') {
            if ($type !== 'PERSEN') {
                return 'Potongan maksimum hanya untuk PERSEN.';
            }
            if (!is_numeric($maxRaw) || (float) $maxRaw <= 0) {
                return 'Potongan maksimum harus lebih dari 0.';
            }
        }
        if ($minRaw !== '' && (!is_numeric($minRaw) || (float) $minRaw < 0)) {
            return 'Minimum pembelian tidak boleh negatif.';
        }
        if ($quotaRaw !== '') {
            if (filter_var($quotaRaw, FILTER_VALIDATE_INT) === false || (int) $quotaRaw < 1) {
                return 'Kuota kalau diisi minimal 1.';
            }
            if ((int) $quotaRaw < $used) {
                return 'Kuota tidak boleh di bawah ' . $used . ' pemakaian yang sudah ada.';
            }
        }
        if ($maxBuyerRaw === '' || filter_var($maxBuyerRaw, FILTER_VALIDATE_INT) === false || (int) $maxBuyerRaw < 1) {
            return 'Batas per pembeli minimal 1.';
        }
        $startTs = $startRaw !== '' ? strtotime($startRaw) : null;
        $endTs = $endRaw !== '' ? strtotime($endRaw) : null;
        if ($startRaw !== '' && $startTs === false) {
            return 'Waktu mulai tidak valid.';
        }
        if ($endRaw !== '' && $endTs === false) {
            return 'Waktu berakhir tidak valid.';
        }
        if ($startTs !== null && $endTs !== null && $endTs <= $startTs) {
            return 'Waktu berakhir harus setelah waktu mulai.';
        }
        if (!in_array($scope, ['SEMUA', 'KATEGORI', 'EVENT'], true)) {
            return 'Cakupan harus SEMUA, KATEGORI, atau EVENT.';
        }

        // Kode unik tanpa memandang kapital.
        $dupSql = "SELECT 1 AS X FROM T_PROMO WHERE UPPER(PROMOCODE) = UPPER(?)";
        $dupArgs = [$code];
        if (!empty($excludeId)) {
            $dupSql .= " AND PROMOID <> ?";
            $dupArgs[] = $excludeId;
        }
        if (!empty(DB::select($dupSql, $dupArgs))) {
            return 'Kode sudah dipakai promo lain.';
        }
        return null;
    }

    // Validasi target cakupan. Return [targets, pesanError|null].
    // $targets = [['TARGETTYPE'=>, 'TARGETCODE'=>], ...].
    private static function validateTargets($vdata): array
    {
        $scope = strtoupper(trim((string) ($vdata['SCOPETYPE'] ?? '')));
        $raw = $vdata['TARGETS'] ?? [];
        if (!is_array($raw)) {
            $raw = [];
        }
        if ($scope === 'SEMUA') {
            return [[], null];
        }
        $seen = [];
        foreach ($raw as $t) {
            $code = strtoupper(trim((string) (is_array($t) ? ($t['TARGETCODE'] ?? $t['CODE'] ?? '') : $t)));
            if ($code === '' || isset($seen[$code])) {
                continue;
            }
            $seen[$code] = true;
        }
        if (empty($seen)) {
            return [[], 'Cakupan KATEGORI/EVENT wajib memilih minimal satu target.'];
        }
        $out = [];
        foreach (array_keys($seen) as $code) {
            if ($scope === 'KATEGORI') {
                $hit = DB::selectOne("SELECT CATCODE FROM T_CATEGORY WHERE UPPER(CATCODE) = UPPER(?)", [$code]);
                if (!$hit) {
                    return [[], 'Kategori "' . $code . '" tidak ditemukan.'];
                }
            } else {
                $hit = DB::selectOne("SELECT EVENTCODE FROM T_EVENT WHERE UPPER(EVENTCODE) = UPPER(?)", [$code]);
                if (!$hit) {
                    return [[], 'Event "' . $code . '" tidak ditemukan.'];
                }
                // Simpan EVENTCODE resmi (bukan EVENTID) agar stabil dibaca.
                $code = (string) $hit->EVENTCODE;
            }
            $out[] = ['TARGETTYPE' => $scope, 'TARGETCODE' => $code];
        }
        return [$out, null];
    }

    public static function process_create($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $err = self::validate($vdata, 0);
        if ($err !== null) {
            return json_encode(['success' => 'false', 'message' => $err]);
        }
        [$targets, $terr] = self::validateTargets($vdata);
        if ($terr !== null) {
            return json_encode(['success' => 'false', 'message' => $terr]);
        }

        $type = strtoupper(trim((string) $vdata['DISCTYPE']));
        $maxRaw = trim((string) ($vdata['MAXDISC'] ?? ''));
        $minRaw = trim((string) ($vdata['MINPURCHASE'] ?? ''));
        $quotaRaw = trim((string) ($vdata['QUOTA'] ?? ''));
        $startRaw = trim((string) ($vdata['STARTAT'] ?? ''));
        $endRaw = trim((string) ($vdata['ENDAT'] ?? ''));

        DB::insert("
            INSERT INTO T_PROMO
                (PROMOCODE, DESCR, DISCTYPE, DISCVALUE, MAXDISC, MINPURCHASE,
                 QUOTA, MAXPERBUYER, STARTAT, ENDAT, SCOPETYPE, ISACTIVE,
                 SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, 'YES',
                 ?, GETDATE())
        ", [
            strtoupper(trim($vdata['PROMOCODE'])),
            mb_substr(trim((string) ($vdata['DESCR'] ?? '')), 0, 200),
            $type, (float) trim($vdata['DISCVALUE']),
            $maxRaw === '' ? null : (float) $maxRaw,
            $minRaw === '' ? 0 : (float) $minRaw,
            $quotaRaw === '' ? null : (int) $quotaRaw,
            (int) trim($vdata['MAXPERBUYER']),
            $startRaw === '' ? null : date('Y-m-d H:i:s', strtotime($startRaw)),
            $endRaw === '' ? null : date('Y-m-d H:i:s', strtotime($endRaw)),
            strtoupper(trim($vdata['SCOPETYPE'])),
            $param['VUSERLOGIN'] ?? '',
        ]);
        $id = (int) DB::getPdo()->lastInsertId();

        foreach ($targets as $t) {
            DB::insert("
                INSERT INTO T_PROMO_SCOPE (PROMOID, TARGETTYPE, TARGETCODE)
                VALUES (?, ?, ?)
            ", [$id, $t['TARGETTYPE'], $t['TARGETCODE']]);
        }

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'mpromocode', 'page' => 'Promo Code',
            'table' => 'T_PROMO', 'dataId' => strtoupper(trim($vdata['PROMOCODE'])),
            'summary' => 'PROMO ' . strtoupper(trim($vdata['PROMOCODE'])),
            'before' => [],
            'after' => ['PROMOCODE' => strtoupper(trim($vdata['PROMOCODE'])), 'DISCTYPE' => $type],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode([
            'success' => 'true', 'message' => 'Promo berhasil dibuat.',
            'Rows' => [['PROMOID' => $id]],
        ]);
    }

    // Ubah: bila sudah dipakai, hanya deskripsi/kuota/waktu-berakhir/status.
    public static function process_update($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PROMOID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PROMOID tidak ditemukan.']);
        }

        $before = DB::selectOne("SELECT * FROM T_PROMO WHERE PROMOID = ?", [$id]);
        if (!$before) {
            return json_encode(['success' => 'false', 'message' => 'Data promo tidak ditemukan.']);
        }
        $used = PromoEngine::usedCount((int) $id);
        $locked = $used > 0;

        if ($locked) {
            // Terkunci: jenis, nilai, maksimum, minimum, mulai, cakupan, target.
            $err = self::validateLocked($vdata, $used, $before);
            if ($err !== null) {
                return json_encode(['success' => 'false', 'message' => $err]);
            }
            $endRaw = trim((string) ($vdata['ENDAT'] ?? ''));
            $quotaRaw = trim((string) ($vdata['QUOTA'] ?? ''));
            DB::update("
                UPDATE T_PROMO
                SET DESCR = ?, QUOTA = ?, ENDAT = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE PROMOID = ?
            ", [
                mb_substr(trim((string) ($vdata['DESCR'] ?? '')), 0, 200),
                $quotaRaw === '' ? null : (int) $quotaRaw,
                $endRaw === '' ? null : date('Y-m-d H:i:s', strtotime($endRaw)),
                $param['VUSERLOGIN'] ?? '', $id,
            ]);
        } else {
            $err = self::validate($vdata, 0, $id);
            if ($err !== null) {
                return json_encode(['success' => 'false', 'message' => $err]);
            }
            [$targets, $terr] = self::validateTargets($vdata);
            if ($terr !== null) {
                return json_encode(['success' => 'false', 'message' => $terr]);
            }
            $type = strtoupper(trim((string) $vdata['DISCTYPE']));
            $maxRaw = trim((string) ($vdata['MAXDISC'] ?? ''));
            $minRaw = trim((string) ($vdata['MINPURCHASE'] ?? ''));
            $quotaRaw = trim((string) ($vdata['QUOTA'] ?? ''));
            $startRaw = trim((string) ($vdata['STARTAT'] ?? ''));
            $endRaw = trim((string) ($vdata['ENDAT'] ?? ''));

            DB::update("
                UPDATE T_PROMO
                SET PROMOCODE = ?, DESCR = ?, DISCTYPE = ?, DISCVALUE = ?,
                    MAXDISC = ?, MINPURCHASE = ?, QUOTA = ?, MAXPERBUYER = ?,
                    STARTAT = ?, ENDAT = ?, SCOPETYPE = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE PROMOID = ?
            ", [
                strtoupper(trim($vdata['PROMOCODE'])),
                mb_substr(trim((string) ($vdata['DESCR'] ?? '')), 0, 200),
                $type, (float) trim($vdata['DISCVALUE']),
                $maxRaw === '' ? null : (float) $maxRaw,
                $minRaw === '' ? 0 : (float) $minRaw,
                $quotaRaw === '' ? null : (int) $quotaRaw,
                (int) trim($vdata['MAXPERBUYER']),
                $startRaw === '' ? null : date('Y-m-d H:i:s', strtotime($startRaw)),
                $endRaw === '' ? null : date('Y-m-d H:i:s', strtotime($endRaw)),
                strtoupper(trim($vdata['SCOPETYPE'])),
                $param['VUSERLOGIN'] ?? '', $id,
            ]);

            DB::delete("DELETE FROM T_PROMO_SCOPE WHERE PROMOID = ?", [$id]);
            foreach ($targets as $t) {
                DB::insert("
                    INSERT INTO T_PROMO_SCOPE (PROMOID, TARGETTYPE, TARGETCODE)
                    VALUES (?, ?, ?)
                ", [$id, $t['TARGETTYPE'], $t['TARGETCODE']]);
            }
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'mpromocode', 'page' => 'Promo Code',
            'table' => 'T_PROMO', 'dataId' => (string) ($before->PROMOCODE ?? $id),
            'summary' => 'PROMO ' . (string) ($before->PROMOCODE ?? $id) . ($locked ? ' (terkunci)' : ''),
            'before' => (array) $before,
            'after' => ['DESCR' => trim((string) ($vdata['DESCR'] ?? ''))],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Promo berhasil diupdate.']);
    }

    // Validasi ringan untuk promo terkunci (deskripsi/kuota/waktu-berakhir).
    private static function validateLocked($vdata, int $used, $before): ?string
    {
        $endRaw = trim((string) ($vdata['ENDAT'] ?? ''));
        $quotaRaw = trim((string) ($vdata['QUOTA'] ?? ''));
        if ($quotaRaw !== '') {
            if (filter_var($quotaRaw, FILTER_VALIDATE_INT) === false || (int) $quotaRaw < 1) {
                return 'Kuota kalau diisi minimal 1.';
            }
            if ((int) $quotaRaw < $used) {
                return 'Kuota tidak boleh di bawah ' . $used . ' pemakaian yang sudah ada.';
            }
        }
        if ($endRaw !== '') {
            $endTs = strtotime($endRaw);
            if ($endTs === false) {
                return 'Waktu berakhir tidak valid.';
            }
            if (!empty($before->STARTAT) && $endTs <= strtotime((string) $before->STARTAT)) {
                return 'Waktu berakhir harus setelah waktu mulai.';
            }
        }
        return null;
    }

    public static function change_status($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PROMOID'] ?? null;
        $active = strtoupper(trim((string) ($vdata['ISACTIVE'] ?? '')));

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PROMOID tidak ditemukan.']);
        }
        if ($active !== 'YES' && $active !== 'NO') {
            return json_encode(['success' => 'false', 'message' => 'Status harus YES atau NO.']);
        }

        $row = DB::selectOne("SELECT PROMOID, PROMOCODE, ISACTIVE FROM T_PROMO WHERE PROMOID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data promo tidak ditemukan.']);
        }

        DB::update("
            UPDATE T_PROMO
            SET ISACTIVE = ?, SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
            WHERE PROMOID = ?
        ", [$active, $param['VUSERLOGIN'] ?? '', $id]);

        AuditTrail::log([
            'action' => 'STATUS', 'mcontrol' => 'mpromocode', 'page' => 'Promo Code',
            'table' => 'T_PROMO', 'dataId' => (string) ($row->PROMOCODE ?? $id),
            'summary' => 'PROMO ' . (string) ($row->PROMOCODE ?? $id) . ' -> ' . $active,
            'before' => ['ISACTIVE' => (string) $row->ISACTIVE],
            'after' => ['ISACTIVE' => $active],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        $msg = $active === 'YES' ? 'Promo berhasil diaktifkan.' : 'Promo berhasil dinonaktifkan.';
        return json_encode(['success' => 'true', 'message' => $msg]);
    }

    // Hapus: hanya promo yang belum pernah dipakai (tanpa baris usage).
    public static function process_delete($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $id = $vdata['PROMOID'] ?? null;

        if (empty($id)) {
            return json_encode(['success' => 'false', 'message' => 'PROMOID tidak ditemukan.']);
        }

        $row = DB::selectOne("SELECT PROMOID, PROMOCODE FROM T_PROMO WHERE PROMOID = ?", [$id]);
        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'Data promo tidak ditemukan.']);
        }
        $used = DB::selectOne("SELECT COUNT(*) AS C FROM T_PROMO_USAGE WHERE PROMOID = ?", [$id]);
        if ($used && (int) $used->C > 0) {
            return json_encode(['success' => 'false', 'message' => 'Promo "' . $row->PROMOCODE . '" sudah pernah dipakai, tidak boleh dihapus. Nonaktifkan saja.']);
        }

        DB::delete("DELETE FROM T_PROMO_SCOPE WHERE PROMOID = ?", [$id]);
        DB::delete("DELETE FROM T_PROMO WHERE PROMOID = ?", [$id]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'mpromocode', 'page' => 'Promo Code',
            'table' => 'T_PROMO', 'dataId' => (string) ($row->PROMOCODE ?? $id),
            'summary' => 'PROMO ' . (string) ($row->PROMOCODE ?? $id),
            'before' => (array) $row,
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'Promo berhasil dihapus.']);
    }

    // Uji kode: validasi + potongan TANPA mencatat pemakaian.
    public static function test_code($param)
    {
        $denied = self::requireAccess($param);
        if ($denied !== null) {
            return json_encode(['success' => 'false', 'message' => $denied]);
        }

        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $code = trim((string) ($vdata['CODE'] ?? ''));
        $eventid = $vdata['EVENTID'] ?? null;
        $amount = trim((string) ($vdata['AMOUNT'] ?? ''));
        $email = trim((string) ($vdata['EMAIL'] ?? ''));

        if ($code === '' || $amount === '' || !is_numeric($amount)) {
            return json_encode(['success' => 'false', 'message' => 'Kode, event, dan nominal wajib diisi dengan benar.']);
        }

        $r = PromoEngine::check($code, $eventid, (float) $amount, $email);

        return json_encode([
            'success' => true,
            'Rows' => [[
                'VALID' => $r['ok'] ? 'YES' : 'NO',
                'REASON' => $r['reason'],
                'DISCOUNT' => $r['discount'],
            ]],
        ]);
    }
}
