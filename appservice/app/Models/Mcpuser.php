<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

class Mcpuser extends Model
{
    // === Sesuai referensi: endpoint cpuser/cpuser dipakai frontend cp_usersetting ===
    // {method: read_data} -> grid user
    // {method: read_data, limit?, offset?, q?} -> grid user.
    // Paging + pencarian (mirror lumen_backend): envelope {success, Rows, TotalRows}
    // supaya reader ala ExtJS (rootProperty Rows, totalProperty TotalRows) bekerja.
    public static function read_data($param)
    {
        $limit  = (isset($param['limit']) && $param['limit'] !== '') ? (int) $param['limit'] : 0; // 0 = semua
        $offset = isset($param['offset']) ? max(0, (int) $param['offset']) : 0;
        $q      = trim((string) ($param['q'] ?? ''));

        $where = '';
        $args  = [];
        if ($q !== '') {
            $where = " WHERE (A.USERLOGIN LIKE ? OR A.USERNAME LIKE ? OR A.USERGROUP LIKE ? OR A.USEREMAIL LIKE ?)";
            $like  = '%' . $q . '%';
            $args  = [$like, $like, $like, $like];
        }

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

    // {method: create_user_akses, vheader:{...}}
    // Catatan: app-core tidak memakai konsep department, jadi USERDEPT tidak
    // lagi diisi di sini (kolomnya nullable dan tidak disentuh saat update).
    public static function create_user_akses($param)
    {
        $vheader = json_decode($param['vheader'] ?? '{}', true) ?: [];

        $userlogin = trim($vheader['USERLOGIN'] ?? '');
        $username = trim($vheader['USERNAME'] ?? '');
        $usergroup = trim($vheader['USERGROUP'] ?? '');
        $useremail = trim($vheader['USEREMAIL'] ?? '');
        $useractive = trim($vheader['USERACTIVE'] ?? 'YES');
        $userpassword = $vheader['USERPASSWORD'] ?? '';

        if ($userlogin === '' || $userpassword === '') {
            return json_encode(['success' => 'false', 'message' => 'Username dan Password wajib diisi.']);
        }

        $exists = DB::select("SELECT 1 AS X FROM CPUSER WHERE USERLOGIN = ?", [$userlogin]);
        if (!empty($exists)) {
            return json_encode(['success' => 'false', 'message' => 'Username sudah dipakai.']);
        }

        DB::insert("
            INSERT INTO CPUSER (USERLOGIN, USERNAME, USERPASSWORD, USERGROUP, USERACTIVE, USEREMAIL, SYSCREATEUSER, SYSCREATEDATE)
            VALUES (?, ?, dbo.app_encrypt(?), ?, ?, ?, ?, GETDATE())
        ", [$userlogin, $username, $userpassword, $usergroup, $useractive, $useremail, $param['VUSERLOGIN'] ?? '']);

        return json_encode(['success' => 'true', 'message' => 'User berhasil dibuat.']);
    }

    // {method: edit_user_akses, vheader:{...}}
    public static function edit_user_akses($param)
    {
        $vheader = json_decode($param['vheader'] ?? '{}', true) ?: [];

        $userid = $vheader['USERID'] ?? null;
        $username = trim($vheader['USERNAME'] ?? '');
        $usergroup = trim($vheader['USERGROUP'] ?? '');
        $useremail = trim($vheader['USEREMAIL'] ?? '');
        $useractive = trim($vheader['USERACTIVE'] ?? 'YES');
        $userpassword = $vheader['USERPASSWORD'] ?? '';

        if (empty($userid)) {
            return json_encode(['success' => 'false', 'message' => 'USERID tidak ditemukan.']);
        }

        if ($userpassword !== '') {
            DB::update("
                UPDATE CPUSER SET USERNAME=?, USERGROUP=?, USEREMAIL=?, USERACTIVE=?,
                    USERPASSWORD=dbo.app_encrypt(?), SYSUPDATEUSER=?, SYSUPDATEDATE=GETDATE()
                WHERE USERID=?
            ", [$username, $usergroup, $useremail, $useractive, $userpassword, $param['VUSERLOGIN'] ?? '', $userid]);
        } else {
            DB::update("
                UPDATE CPUSER SET USERNAME=?, USERGROUP=?, USEREMAIL=?, USERACTIVE=?,
                    SYSUPDATEUSER=?, SYSUPDATEDATE=GETDATE()
                WHERE USERID=?
            ", [$username, $usergroup, $useremail, $useractive, $param['VUSERLOGIN'] ?? '', $userid]);
        }

        return json_encode(['success' => 'true', 'message' => 'User berhasil diupdate.']);
    }

    // {method: delete_user_akses, vdata:{...}}
    public static function delete_user_akses($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $userid = $vdata['USERID'] ?? null;

        if (empty($userid)) {
            return json_encode(['success' => 'false', 'message' => 'USERID tidak ditemukan.']);
        }

        $exists = DB::select("SELECT 1 AS X FROM CPUSER WHERE USERID = ?", [$userid]);

        if (empty($exists)) {
            return json_encode(['success' => 'false', 'message' => 'Data tidak ditemukan.']);
        }

        DB::delete("DELETE FROM CPUSER WHERE USERID = ?", [$userid]);

        return json_encode(['success' => 'true', 'message' => 'User berhasil dihapus.']);
    }

    // {method: change_password, vheader:{USERLOGIN,USERPASSWORD,NEWPASSWORD,CONFIRMPASSWORD}}
    public static function change_password($param)
    {
        $vheader = json_decode($param['vheader'] ?? '{}', true) ?: [];

        $userlogin = trim($vheader['USERLOGIN'] ?? '');
        $oldPassword = (string) ($vheader['USERPASSWORD'] ?? '');
        $newPassword = (string) ($vheader['NEWPASSWORD'] ?? '');
        $confirmPassword = (string) ($vheader['CONFIRMPASSWORD'] ?? '');

        if ($userlogin === '' || $oldPassword === '' || $newPassword === '') {
            return json_encode(['success' => 'false', 'message' => 'Data tidak lengkap.']);
        }

        if ($newPassword !== $confirmPassword) {
            return json_encode(['success' => 'false', 'message' => 'Password baru tidak sesuai dengan Confirm Password']);
        }

        // user yang boleh ganti password adalah dirinya sendiri (USERLOGIN dari form),
        // dicek ulang ke DB supaya tidak bisa menebak user lain.
        $row = DB::selectOne(
            "SELECT TOP 1 USERID, dbo.app_decrypt(USERPASSWORD) AS PLAIN FROM CPUSER WHERE USERLOGIN = ? AND USERACTIVE = 'YES'",
            [$userlogin]
        );

        if (!$row) {
            return json_encode(['success' => 'false', 'message' => 'User tidak ditemukan.']);
        }

        if (trim((string) $row->PLAIN) !== $oldPassword) {
            return json_encode(['success' => 'false', 'message' => 'Password lama tidak sesuai.']);
        }

        DB::update(
            "UPDATE CPUSER SET USERPASSWORD = dbo.app_encrypt(?), SYSUPDATEUSER = ?, SYSUPDATEDATE = GETDATE() WHERE USERID = ?",
            [$newPassword, $userlogin, $row->USERID]
        );

        return json_encode(['success' => 'true', 'message' => 'Password berhasil diubah.']);
    }

    // dipanggil dari tombol "Mode Layout" (Standard <-> Mobile)
    public static function change_layout($param)
    {
        $vdata = json_decode($param['vdata'] ?? '{}', true) ?: [];
        $modeLayout = trim($vdata['mode_layout'] ?? '');
        $userlogin = $param['VUSERLOGIN'] ?? '';
        $allowed = ['mode_desktop', 'mode_standard'];

        if ($modeLayout === '' || $userlogin === '') {
            return json_encode(['success' => 'false', 'message' => 'Data tidak lengkap.']);
        }

        if (!in_array(strtolower($modeLayout), $allowed, true)) {
            return json_encode(['success' => 'false', 'message' => 'Mode layout tidak dikenal.']);
        }

        DB::update(
            "UPDATE CPUSER SET GROUPMODEL = ? WHERE USERLOGIN = ?",
            [$modeLayout, $userlogin]
        );

        return json_encode(['success' => 'true', 'message' => 'Mode layout berhasil diubah.']);
    }
}