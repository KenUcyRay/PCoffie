-- Penghitung nomor invoice per bulan (Finance). Aturan: T_ prefix.
-- Satu baris = satu bulan YYYYMM. Dikunci (UPDLOCK,HOLDLOCK) saat terbit
-- supaya tidak ada nomor ganda atau loncat karena permintaan bersamaan.
-- Idempoten: CREATE/index hanya bila belum ada. Jalankan per pernyataan (GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_INVOICE_SEQUENCE;

IF OBJECT_ID('dbo.T_INVOICE_SEQUENCE', 'U') IS NULL
CREATE TABLE dbo.T_INVOICE_SEQUENCE (
    YYYYMM CHAR(6) NOT NULL PRIMARY KEY,
    LASTNO INT NOT NULL DEFAULT 0
);
GO

-- Tanpa seed: baris dibuat saat invoice pertama bulan itu terbit.
-- Verifikasi:
-- SELECT YYYYMM, LASTNO FROM dbo.T_INVOICE_SEQUENCE ORDER BY YYYYMM;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_INVOICE_SEQUENCE;
