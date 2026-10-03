-- Template notifikasi sistem (App Setting, module System).
-- Aturan: tabel baru pakai awalan T_. Daftar template dibuat developer lewat
-- seed (terikat kejadian di program); admin hanya boleh ubah judul, isi, dan
-- status aktif. Satu kode boleh dua baris (EMAIL + IN_APP); kombinasi unik.
-- Reset ke bawaan memakai kolom DEFAULTSUBJECT/DEFAULTBODY.
-- Idempoten: CREATE/index/seed hanya bila belum ada. Jalankan per pernyataan
-- (pisahkan tiap GO).
-- ROLLBACK (jalankan manual bila perlu): DROP TABLE dbo.T_NOTIFICATION_TEMPLATE;

IF OBJECT_ID('dbo.T_NOTIFICATION_TEMPLATE', 'U') IS NULL
CREATE TABLE dbo.T_NOTIFICATION_TEMPLATE (
    TEMPLATEID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CODE VARCHAR(50) NOT NULL,
    CHANNEL VARCHAR(10) NOT NULL,
    NAME VARCHAR(100) NOT NULL,
    DESCR VARCHAR(255) NULL,
    SUBJECT VARCHAR(150) NOT NULL,
    BODY VARCHAR(5000) NOT NULL,
    PLACEHOLDERS VARCHAR(MAX) NULL,
    DEFAULTSUBJECT VARCHAR(150) NOT NULL,
    DEFAULTBODY VARCHAR(5000) NOT NULL,
    ISACTIVE VARCHAR(3) NOT NULL DEFAULT 'YES',
    SYSCREATEUSER VARCHAR(25) NULL,
    SYSCREATEDATE DATETIME2 NULL,
    SYSUPDATEUSER VARCHAR(25) NULL,
    SYSUPDATEDATE DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_T_NOTIFICATION_TEMPLATE_CODE' AND object_id = OBJECT_ID('dbo.T_NOTIFICATION_TEMPLATE'))
CREATE INDEX IX_T_NOTIFICATION_TEMPLATE_CODE ON dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_T_NOTIFICATION_TEMPLATE_CODECHANNEL' AND object_id = OBJECT_ID('dbo.T_NOTIFICATION_TEMPLATE'))
CREATE UNIQUE INDEX UX_T_NOTIFICATION_TEMPLATE_CODECHANNEL ON dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL);
GO

-- Seed 12 kode x 2 saluran (judul/isi bahasa Indonesia, sopan, singkat).
-- Pola tiap baris: INSERT ... SELECT ... WHERE NOT EXISTS (CODE + CHANNEL).

-- 1. TICKET_ISSUED (tiket terbit)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'TICKET_ISSUED', 'EMAIL', 'Tiket Terbit', 'Dikirim saat tiket berhasil diterbitkan.',
'Tiket {{event}} Anda sudah terbit',
'Halo {{nama}},

Tiket Anda untuk {{event}} sudah terbit.
Nomor order: {{nomor_order}}
Jadwal: {{jadwal}}

Tunjukkan nomor order saat masuk venue. Terima kasih.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"event":{"contoh":"Konser Raya","deskripsi":"Nama event"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jadwal":{"contoh":"12 Des 2026, 19.00","deskripsi":"Jadwal acara"}}',
'Tiket {{event}} Anda sudah terbit',
'Halo {{nama}},

Tiket Anda untuk {{event}} sudah terbit.
Nomor order: {{nomor_order}}
Jadwal: {{jadwal}}

Tunjukkan nomor order saat masuk venue. Terima kasih.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'TICKET_ISSUED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'TICKET_ISSUED', 'IN_APP', 'Tiket Terbit', 'Dikirim saat tiket berhasil diterbitkan.',
'Tiket {{event}} terbit',
'Halo {{nama}}, tiket {{event}} ({{nomor_order}}) sudah terbit. Jadwal: {{jadwal}}.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"event":{"contoh":"Konser Raya","deskripsi":"Nama event"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jadwal":{"contoh":"12 Des 2026, 19.00","deskripsi":"Jadwal acara"}}',
'Tiket {{event}} terbit',
'Halo {{nama}}, tiket {{event}} ({{nomor_order}}) sudah terbit. Jadwal: {{jadwal}}.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'TICKET_ISSUED' AND CHANNEL = 'IN_APP');
GO

-- 2. PAYMENT_SUCCESS (pembayaran berhasil)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PAYMENT_SUCCESS', 'EMAIL', 'Pembayaran Berhasil', 'Dikirim saat pembayaran terverifikasi.',
'Pembayaran {{nomor_order}} berhasil',
'Halo {{nama}},

Pembayaran sebesar {{jumlah}} untuk order {{nomor_order}} telah kami terima. Terima kasih.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jumlah":{"contoh":"Rp150.000","deskripsi":"Nominal pembayaran"}}',
'Pembayaran {{nomor_order}} berhasil',
'Halo {{nama}},

Pembayaran sebesar {{jumlah}} untuk order {{nomor_order}} telah kami terima. Terima kasih.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PAYMENT_SUCCESS' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PAYMENT_SUCCESS', 'IN_APP', 'Pembayaran Berhasil', 'Dikirim saat pembayaran terverifikasi.',
'Pembayaran berhasil',
'Halo {{nama}}, pembayaran {{jumlah}} untuk order {{nomor_order}} telah kami terima.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jumlah":{"contoh":"Rp150.000","deskripsi":"Nominal pembayaran"}}',
'Pembayaran berhasil',
'Halo {{nama}}, pembayaran {{jumlah}} untuk order {{nomor_order}} telah kami terima.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PAYMENT_SUCCESS' AND CHANNEL = 'IN_APP');
GO

-- 3. PAYMENT_EXPIRED (pembayaran kedaluwarsa)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PAYMENT_EXPIRED', 'EMAIL', 'Pembayaran Kedaluwarsa', 'Dikirim saat batas waktu pembayaran lewat.',
'Pembayaran {{nomor_order}} kedaluwarsa',
'Halo {{nama}},

Batas waktu pembayaran order {{nomor_order}} telah lewat. Silakan buat pesanan ulang bila masih berminat.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"}}',
'Pembayaran {{nomor_order}} kedaluwarsa',
'Halo {{nama}},

Batas waktu pembayaran order {{nomor_order}} telah lewat. Silakan buat pesanan ulang bila masih berminat.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PAYMENT_EXPIRED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PAYMENT_EXPIRED', 'IN_APP', 'Pembayaran Kedaluwarsa', 'Dikirim saat batas waktu pembayaran lewat.',
'Pembayaran kedaluwarsa',
'Halo {{nama}}, batas waktu pembayaran order {{nomor_order}} telah lewat.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"}}',
'Pembayaran kedaluwarsa',
'Halo {{nama}}, batas waktu pembayaran order {{nomor_order}} telah lewat.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PAYMENT_EXPIRED' AND CHANNEL = 'IN_APP');
GO

-- 4. REFUND_REQUESTED (refund diajukan)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'REFUND_REQUESTED', 'EMAIL', 'Refund Diajukan', 'Dikirim saat pengajuan refund diterima.',
'Pengajuan refund {{nomor_order}} diterima',
'Halo {{nama}},

Pengajuan refund sebesar {{jumlah}} untuk order {{nomor_order}} sudah kami terima dan sedang diperiksa.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jumlah":{"contoh":"Rp150.000","deskripsi":"Nominal refund"}}',
'Pengajuan refund {{nomor_order}} diterima',
'Halo {{nama}},

Pengajuan refund sebesar {{jumlah}} untuk order {{nomor_order}} sudah kami terima dan sedang diperiksa.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'REFUND_REQUESTED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'REFUND_REQUESTED', 'IN_APP', 'Refund Diajukan', 'Dikirim saat pengajuan refund diterima.',
'Refund diajukan',
'Halo {{nama}}, pengajuan refund {{jumlah}} untuk order {{nomor_order}} sedang diperiksa.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jumlah":{"contoh":"Rp150.000","deskripsi":"Nominal refund"}}',
'Refund diajukan',
'Halo {{nama}}, pengajuan refund {{jumlah}} untuk order {{nomor_order}} sedang diperiksa.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'REFUND_REQUESTED' AND CHANNEL = 'IN_APP');
GO

-- 5. REFUND_APPROVED (refund disetujui)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'REFUND_APPROVED', 'EMAIL', 'Refund Disetujui', 'Dikirim saat refund disetujui.',
'Refund {{nomor_order}} disetujui',
'Halo {{nama}},

Refund sebesar {{jumlah}} untuk order {{nomor_order}} telah disetujui dan akan diteruskan ke rekening Anda.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jumlah":{"contoh":"Rp150.000","deskripsi":"Nominal refund"}}',
'Refund {{nomor_order}} disetujui',
'Halo {{nama}},

Refund sebesar {{jumlah}} untuk order {{nomor_order}} telah disetujui dan akan diteruskan ke rekening Anda.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'REFUND_APPROVED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'REFUND_APPROVED', 'IN_APP', 'Refund Disetujui', 'Dikirim saat refund disetujui.',
'Refund disetujui',
'Halo {{nama}}, refund {{jumlah}} untuk order {{nomor_order}} disetujui.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"jumlah":{"contoh":"Rp150.000","deskripsi":"Nominal refund"}}',
'Refund disetujui',
'Halo {{nama}}, refund {{jumlah}} untuk order {{nomor_order}} disetujui.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'REFUND_APPROVED' AND CHANNEL = 'IN_APP');
GO

-- 6. REFUND_REJECTED (refund ditolak)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'REFUND_REJECTED', 'EMAIL', 'Refund Ditolak', 'Dikirim saat refund ditolak.',
'Refund {{nomor_order}} belum bisa disetujui',
'Halo {{nama}},

Mohon maaf, pengajuan refund order {{nomor_order}} belum bisa kami setujui. Alasan: {{alasan}}.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"alasan":{"contoh":"Melewati batas waktu","deskripsi":"Alasan penolakan"}}',
'Refund {{nomor_order}} belum bisa disetujui',
'Halo {{nama}},

Mohon maaf, pengajuan refund order {{nomor_order}} belum bisa kami setujui. Alasan: {{alasan}}.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'REFUND_REJECTED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'REFUND_REJECTED', 'IN_APP', 'Refund Ditolak', 'Dikirim saat refund ditolak.',
'Refund ditolak',
'Halo {{nama}}, refund order {{nomor_order}} belum bisa disetujui. Alasan: {{alasan}}.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"alasan":{"contoh":"Melewati batas waktu","deskripsi":"Alasan penolakan"}}',
'Refund ditolak',
'Halo {{nama}}, refund order {{nomor_order}} belum bisa disetujui. Alasan: {{alasan}}.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'REFUND_REJECTED' AND CHANNEL = 'IN_APP');
GO

-- 7. ORDER_SHIPPED (pesanan dikirim)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'ORDER_SHIPPED', 'EMAIL', 'Pesanan Dikirim', 'Dikirim saat pesanan fisik dikirim.',
'Pesanan {{nomor_order}} dikirim',
'Halo {{nama}},

Pesanan {{nomor_order}} telah dikirim via {{kurir}} dengan nomor resi {{nomor_resi}}.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"kurir":{"contoh":"JNE","deskripsi":"Nama kurir"},"nomor_resi":{"contoh":"1234567890","deskripsi":"Nomor resi"}}',
'Pesanan {{nomor_order}} dikirim',
'Halo {{nama}},

Pesanan {{nomor_order}} telah dikirim via {{kurir}} dengan nomor resi {{nomor_resi}}.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'ORDER_SHIPPED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'ORDER_SHIPPED', 'IN_APP', 'Pesanan Dikirim', 'Dikirim saat pesanan fisik dikirim.',
'Pesanan dikirim',
'Halo {{nama}}, pesanan {{nomor_order}} dikirim via {{kurir}} (resi {{nomor_resi}}).',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"nomor_order":{"contoh":"ORD-123","deskripsi":"Nomor order"},"kurir":{"contoh":"JNE","deskripsi":"Nama kurir"},"nomor_resi":{"contoh":"1234567890","deskripsi":"Nomor resi"}}',
'Pesanan dikirim',
'Halo {{nama}}, pesanan {{nomor_order}} dikirim via {{kurir}} (resi {{nomor_resi}}).',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'ORDER_SHIPPED' AND CHANNEL = 'IN_APP');
GO

-- 8. EVENT_CANCELLED (event dibatalkan)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'EVENT_CANCELLED', 'EMAIL', 'Event Dibatalkan', 'Dikirim saat event dibatalkan.',
'Event {{event}} dibatalkan',
'Halo {{nama}},

Mohon maaf, event {{event}} dibatalkan oleh penyelenggara. Dana Anda akan dikembalikan otomatis.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"event":{"contoh":"Konser Raya","deskripsi":"Nama event"}}',
'Event {{event}} dibatalkan',
'Halo {{nama}},

Mohon maaf, event {{event}} dibatalkan oleh penyelenggara. Dana Anda akan dikembalikan otomatis.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'EVENT_CANCELLED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'EVENT_CANCELLED', 'IN_APP', 'Event Dibatalkan', 'Dikirim saat event dibatalkan.',
'Event dibatalkan',
'Halo {{nama}}, event {{event}} dibatalkan. Dana Anda akan dikembalikan otomatis.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"event":{"contoh":"Konser Raya","deskripsi":"Nama event"}}',
'Event dibatalkan',
'Halo {{nama}}, event {{event}} dibatalkan. Dana Anda akan dikembalikan otomatis.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'EVENT_CANCELLED' AND CHANNEL = 'IN_APP');
GO

-- 9. EVENT_SCHEDULE_CHANGED (jadwal event berubah)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'EVENT_SCHEDULE_CHANGED', 'EMAIL', 'Jadwal Event Berubah', 'Dikirim saat jadwal event berubah.',
'Jadwal {{event}} berubah',
'Halo {{nama}},

Jadwal event {{event}} berubah menjadi {{jadwal_baru}}. Tiket Anda tetap berlaku.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"event":{"contoh":"Konser Raya","deskripsi":"Nama event"},"jadwal_baru":{"contoh":"13 Des 2026, 19.00","deskripsi":"Jadwal baru"}}',
'Jadwal {{event}} berubah',
'Halo {{nama}},

Jadwal event {{event}} berubah menjadi {{jadwal_baru}}. Tiket Anda tetap berlaku.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'EVENT_SCHEDULE_CHANGED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'EVENT_SCHEDULE_CHANGED', 'IN_APP', 'Jadwal Event Berubah', 'Dikirim saat jadwal event berubah.',
'Jadwal berubah',
'Halo {{nama}}, jadwal {{event}} berubah menjadi {{jadwal_baru}}.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"event":{"contoh":"Konser Raya","deskripsi":"Nama event"},"jadwal_baru":{"contoh":"13 Des 2026, 19.00","deskripsi":"Jadwal baru"}}',
'Jadwal berubah',
'Halo {{nama}}, jadwal {{event}} berubah menjadi {{jadwal_baru}}.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'EVENT_SCHEDULE_CHANGED' AND CHANNEL = 'IN_APP');
GO

-- 10. PAYOUT_SUCCESS (pencairan dana berhasil)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PAYOUT_SUCCESS', 'EMAIL', 'Pencairan Dana Berhasil', 'Dikirim saat pencairan dana berhasil.',
'Pencairan dana berhasil',
'Halo {{nama}},

Pencairan dana sebesar {{jumlah}} telah berhasil diteruskan.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"jumlah":{"contoh":"Rp1.000.000","deskripsi":"Nominal pencairan"}}',
'Pencairan dana berhasil',
'Halo {{nama}},

Pencairan dana sebesar {{jumlah}} telah berhasil diteruskan.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PAYOUT_SUCCESS' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PAYOUT_SUCCESS', 'IN_APP', 'Pencairan Dana Berhasil', 'Dikirim saat pencairan dana berhasil.',
'Dana cair',
'Halo {{nama}}, pencairan dana {{jumlah}} berhasil diteruskan.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"jumlah":{"contoh":"Rp1.000.000","deskripsi":"Nominal pencairan"}}',
'Dana cair',
'Halo {{nama}}, pencairan dana {{jumlah}} berhasil diteruskan.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PAYOUT_SUCCESS' AND CHANNEL = 'IN_APP');
GO

-- 11. WITHDRAWAL_SUCCESS (penarikan saldo berhasil)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'WITHDRAWAL_SUCCESS', 'EMAIL', 'Penarikan Saldo Berhasil', 'Dikirim saat penarikan saldo berhasil.',
'Penarikan saldo berhasil',
'Halo {{nama}},

Penarikan saldo sebesar {{jumlah}} telah berhasil diproses.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"jumlah":{"contoh":"Rp500.000","deskripsi":"Nominal penarikan"}}',
'Penarikan saldo berhasil',
'Halo {{nama}},

Penarikan saldo sebesar {{jumlah}} telah berhasil diproses.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'WITHDRAWAL_SUCCESS' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'WITHDRAWAL_SUCCESS', 'IN_APP', 'Penarikan Saldo Berhasil', 'Dikirim saat penarikan saldo berhasil.',
'Saldo ditarik',
'Halo {{nama}}, penarikan saldo {{jumlah}} berhasil diproses.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"jumlah":{"contoh":"Rp500.000","deskripsi":"Nominal penarikan"}}',
'Saldo ditarik',
'Halo {{nama}}, penarikan saldo {{jumlah}} berhasil diproses.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'WITHDRAWAL_SUCCESS' AND CHANNEL = 'IN_APP');
GO

-- 12. PASSWORD_CHANGED (password diubah)
INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PASSWORD_CHANGED', 'EMAIL', 'Password Diubah', 'Dikirim saat password akun diubah.',
'Password akun Anda diubah',
'Halo {{nama}},

Password akun Anda diubah pada {{waktu}}. Abaikan pesan ini bila Anda yang melakukannya.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"waktu":{"contoh":"03 Okt 2026, 14.05","deskripsi":"Waktu perubahan"}}',
'Password akun Anda diubah',
'Halo {{nama}},

Password akun Anda diubah pada {{waktu}}. Abaikan pesan ini bila Anda yang melakukannya.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PASSWORD_CHANGED' AND CHANNEL = 'EMAIL');
GO

INSERT INTO dbo.T_NOTIFICATION_TEMPLATE (CODE, CHANNEL, NAME, DESCR, SUBJECT, BODY, PLACEHOLDERS, DEFAULTSUBJECT, DEFAULTBODY, ISACTIVE, SYSCREATEUSER, SYSCREATEDATE)
SELECT 'PASSWORD_CHANGED', 'IN_APP', 'Password Diubah', 'Dikirim saat password akun diubah.',
'Password diubah',
'Halo {{nama}}, password akun Anda diubah pada {{waktu}}.',
'{"nama":{"contoh":"Budi","deskripsi":"Nama penerima"},"waktu":{"contoh":"03 Okt 2026, 14.05","deskripsi":"Waktu perubahan"}}',
'Password diubah',
'Halo {{nama}}, password akun Anda diubah pada {{waktu}}.',
'YES', 'SEED', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM dbo.T_NOTIFICATION_TEMPLATE WHERE CODE = 'PASSWORD_CHANGED' AND CHANNEL = 'IN_APP');
GO

-- Verifikasi:
-- SELECT CODE, CHANNEL, NAME, ISACTIVE FROM dbo.T_NOTIFICATION_TEMPLATE ORDER BY CODE, CHANNEL;

-- ROLLBACK (hanya development):
-- DROP TABLE IF EXISTS dbo.T_NOTIFICATION_TEMPLATE;
