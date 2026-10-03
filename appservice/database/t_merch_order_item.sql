-- Item pesanan merchandise (My Purchase / Seller Order, module Merchandise).
-- Aturan: tabel baru pakai awalan T_. Nama + harga disalin saat dibuat
-- (kebal terhadap perubahan produk kemudian).
-- Idempoten: CREATE/index hanya bila belum ada. Jalankan per pernyataan
-- (pisahkan tiap GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_MERCH_ORDER_ITEM;

IF OBJECT_ID('dbo.T_MERCH_ORDER_ITEM', 'U') IS NULL
CREATE TABLE dbo.T_MERCH_ORDER_ITEM (
    ITEMID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ORDERID INT NOT NULL,
    PRODUCTID INT NOT NULL,
    PRODUCTNAME VARCHAR(150) NOT NULL,
    UNITPRICE NUMERIC(18,2) NOT NULL DEFAULT 0,
    QTY INT NOT NULL DEFAULT 1,
    SUBTOTAL NUMERIC(18,2) NOT NULL DEFAULT 0
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_MERCH_ORDER_ITEM_ORDER' AND object_id = OBJECT_ID('dbo.T_MERCH_ORDER_ITEM'))
CREATE INDEX IX_T_MERCH_ORDER_ITEM_ORDER ON dbo.T_MERCH_ORDER_ITEM (ORDERID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_MERCH_ORDER_ITEM_PROD' AND object_id = OBJECT_ID('dbo.T_MERCH_ORDER_ITEM'))
CREATE INDEX IX_T_MERCH_ORDER_ITEM_PROD ON dbo.T_MERCH_ORDER_ITEM (PRODUCTID);
GO

-- Verifikasi:
-- SELECT ORDERID, COUNT(*) JML FROM dbo.T_MERCH_ORDER_ITEM GROUP BY ORDERID;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_MERCH_ORDER_ITEM;
