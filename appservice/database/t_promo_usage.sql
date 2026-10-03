-- Riwayat pemakaian promo (Marketing Tools, module Marketing). Aturan: T_ prefix.
-- Satu baris = satu pemakaian. Hanya-tambah (tidak ada endpoint ubah/hapus).
-- REFERENCENO kosong untuk sekarang (titik sambung module lain).
-- Email pembeli disamarkan di Audit Log dan tidak masuk System Log.
-- Idempoten: CREATE/index hanya bila belum ada. Jalankan per pernyataan
-- (pisahkan tiap GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_PROMO_USAGE;

IF OBJECT_ID('dbo.T_PROMO_USAGE', 'U') IS NULL
CREATE TABLE dbo.T_PROMO_USAGE (
    USAGEID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    PROMOID INT NOT NULL,
    EVENTID INT NULL,
    BUYEREMAIL VARCHAR(100) NULL,
    BEFOREAMOUNT NUMERIC(18,2) NOT NULL DEFAULT 0,
    DISCAMOUNT NUMERIC(18,2) NOT NULL DEFAULT 0,
    USEDATETIME DATETIME2 NOT NULL DEFAULT GETDATE(),
    STATUS VARCHAR(10) NOT NULL DEFAULT 'DIPAKAI',
    REFERENCENO VARCHAR(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_PROMO_USAGE_PROMO' AND object_id = OBJECT_ID('dbo.T_PROMO_USAGE'))
CREATE INDEX IX_T_PROMO_USAGE_PROMO ON dbo.T_PROMO_USAGE (PROMOID, STATUS);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_PROMO_USAGE_BUYER' AND object_id = OBJECT_ID('dbo.T_PROMO_USAGE'))
CREATE INDEX IX_T_PROMO_USAGE_BUYER ON dbo.T_PROMO_USAGE (PROMOID, BUYEREMAIL, STATUS);
GO

-- Verifikasi:
-- SELECT PROMOID, STATUS, COUNT(*) JML FROM dbo.T_PROMO_USAGE GROUP BY PROMOID, STATUS;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_PROMO_USAGE;
