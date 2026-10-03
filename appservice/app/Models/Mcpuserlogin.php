<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

// Catatan: frontend app-core memakai endpoint cpuser/cpuser (Mcpuser) untuk CRUD user.
// Model ini dipertahankan agar struktur tetap sepadan dengan lumen_backend
// (read_group_combo/create_user/update_user/delete_user). Fungsi enkripsi = app_encrypt.
class Mcpuserlogin extends Model
{
    use ColumnFilter;

    public static function read_data($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));

        // Filter per kolom (DataTable) digabung dengan pencarian umum q.
        [$fWhere, $fArgs] = self::buildColumnFilter($param);

        $where = '';
        $args  = [];
        if ($q !== '') {
            $where = " WHERE (A.USERLOGIN LIKE ? OR A.USERNAME LIKE ? OR A.USERGROUP LIKE ? OR A.USEREMAIL LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like, $like, $like];
        }
        $where .= $fWhere;
        $args   = array_merge($args, $fArgs);

        $countRow  = DB::selectOne("SELECT COUNT(*) AS TOTAL FROM CPUSER A" . $where, $args);
        $totalRows = $countRow ? (int) $countRow->TOTAL : 0;

        $sql = "
            SELECT A.USERID, A.USERLOGIN, A.USERNAME, A.USERGROUP, A.USEREMAIL,
                   A.USERACTIVE, A.USERDEPT, B.DEFNAME AS USERGROUPNAME
            FROM CPUSER A
            LEFT JOIN CPMATRIX B ON A.USERGROUP = B.DEFCODE AND B.DEFMODULE = 'GROUP_USERLOGIN'
            " . $where . "
            ORDER BY A.USERLOGIN
        ";

        // OFFSET/FETCH nilai integer di-inline karena sudah di-cast aman (hindari isu binding int).
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

    // buat isi combobox pilihan group waktu tambah/edit user
    public static function read_group_combo($param)
    {
        $result = DB::select("
            SELECT DEFCODE, DEFNAME FROM CPMATRIX
            WHERE DEFMODULE = 'GROUP_USERLOGIN'
            ORDER BY DEFCODE
        ");

        return json_encode([
            'success' => true,
            'Rows' => $result,
        ]);
    }

    public static function create_user($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $userlogin = trim($vdata['USERLOGIN'] ?? '');
        $username = trim($vdata['USERNAME'] ?? '');
        $usergroup = trim($vdata['USERGROUP'] ?? '');
        $useremail = trim($vdata['USEREMAIL'] ?? '');
        $userpassword = $vdata['USERPASSWORD'] ?? '';

        if ($userlogin === '' || $userpassword === '') {
            return json_encode(['success' => 'false', 'message' => 'Username dan Password wajib diisi.']);
        }

        // Kebijakan password dari Security Setting (T_SECURITY_SETTING).
        $perr = SecurityPolicy::checkPassword($userpassword);
        if ($perr !== null) {
            return json_encode(['success' => 'false', 'message' => $perr]);
        }

        $exists = DB::select("SELECT 1 AS X FROM CPUSER WHERE USERLOGIN = ?", [$userlogin]);

        if (!empty($exists)) {
            return json_encode(['success' => 'false', 'message' => 'Username sudah dipakai.']);
        }

        DB::insert("
            INSERT INTO CPUSER (USERLOGIN, USERNAME, USERPASSWORD, USERGROUP, USERACTIVE, USEREMAIL, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, dbo.app_encrypt(?), ?, 'YES', ?, ?, GETDATE())
        ", [$userlogin, $username, $userpassword, $usergroup, $useremail, $param['VUSERLOGIN'] ?? '']);

        AuditTrail::log([
            'action' => 'CREATE', 'mcontrol' => 'cp_userlogin', 'page' => 'User Login',
            'table' => 'CPUSER', 'dataId' => $userlogin, 'summary' => 'USERLOGIN ' . $userlogin,
            'before' => [], 'after' => ['USERLOGIN' => $userlogin, 'USERNAME' => $username, 'USERGROUP' => $usergroup, 'USEREMAIL' => $useremail],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'User berhasil dibuat.']);
    }

    public static function update_user($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];

        $userid = $vdata['USERID'] ?? null;
        $username = trim($vdata['USERNAME'] ?? '');
        $usergroup = trim($vdata['USERGROUP'] ?? '');
        $useremail = trim($vdata['USEREMAIL'] ?? '');
        $useractive = trim($vdata['USERACTIVE'] ?? 'YES');
        $userpassword = $vdata['USERPASSWORD'] ?? '';

        if (empty($userid)) {
            return json_encode(['success' => 'false', 'message' => 'USERID tidak ditemukan.']);
        }

        $beforeUser = DB::selectOne("SELECT USERID, USERLOGIN, USERNAME, USERGROUP, USEREMAIL, USERACTIVE FROM CPUSER WHERE USERID = ?", [$userid]);

        if ($userpassword !== '') {
            // Kebijakan password dari Security Setting (T_SECURITY_SETTING).
            $perr = SecurityPolicy::checkPassword($userpassword);
            if ($perr !== null) {
                return json_encode(['success' => 'false', 'message' => $perr]);
            }
            // password diisi -> ikut diupdate (re-encrypt)
            DB::update("
                UPDATE CPUSER
                SET USERNAME = ?, USERGROUP = ?, USEREMAIL = ?, USERACTIVE = ?,
                    USERPASSWORD = dbo.app_encrypt(?), SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE USERID = ?
            ", [$username, $usergroup, $useremail, $useractive, $userpassword, $param['VUSERLOGIN'] ?? '', $userid]);
        } else {
            // password dikosongkan -> gak diubah
            DB::update("
                UPDATE CPUSER
                SET USERNAME = ?, USERGROUP = ?, USEREMAIL = ?, USERACTIVE = ?,
                    SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE()
                WHERE USERID = ?
            ", [$username, $usergroup, $useremail, $useractive, $param['VUSERLOGIN'] ?? '', $userid]);
        }

        AuditTrail::log([
            'action' => 'UPDATE', 'mcontrol' => 'cp_userlogin', 'page' => 'User Login',
            'table' => 'CPUSER', 'dataId' => $userid, 'summary' => 'USERLOGIN ' . ($beforeUser->USERLOGIN ?? $userid),
            'before' => $beforeUser ? (array) $beforeUser : [],
            'after' => ['USERNAME' => $username, 'USERGROUP' => $usergroup, 'USEREMAIL' => $useremail, 'USERACTIVE' => $useractive],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'User berhasil diupdate.']);
    }

    public static function delete_user($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $userid = $vdata['USERID'] ?? null;

        if (empty($userid)) {
            return json_encode(['success' => 'false', 'message' => 'USERID tidak ditemukan.']);
        }

        $beforeDel = DB::selectOne("SELECT USERID, USERLOGIN, USERNAME, USERGROUP, USEREMAIL FROM CPUSER WHERE USERID = ?", [$userid]);

        DB::delete("DELETE FROM CPUSER WHERE USERID = ?", [$userid]);

        AuditTrail::log([
            'action' => 'DELETE', 'mcontrol' => 'cp_userlogin', 'page' => 'User Login',
            'table' => 'CPUSER', 'dataId' => $userid, 'summary' => 'USERLOGIN ' . ($beforeDel->USERLOGIN ?? $userid),
            'before' => $beforeDel ? (array) $beforeDel : [],
            'after' => [],
            'userlogin' => $param['VUSERLOGIN'] ?? '',
        ]);

        return json_encode(['success' => 'true', 'message' => 'User berhasil dihapus.']);
    }
}