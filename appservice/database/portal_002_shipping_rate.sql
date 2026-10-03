/* =============================================================================
   PORTAL PEMBELI - migration 002
   Tabel T_SHIPPING_RATE : ongkos kirim merchandise, tarif FIX per kurir.

   Dispatcher SysConfig/SysConfig belum ada, jadi tarif kurir disimpan di
   satu tabel ini (bukan TValue) supaya bisa diubah operator lewat Console
   tanpa mengubah kode. Nilai kasar 2026, dapat diubah kapan saja.

   Idempotent : aman dijalankan berkali-kali.
   Rollback   : DROP TABLE (tidak ada data turunan).
   ========================================================================== */

SET NOCOUNT ON;

IF OBJECT_ID('dbo.T_SHIPPING_RATE', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.T_SHIPPING_RATE
    (
        RATEID        int IDENTITY(1,1) NOT NULL,
        COURIER       varchar(50)   NOT NULL,
        COST          numeric(18,2) NOT NULL CONSTRAINT DF_SHIPRATE_COST DEFAULT (0),
        ESTIMATEHOURS int           NULL,
        ISACTIVE      varchar(3)    NOT NULL CONSTRAINT DF_SHIPRATE_ACTIVE DEFAULT 'YES',
        NOTE          varchar(200)  NULL,
        SYSCREATEUSER varchar(50)   NULL,
        SYSCREATEDATE datetime2     NULL CONSTRAINT DF_SHIPRATE_CREATED DEFAULT (GETDATE()),
        SYSUPDATEUSER varchar(50)   NULL,
        SYSUPDATEDATE datetime2     NULL,
        CONSTRAINT PK_SHIPPING_RATE PRIMARY KEY CLUSTERED (RATEID),
        CONSTRAINT UQ_SHIPPING_RATE_COURIER UNIQUE (COURIER)
    );

    -- Nilai awal: tarif tetap per kurir (bisa diubah di Console / SQL).
    INSERT INTO dbo.T_SHIPPING_RATE (COURIER, COST, ESTIMATEHOURS, ISACTIVE, NOTE)
    VALUES
        ('JNE REG',      12000, 3, 'YES', 'Tarif tetap ongkos kirim (JNE Reguler)'),
        ('JNE YES',      18000, 2, 'YES', 'Tarif tetap ongkos kirim (JNE YeS)'),
        ('J&T REG',      14000, 3, 'YES', 'Tarif tetap ongkos kirim (J&T Reguler)'),
        ('J&T YES',      20000, 2, 'YES', 'Tarif tetap ongkos kirim (J&T YeS)'),
        ('SI CEPAT',     22000, 1, 'YES', 'Tarif tetap ongkos kirim (SiCepat)'),
        ('ANTERAJA',     16000, 3, 'YES', 'Tarif tetap ongkos kirim (AnterAja)'),
        ('POS',           9000, 6, 'YES', 'Tarif tetap ongkos kirim (POS)'),
        ('GO-SEND',      13000, 4, 'YES', 'Tarif tetap ongkos kirim (GoSend)'),
        ('SAMEER',       11000, 4, 'YES', 'Tarif tetap ongkos kirim (Sameer)'),
        ('NUSAJAYA',     15000, 5, 'YES', 'Tarif tetap ongkos kirim (Nusantara Express)');

    PRINT 'T_SHIPPING_RATE dibuat + 10 tarif kurir awal.';
END
ELSE
    PRINT 'T_SHIPPING_RATE sudah ada, dilewati.';

GO

/* ---------------------------------------------------------------------------
   ROLLBACK 002:
   DROP TABLE dbo.T_SHIPPING_RATE;
   ------------------------------------------------------------------------- */