-- Cakupan promo (Marketing Tools, module Marketing). Aturan: T_ prefix.
-- Satu baris = satu target (kategori event atau event) satu promo.
-- TARGETTYPE: KATEGORI (TARGETCODE = CATCODE T_CATEGORY) atau
-- EVENT (TARGETCODE = EVENTCODE T_EVENT). Dipakai bila SCOPETYPE promo
-- KATEGORI/EVENT. Tanpa FK fisik (mengikuti pola project).
-- Idempoten: CREATE/index hanya bila belum ada. Jalankan per pernyataan
-- (pisahkan tiap GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_PROMO_SCOPE;

IF OBJECT_ID('dbo.T_PROMO_SCOPE', 'U') IS NULL
CREATE TABLE dbo.T_PROMO_SCOPE (
    SCOPEID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    PROMOID INT NOT NULL,
    TARGETTYPE VARCHAR(10) NOT NULL,
    TARGETCODE VARCHAR(30) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_PROMO_SCOPE_PROMO' AND object_id = OBJECT_ID('dbo.T_PROMO_SCOPE'))
CREATE INDEX IX_T_PROMO_SCOPE_PROMO ON dbo.T_PROMO_SCOPE (PROMOID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_T_PROMO_SCOPE_TARGET' AND object_id = OBJECT_ID('dbo.T_PROMO_SCOPE'))
CREATE UNIQUE INDEX UX_T_PROMO_SCOPE_TARGET ON dbo.T_PROMO_SCOPE (PROMOID, TARGETTYPE, TARGETCODE);
GO

-- Verifikasi:
-- SELECT PROMOID, TARGETTYPE, TARGETCODE FROM dbo.T_PROMO_SCOPE ORDER BY PROMOID;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_PROMO_SCOPE;
