/* =============================================================================
   PORTAL PEMBELI - seed 004
   Data contoh (fiktif) untuk akun uji "user" (GROUP_USER), supaya alur portal
   bisa diuji tanpa harus membeli sungguhan:
     - 1 pesanan MENUNGGU pembayaran (2 tiket, salah satu punya batas waktu dekat)
     - tiket LUNAS (aktif), tiket sudah dipakai (HADIR), tiket refund DIAJUKAN
     - 1 pesanan merchandise + riwayat pembayaran + invoice + pesan inbox
   Semua data memakai EMAIL = user@tiketapp.test (email akun "user"), jadi
  Ownership di backend (dimatch dari token) langsung cocok.
   Idempotent  : aman dijalankan berkali-kali (cek TICKETCODE/ORDERNO unik).
   Rollback    : blok ROLLBACK di bawah.
   ========================================================================== */

SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;

DECLARE @EMAIL varchar(100) = 'user@tiketapp.test';
DECLARE @LOGIN varchar(50)  = 'user';
DECLARE @NOW   datetime2    = GETDATE();

DECLARE @EV1 int = (SELECT MIN(EVENTID) FROM T_EVENT WHERE STATUS = 'PUBLISHED' AND ISNULL(ENDAT, GETDATE()) >= GETDATE());
DECLARE @EV2 int = (SELECT MIN(EVENTID) FROM T_EVENT WHERE STATUS = 'PUBLISHED' AND EVENTID <> @EV1 AND ISNULL(ENDAT, GETDATE()) >= GETDATE());
IF @EV2 IS NULL SET @EV2 = @EV1;

DECLARE @TT1 int = (SELECT MIN(TICKETTYPEID) FROM T_TICKET_TYPE WHERE EVENTID = @EV1 AND ISNULL(ISACTIVE,'YES') <> 'NO');
DECLARE @TT2 int = (SELECT MIN(TICKETTYPEID) FROM T_TICKET_TYPE WHERE EVENTID = @EV2 AND ISNULL(ISACTIVE,'YES') <> 'NO');
IF @TT2 IS NULL SET @TT2 = @TT1;

DECLARE @FEE numeric(18,2) = ISNULL((SELECT TOP 1 SERVICEPERTICKET FROM T_FEE_SETTING WHERE ISNULL(FEESTATUS,'AKTIF') = 'AKTIF' ORDER BY EFFECTIVEFROM DESC), 0);
DECLARE @PRICE1 numeric(18,2) = ISNULL((SELECT PRICE FROM T_TICKET_TYPE WHERE TICKETTYPEID = @TT1), 0);
DECLARE @PRICE2 numeric(18,2) = ISNULL((SELECT PRICE FROM T_TICKET_TYPE WHERE TICKETTYPEID = @TT2), @PRICE1);

PRINT 'Event dipakai: ' + CAST(@EV1 AS varchar(10)) + ' / ' + CAST(@EV2 AS varchar(10));
PRINT 'Tipe tiket    : ' + CAST(@TT1 AS varchar(10)) + ' / ' + CAST(@TT2 AS varchar(10));

/* --------------------------------------------------------------------------
   1. TIKET AKTIF (LUNAS, belum dipakai) -> muncul di tab "Aktif" + QR valid
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXAKT01')
BEGIN
    INSERT INTO T_ATTENDEE
        (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE, SOURCE,
         PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, ORDERCODE, REGDATE, QRVERSION,
         SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        (@EV1, @TT1, 'Pembeli Uji', @EMAIL, '081234567890', 'UFIXAKT01', 'PORTAL',
         'LUNAS', 'BELUM', 'AKTIF', 'UFIX-AKTIF', DATEADD(DAY, -5, @NOW), 1, 'seed-portal', @NOW);
    PRINT 'Tiket aktif dibuat.';
END

/* --------------------------------------------------------------------------
   2. TIKET MENUNGGU BAYAR (BELUM_BAYAR) -> tab "Menunggu Pembayaran"
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXWAIT1')
BEGIN
    INSERT INTO T_ATTENDEE
        (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE, SOURCE,
         PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, ORDERCODE, REGDATE, QRVERSION,
         SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        (@EV2, @TT2, 'Pembeli Uji', @EMAIL, '081234567890', 'UFIXWAIT1', 'PORTAL',
         'BELUM_BAYAR', 'BELUM', 'AKTIF', 'UFIX-WAIT', @NOW, 1, 'seed-portal', @NOW);
    PRINT 'Tiket menunggu bayar dibuat.';
END

/* --------------------------------------------------------------------------
   3. PESANAN MENUNGGU PEMBAYARAN (2 tiket, T_TICKET_ORDER)
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_TICKET_ORDER WHERE ORDERCODE = 'UFIX-WAIT')
BEGIN
    DECLARE @SUB numeric(18,2) = @PRICE1 * 1 + @PRICE2 * 1;
    DECLARE @SERV numeric(18,2) = @FEE * 2;
    INSERT INTO T_TICKET_ORDER
        (ORDERCODE, EVENTID, TICKETTYPEID, QTY, BUYERUSER, BUYERNAME, BUYEREMAIL, BUYERPHONE,
         SUBTOTAL, DISCOUNT, SERVICEFEE, TOTAL, STATUS, PAYDEADLINE,
         SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        ('UFIX-WAIT', @EV1, @TT1, 2, @LOGIN, 'Pembeli Uji', @EMAIL, '081234567890',
         @SUB, 0, @SERV, @SUB + @SERV, 'MENUNGGU', DATEADD(HOUR, 3, @NOW), 'seed-portal', @NOW);
    DECLARE @OID int = (SELECT ORDERID FROM T_TICKET_ORDER WHERE ORDERCODE = 'UFIX-WAIT');
    UPDATE T_ATTENDEE SET ORDERID = @OID, ORDERCODE = 'UFIX-WAIT' WHERE TICKETCODE = 'UFIXWAIT1';
    PRINT 'Pesanan menunggu bayar dibuat.';
END

/* --------------------------------------------------------------------------
   4. TIKET SUDAH DIPAKAI (LUNAS + HADIR + CHECKINTIME) -> tab "Sudah Dipakai"
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXUSED1')
BEGIN
    INSERT INTO T_ATTENDEE
        (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE, SOURCE,
         PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, CHECKINTIME, ORDERCODE, REGDATE, QRVERSION,
         SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        (@EV1, @TT1, 'Pembeli Uji', @EMAIL, '081234567890', 'UFIXUSED1', 'GATE',
         'LUNAS', 'HADIR', 'AKTIF', DATEADD(HOUR, -2, @NOW), 'UFIX-USED', DATEADD(DAY, -10, @NOW), 1, 'seed-portal', @NOW);
    PRINT 'Tiket dipakai dibuat.';
END

/* --------------------------------------------------------------------------
   5. TIKET REFUND DIAJUKAN -> tab "Refund/Batal" (QR nonaktif)
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXRFND1')
BEGIN
    INSERT INTO T_ATTENDEE
        (EVENTID, TICKETTYPEID, NAME, EMAIL, PHONE, TICKETCODE, SOURCE,
         PAYSTATUS, ATTENDSTATUS, TIKETSTATUS, ORDERCODE, REGDATE, QRVERSION,
         SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        (@EV2, @TT2, 'Pembeli Uji', @EMAIL, '081234567890', 'UFIXRFND1', 'PORTAL',
         'LUNAS', 'BELUM', 'AKTIF', 'UFIX-RFND', DATEADD(DAY, -3, @NOW), 1, 'seed-portal', @NOW);
    DECLARE @RID int = (SELECT ATTENDEEID FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXRFND1');
    IF NOT EXISTS (SELECT 1 FROM T_TICKET_REFUND WHERE TICKETID = @RID)
    BEGIN
INSERT INTO T_TICKET_REFUND (REFUNDNO, TICKETID, EVENTID, NOMINAL, REASON, STATUS, REQUESTTIME, REQUESTBY)
        SELECT 'RFN-UFIX-0001', @RID, A.EVENTID,
               ISNULL((SELECT TT.PRICE FROM T_TICKET_TYPE TT WHERE TT.TICKETTYPEID = A.TICKETTYPEID), 0),
               'Tidak bisa hadir, bentrok jadwal', 'DIAJUKAN', @NOW, @LOGIN
        FROM T_ATTENDEE A WHERE A.ATTENDEEID = @RID;
        PRINT 'Pengajuan refund dibuat.';
    END
END

/* --------------------------------------------------------------------------
   6. PESANAN MERCHANDISE (satu penjual) + item
   -------------------------------------------------------------------------- */
DECLARE @SELLER int = (SELECT MIN(SELLERID) FROM T_SELLER WHERE ISNULL(ISACTIVE,'YES') <> 'NO');
IF @SELLER IS NOT NULL AND NOT EXISTS (SELECT 1 FROM T_MERCH_ORDER WHERE ORDERNO = 'MRH-UFIX-0001')
BEGIN
    DECLARE @PROD int = (SELECT MIN(PRODUCTID) FROM T_PRODUCT WHERE SELLERID = @SELLER AND ISNULL(ISACTIVE,'YES') <> 'NO' AND ISNULL(STOCK,0) > 0);
    IF @PROD IS NOT NULL
    BEGIN
        DECLARE @PPRICE numeric(18,2) = ISNULL((SELECT PRICE FROM T_PRODUCT WHERE PRODUCTID = @PROD), 0);
        DECLARE @SHIP numeric(18,2) = ISNULL((SELECT TOP 1 COST FROM T_SHIPPING_RATE WHERE ISNULL(ISACTIVE,'YES') <> 'NO' ORDER BY COST), 0);
        INSERT INTO T_MERCH_ORDER
            (ORDERNO, SELLERID, BUYERNAME, BUYERPHONE, BUYEREMAIL, ADDRESS, CITY, PROVINCE, POSTALCODE,
             COURIER, TRACKINGNO, SUBTOTAL, SHIPPING, TOTAL, ORDERSTATUS, PAYSTATUS, PAIDAT,
             SYSCREATEUSER, SYSCREATEDATE)
        VALUES
            ('MRH-UFIX-0001', @SELLER, 'Pembeli Uji', '081234567890', @EMAIL,
             'Jl. Contoh Uji No. 9', 'Bandung', 'Jawa Barat', '40115',
             (SELECT TOP 1 COURIER FROM T_SHIPPING_RATE WHERE ISNULL(ISACTIVE,'YES') <> 'NO' ORDER BY COST),
             'UFIXTRK001', @PPRICE * 2, @SHIP, @PPRICE * 2 + @SHIP,
             'DIKIRIM', 'LUNAS', DATEADD(DAY, -4, @NOW), 'seed-portal', @NOW);
        DECLARE @MOID int = (SELECT ORDERID FROM T_MERCH_ORDER WHERE ORDERNO = 'MRH-UFIX-0001');
        INSERT INTO T_MERCH_ORDER_ITEM (ORDERID, PRODUCTID, PRODUCTNAME, UNITPRICE, QTY, SUBTOTAL)
        SELECT @MOID, @PROD, NAME, @PPRICE, 2, @PPRICE * 2 FROM T_PRODUCT WHERE PRODUCTID = @PROD;
        INSERT INTO T_MERCH_ORDER_HISTORY (ORDERID, OLDSTATUS, NEWSTATUS, NOTE, ACTOR, ACTTIME)
        VALUES (@MOID, NULL, 'DIPESAN', 'Dibuat dari portal', 'seed-portal', DATEADD(DAY, -6, @NOW)),
               (@MOID, 'DIPESAN', 'DIPROSES', 'Diproses penjual', 'seed-portal', DATEADD(DAY, -5, @NOW)),
               (@MOID, 'DIPROSES', 'DIKIRIM', 'Resi UFIXTRK001', 'seed-portal', DATEADD(DAY, -4, @NOW));
        PRINT 'Pesanan merchandise dibuat.';
    END
END

/* --------------------------------------------------------------------------
   7. RIWAYAT PEMBAYARAN + INVOICE milik pembeli
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_PAYMENT WHERE EXTREF = 'UFIXPAY01')
BEGIN
    DECLARE @A1 int = (SELECT ATTENDEEID FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXAKT01');
    DECLARE @A2 int = (SELECT ATTENDEEID FROM T_ATTENDEE WHERE TICKETCODE = 'UFIXUSED1');
    IF @A1 IS NOT NULL
    BEGIN
        INSERT INTO T_PAYMENT
            (PAYNO, REFTYPE, REFID, EVENTID, SUBTOTAL, DISCOUNT, SERVICEFEE, TOTALPAID, PAIDAT, SOURCE, STATUS, EXTREF, SYSCREATEUSER, SYSCREATEDATE)
        SELECT 'PAYUFIX000001', 'TIKET', @A1, A.EVENTID,
               ISNULL((SELECT PRICE FROM T_TICKET_TYPE TT WHERE TT.TICKETTYPEID = A.TICKETTYPEID), 0), 0, 0,
               ISNULL((SELECT PRICE FROM T_TICKET_TYPE TT WHERE TT.TICKETTYPEID = A.TICKETTYPEID), 0),
               DATEADD(DAY, -5, @NOW), 'MANUAL', 'BERHASIL', 'UFIXPAY01', 'seed-portal', @NOW
        FROM T_ATTENDEE A WHERE A.ATTENDEEID = @A1;
        DECLARE @P1 int = (SELECT PAYMENTID FROM T_PAYMENT WHERE EXTREF = 'UFIXPAY01');
        IF @P1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM T_INVOICE WHERE PAYMENTID = @P1)
            INSERT INTO T_INVOICE (INVNO, PAYMENTID, REFTYPE, ISSUEDATE, RECIPIENT, RECIPIENTEMAIL, LINES, TOTAL, STATUS, SYSCREATEUSER, SYSCREATEDATE)
            SELECT 'INVUFIX000001', @P1, 'TIKET', CAST(DATEADD(DAY, -5, @NOW) AS date), 'Pembeli Uji', @EMAIL,
                   N'[{"desc":"Tiket (contoh)","qty":1,"price":100000,"amount":100000}]', 100000, 'SELESAI', 'seed-portal', @NOW;
    END
    IF @A2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM T_PAYMENT WHERE EXTREF = 'UFIXPAY02')
    BEGIN
        INSERT INTO T_PAYMENT
            (PAYNO, REFTYPE, REFID, EVENTID, SUBTOTAL, DISCOUNT, SERVICEFEE, TOTALPAID, PAIDAT, SOURCE, STATUS, EXTREF, SYSCREATEUSER, SYSCREATEDATE)
        SELECT 'PAYUFIX000002', 'TIKET', @A2, A.EVENTID,
               ISNULL((SELECT PRICE FROM T_TICKET_TYPE TT WHERE TT.TICKETTYPEID = A.TICKETTYPEID), 0), 0, 0,
               ISNULL((SELECT PRICE FROM T_TICKET_TYPE TT WHERE TT.TICKETTYPEID = A.TICKETTYPEID), 0),
               DATEADD(DAY, -10, @NOW), 'MANUAL', 'BERHASIL', 'UFIXPAY02', 'seed-portal', @NOW
        FROM T_ATTENDEE A WHERE A.ATTENDEEID = @A2;
    END
    PRINT 'Pembayaran & invoice dibuat.';
END

/* --------------------------------------------------------------------------
   8. PESAN INBOX dari operator
   -------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM T_MESSAGE WHERE IDEMPOTENCYKEY = 'UFIXMSG01')
BEGIN
    INSERT INTO T_MESSAGE
        (TITLE, BODY, PRIORITY, TARGETTYPE, TARGETJSON, CHANNEL, SENTAT, STATUS, RECIPIENTCOUNT, SENDERLOGIN, IDEMPOTENCYKEY, SYSCREATEUSER, SYSCREATEDATE)
    VALUES
        (N'Info event untuk Anda', N'Event yang Anda beli akan dimulai sesuai jadwal. Jangan lupa membawa QR tiket.', 'NORMAL', 'USER',
         N'[{"USERLOGIN":"user"}]', 'INBOX', DATEADD(DAY, -2, @NOW), 'TERKIRIM', 1, 'admin', 'UFIXMSG01', 'seed-portal', @NOW);
    DECLARE @MSG bigint = (SELECT MSGID FROM T_MESSAGE WHERE IDEMPOTENCYKEY = 'UFIXMSG01');
    DECLARE @UID int = (SELECT USERID FROM CPUSER WHERE USERLOGIN = 'user');
    IF @MSG IS NOT NULL AND @UID IS NOT NULL
        INSERT INTO T_MESSAGE_RECIPIENT (MSGID, USERID, USERLOGIN, READSTATUS)
        VALUES (@MSG, @UID, 'user', 'BELUM');
    PRINT 'Pesan inbox dibuat.';
END

/* --------------------------------------------------------------------------
   RINGKASAN
   -------------------------------------------------------------------------- */
SELECT 'tiket_aktif' AS jenis, COUNT(*) AS jumlah FROM T_ATTENDEE WHERE EMAIL = @EMAIL AND PAYSTATUS = 'LUNAS' AND ATTENDSTATUS <> 'HADIR'
UNION ALL SELECT 'tiket_menunggu', COUNT(*) FROM T_ATTENDEE WHERE EMAIL = @EMAIL AND PAYSTATUS = 'BELUM_BAYAR'
UNION ALL SELECT 'tiket_dipakai', COUNT(*) FROM T_ATTENDEE WHERE EMAIL = @EMAIL AND ATTENDSTATUS = 'HADIR'
UNION ALL SELECT 'pesanan_merch', COUNT(*) FROM T_MERCH_ORDER WHERE BUYEREMAIL = @EMAIL
UNION ALL SELECT 'pembayaran', COUNT(*) FROM T_PAYMENT WHERE REFID IN (SELECT ATTENDEEID FROM T_ATTENDEE WHERE EMAIL = @EMAIL);

GO

/* ---------------------------------------------------------------------------
   ROLLBACK 004 (hapus semua data contoh):
   DELETE FROM T_MESSAGE_RECIPIENT WHERE MSGID IN (SELECT MSGID FROM T_MESSAGE WHERE IDEMPOTENCYKEY = 'UFIXMSG01');
   DELETE FROM T_MESSAGE WHERE IDEMPOTENCYKEY = 'UFIXMSG01';
   DELETE FROM T_INVOICE WHERE INVNO = 'INVUFIX000001';
   DELETE FROM T_PAYMENT WHERE EXTREF IN ('UFIXPAY01','UFIXPAY02');
   DELETE FROM T_MERCH_ORDER_HISTORY WHERE ORDERID IN (SELECT ORDERID FROM T_MERCH_ORDER WHERE ORDERNO='MRH-UFIX-0001');
   DELETE FROM T_MERCH_ORDER_ITEM WHERE ORDERID IN (SELECT ORDERID FROM T_MERCH_ORDER WHERE ORDERNO='MRH-UFIX-0001');
   DELETE FROM T_MERCH_ORDER WHERE ORDERNO = 'MRH-UFIX-0001';
   DELETE FROM T_TICKET_REFUND WHERE TICKETID IN (SELECT ATTENDEEID FROM T_ATTENDEE WHERE EMAIL='user@tiketapp.test');
   DELETE FROM T_TICKET_ORDER WHERE ORDERCODE = 'UFIX-WAIT';
   DELETE FROM T_ATTENDEE WHERE EMAIL = 'user@tiketapp.test';
   ------------------------------------------------------------------------- */