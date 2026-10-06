/* =============================================================================
   PORTAL PEMBELI - seed 003
   GROUP_USER (Pembeli) + akun uji "user"/"user" + hak akses menu portal.

   - Format GROUP_USER disamakan dengan GROUP_ADMIN (DEFMODULE='GROUP_USERLOGIN').
   - Password disimpan dengan dbo.app_encrypt() => SP_USERLOGIN (dipakai User Login)
     membandingkan dbo.app_decrypt(USERPASSWORD) = password, jadi hash-nya sama.
   - Akun uji ini SENGAJA lemah ("user"/"user") untuk pengujian. WAJIB diganti
     atau dinonaktifkan sebelum production.
   - Idempotent : aman dijalankan berkali-kali.
   - Rollback   : blok ROLLBACK di bawah.

   Menu yang diberi akses (module Discovery/Ticket/Merch/Finance yang mcontrol-nya
   sudah ada di CPMENU). Induk menu ikut diberi supaya pohonnya utuh.
   ========================================================================== */

SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;

DECLARE @GROUPCODE varchar(50) = 'GROUP_USER';

-- 1) Group GROUP_USER di CPMATRIX (DEFID = identity, jadi tidak diisi manual)
IF NOT EXISTS (SELECT 1 FROM CPMATRIX WHERE DEFMODULE = 'GROUP_USERLOGIN' AND DEFCODE = @GROUPCODE)
BEGIN
    INSERT INTO CPMATRIX
        (DEFMODULE, DEFCODE, DEFNAME, DEFSHORT, DEFVAL1, DEFVAL2,
         DEFDESCRIPTION, DEFTOOLTIP, SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        ('GROUP_USERLOGIN', @GROUPCODE, N'Pembeli', 99, '', '',
         N'Group untuk akun pembeli portal (bukan operator Console)', '',
         'seed-portal', GETDATE());
    PRINT 'CPMATRIX: GROUP_USER dibuat.';
END
ELSE
    PRINT 'CPMATRIX: GROUP_USER sudah ada.';

-- 2) Akun uji user/user di CPUSER (USERGROUP = GROUP_USER, tanpa akses menu Console)
IF NOT EXISTS (SELECT 1 FROM CPUSER WHERE USERLOGIN = 'user')
BEGIN
    INSERT INTO CPUSER
        (USERLOGIN, USERNAME, USERPASSWORD, USERGROUP, USERACTIVE, USEREMAIL,
         USERDEPT, GROUPMODEL, SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        ('user', N'Pembeli Uji', dbo.app_encrypt('user'), @GROUPCODE, 'YES',
         'user@tiketapp.test', NULL, 'mode_standard', 'seed-portal', GETDATE());
    PRINT 'CPUSER: akun user dibuat (password "user" - ganti sebelum production!).';
END
ELSE
BEGIN
    -- Akun sudah ada tapi belum di group/aktif? Samakan.
    UPDATE CPUSER
       SET USERGROUP = @GROUPCODE,
           USERACTIVE = 'YES'
     WHERE USERLOGIN = 'user'
       AND (USERGROUP <> @GROUPCODE OR ISNULL(USERACTIVE, '') <> 'YES');
    PRINT 'CPUSER: akun user sudah ada, ensured group/aktif.';
END

-- 3) Akses menu untuk GROUP_USER.
--    MCODE mcontrol portal + induknya (MPARRENT), supaya pohon menu utuh.
DECLARE @MENUS TABLE (MNAME varchar(100), MCONTROL varchar(50));

-- PCOFFIE warnet — hanya Home untuk GROUP_USER (event/tiket removed)
INSERT INTO @MENUS (MNAME, MCONTROL) VALUES
    ('Home',            'mhome');

DECLARE @INS int = 0;
DECLARE @MNAME varchar(100), @MCONTROL varchar(50), @MCODE numeric, @MMODULE varchar(50), @MPARENT numeric;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT MNAME, MCONTROL FROM @MENUS;
OPEN cur;
FETCH NEXT FROM cur INTO @MNAME, @MCONTROL;
WHILE @@FETCH_STATUS = 0
BEGIN
    SELECT @MCODE = MCODE, @MMODULE = MMODULE, @MPARENT = MPARRENT
      FROM CPMENU
     WHERE MCONTROL = @MCONTROL;

    IF @MCODE IS NOT NULL
    BEGIN
        -- Menu leaf
        IF NOT EXISTS (SELECT 1 FROM CPMENUACCESS WHERE RGROUP = @GROUPCODE AND RMENUID = @MCODE)
        BEGIN
            INSERT INTO CPMENUACCESS (RGROUP, RMODULE, RMENUID, ACCREATE, ACUPDATE, ACDELETE, ACDATAALL)
            VALUES (@GROUPCODE, @MMODULE, @MCODE, 'NO', 'NO', 'NO', 'NO');
            SET @INS = @INS + 1;
        END;
        -- Induk menu (1 level), agar tidak menu yatim
        IF @MPARENT IS NOT NULL AND @MPARENT <> 0
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM CPMENUACCESS WHERE RGROUP = @GROUPCODE AND RMENUID = @MPARENT)
            BEGIN
                SELECT @MMODULE = MMODULE FROM CPMENU WHERE MCODE = @MPARENT;
                INSERT INTO CPMENUACCESS (RGROUP, RMODULE, RMENUID, ACCREATE, ACUPDATE, ACDELETE, ACDATAALL)
                VALUES (@GROUPCODE, @MMODULE, @MPARENT, 'NO', 'NO', 'NO', 'NO');
                SET @INS = @INS + 1;
            END;
        END;
    END;
    FETCH NEXT FROM cur INTO @MNAME, @MCONTROL;
END
CLOSE cur; DEALLOCATE cur;

PRINT 'CPMENUACCESS: ' + CAST(@INS AS varchar(10)) + ' hak akses ditambahkan/dilewati untuk ' + @GROUPCODE;

-- 4) Ringkasan
SELECT 'menu_akses_group_user' AS info, CAST(COUNT(*) AS varchar(10)) AS jumlah
  FROM CPMENUACCESS WHERE RGROUP = @GROUPCODE;

GO

/* ---------------------------------------------------------------------------
   ROLLBACK 003 (hapus group & akun uji):
   DELETE FROM CPMENUACCESS WHERE RGROUP = 'GROUP_USER';
   DELETE FROM CPUSER     WHERE USERLOGIN = 'user';
   DELETE FROM CPMATRIX   WHERE DEFMODULE = 'GROUP_USERLOGIN' AND DEFCODE = 'GROUP_USER';
   ------------------------------------------------------------------------- */