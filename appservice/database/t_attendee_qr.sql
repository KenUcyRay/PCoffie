-- Kolom QR di T_ATTENDEE (Ticket Check-in, module Ticketing).
-- QRVERSION: versi QR (default 1); naik tiap buat ulang -> QR lama mati.
-- LASTSENTAT: waktu terakhir tiket dikirim. Token QR TIDAK disimpan
-- (dibuat ulang dari kode+ID+event+versi + HMAC).
-- Idempoten: ADD hanya bila kolom belum ada.
-- ROLLBACK (jalankan manual bila perlu):
-- ALTER TABLE dbo.T_ATTENDEE DROP COLUMN QRVERSION;
-- ALTER TABLE dbo.T_ATTENDEE DROP COLUMN LASTSENTAT;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.T_ATTENDEE') AND name = 'QRVERSION')
ALTER TABLE dbo.T_ATTENDEE ADD QRVERSION INT NOT NULL DEFAULT 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.T_ATTENDEE') AND name = 'LASTSENTAT')
ALTER TABLE dbo.T_ATTENDEE ADD LASTSENTAT DATETIME2 NULL;
GO

-- Verifikasi:
-- SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T_ATTENDEE' AND COLUMN_NAME IN ('QRVERSION', 'LASTSENTAT');
