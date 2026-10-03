-- Gambar produk merchandise (Seller Center, module Merchandise).
-- Aturan: tabel baru pakai awalan T_. Satu baris = satu file gambar.
-- Urutan pertama (SORTORDER terkecil) menjadi gambar utama.
-- Idempoten: CREATE/index hanya bila belum ada. Jalankan per pernyataan
-- (pisahkan tiap GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_PRODUCT_IMAGE;

IF OBJECT_ID('dbo.T_PRODUCT_IMAGE', 'U') IS NULL
CREATE TABLE dbo.T_PRODUCT_IMAGE (
    IMAGEID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    PRODUCTID INT NOT NULL,
    FILEPATH VARCHAR(255) NOT NULL,
    SORTORDER INT NOT NULL DEFAULT 0,
    SYSCREATEUSER VARCHAR(25) NULL,
    SYSCREATEDATE DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_PRODUCT_IMAGE_PROD' AND object_id = OBJECT_ID('dbo.T_PRODUCT_IMAGE'))
CREATE INDEX IX_T_PRODUCT_IMAGE_PROD ON dbo.T_PRODUCT_IMAGE (PRODUCTID, SORTORDER);
GO

-- Verifikasi:
-- SELECT PRODUCTID, COUNT(*) JML FROM dbo.T_PRODUCT_IMAGE GROUP BY PRODUCTID;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_PRODUCT_IMAGE;
