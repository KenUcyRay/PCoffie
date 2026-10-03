-- Statistik harian iklan (Marketing Tools, module Marketing). Aturan: T_ prefix.
-- Satu baris = satu kampanye + satu tanggal. Kombinasi unik.
-- Ditulis lewat pembaruan atomik (tambah angka, tanpa baca-tulis terpisah).
-- Idempoten: CREATE/index hanya bila belum ada. Jalankan per pernyataan
-- (pisahkan tiap GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_AD_STAT_DAILY;

IF OBJECT_ID('dbo.T_AD_STAT_DAILY', 'U') IS NULL
CREATE TABLE dbo.T_AD_STAT_DAILY (
    STATID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CAMPAIGNID INT NOT NULL,
    STATDATE DATE NOT NULL,
    IMPRESSIONS INT NOT NULL DEFAULT 0,
    CLICKS INT NOT NULL DEFAULT 0
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_T_AD_STAT_DAILY_CAMP' AND object_id = OBJECT_ID('dbo.T_AD_STAT_DAILY'))
CREATE UNIQUE INDEX UX_T_AD_STAT_DAILY_CAMP ON dbo.T_AD_STAT_DAILY (CAMPAIGNID, STATDATE);
GO

-- Verifikasi:
-- SELECT CAMPAIGNID, STATDATE, IMPRESSIONS, CLICKS FROM dbo.T_AD_STAT_DAILY ORDER BY STATDATE DESC;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_AD_STAT_DAILY;
