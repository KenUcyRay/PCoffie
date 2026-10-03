/* =============================================================================
   PORTAL PEMBELI - migration 001
   Tabel T_TICKET_ORDER : header satu pesanan tiket dari portal pembeli.

   Satu baris T_ATTENDEE = satu tiket (SUDAITUNYA begitu, tidak diubah).
   T_ATTENDEE.ORDERID / ORDERCODE (sudah ada) dipakai sebagai penanda
   ke pesanan mana tiket itu milik.

   DESAIN PEMBAYARAN (kompromi yang dipakai):
     Pembayaran TETAP dicatat PER TIKET lewat PaymentService (REFTYPE='TIKET',
     REFID=ATTENDEEID) supaya PaymentService, InvoiceService, LedgerService,
     T_PAYOUT, refund, dan semua laporan Finance yang sudah ada tidak
     tersentuh sama sekali.
     Artinya: 1 pesanan 3 tiket -> 3 baris T_PAYMENT + 3 invoice.
     Portal menampilkannya sebagai satu pesanan dengan total gabungan.

   Idempotent  : aman dijalankan berkali-kali (IF NOT EXISTS).
   Rollback    : lihat blok ROLLBACK di bawah (tidak menghapus data T_ATTENDEE).
   ========================================================================== */

SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

IF OBJECT_ID('dbo.T_TICKET_ORDER', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.T_TICKET_ORDER
    (
        ORDERID          int IDENTITY(1,1) NOT NULL,
        ORDERCODE        varchar(30)   NOT NULL,
        EVENTID          int           NOT NULL,
        TICKETTYPEID     int           NOT NULL,
        QTY              int           NOT NULL,
        BUYERUSER        varchar(50)   NOT NULL,
        BUYERNAME        varchar(100)  NULL,
        BUYEREMAIL       varchar(100)  NULL,
        BUYERPHONE       varchar(50)   NULL,
        PROMOCODE        varchar(50)   NULL,
        SUBTOTAL         numeric(18,2) NOT NULL CONSTRAINT DF_TICKETORDER_SUBTOTAL DEFAULT (0),
        DISCOUNT         numeric(18,2) NOT NULL CONSTRAINT DF_TICKETORDER_DISCOUNT DEFAULT (0),
        SERVICEFEE       numeric(18,2) NOT NULL CONSTRAINT DF_TICKETORDER_SERVICEFEE DEFAULT (0),
        TOTAL            numeric(18,2) NOT NULL CONSTRAINT DF_TICKETORDER_TOTAL    DEFAULT (0),
        STATUS           varchar(20)   NOT NULL CONSTRAINT DF_TICKETORDER_STATUS   DEFAULT 'MENUNGGU',
        PAYDEADLINE      datetime2     NULL,
        CLOSEDAT         datetime2     NULL,
        IDEMPOTENCYKEY   varchar(64)   NULL,
        SYSCREATEUSER    varchar(50)   NULL,
        SYSCREATEDATE    datetime2     NULL CONSTRAINT DF_TICKETORDER_CREATED DEFAULT (GETDATE()),
        SYSUPDATEUSER    varchar(50)   NULL,
        SYSUPDATEDATE    datetime2     NULL,
        CONSTRAINT PK_TICKET_ORDER PRIMARY KEY CLUSTERED (ORDERID),
        CONSTRAINT UQ_TICKET_ORDER_CODE UNIQUE (ORDERCODE)
    );

    PRINT 'T_TICKET_ORDER dibuat.';
END
ELSE
    PRINT 'T_TICKET_ORDER sudah ada, dilewati.';
GO

/* Index dibuat terpisah dari CREATE TABLE: filtered index butuh
   SET QUOTED_IDENTIFIER ON, sedangkan blok CREATE TABLE jalan di batch
   sqlcmd yang tidak bisa memakai GO di tengahnya. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TICKET_ORDER_BUYER' AND object_id = OBJECT_ID('dbo.T_TICKET_ORDER'))
    CREATE INDEX IX_TICKET_ORDER_BUYER ON dbo.T_TICKET_ORDER (BUYERUSER, STATUS);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TICKET_ORDER_STATUS' AND object_id = OBJECT_ID('dbo.T_TICKET_ORDER'))
    CREATE INDEX IX_TICKET_ORDER_STATUS ON dbo.T_TICKET_ORDER (STATUS, PAYDEADLINE);

/* Index biasa (BUKAN filtered): filtered index memaksa SET QUOTED_IDENTIFIER ON
   pada semua INSERT, sedangkan koneksi PDO dari Lumen tidakDijamin menyetelnya. */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TICKET_ORDER_IDEM' AND object_id = OBJECT_ID('dbo.T_TICKET_ORDER'))
    DROP INDEX IX_TICKET_ORDER_IDEM ON dbo.T_TICKET_ORDER;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TICKET_ORDER_IDEM' AND object_id = OBJECT_ID('dbo.T_TICKET_ORDER'))
    CREATE INDEX IX_TICKET_ORDER_IDEM ON dbo.T_TICKET_ORDER (IDEMPOTENCYKEY);

PRINT 'Index T_TICKET_ORDER siap.';
GO

/* ---------------------------------------------------------------------------
   ROLLBACK 001 (JALANKAN MANUAL HANYA KALAU BENAR-BENAR MAU membatalkan)
   Data T_ATTENDEE milik pesanan lama TIDAK dihapus; hanya kolom ORDERID/
   ORDERCODE yang dinolkan supaya tiket tetap bisa dipindai.
   ---------------------------------------------------------------------------
   UPDATE T_ATTENDEE SET ORDERID = NULL, ORDERCODE = NULL WHERE ORDERID IS NOT NULL;
   DROP TABLE dbo.T_TICKET_ORDER;
   ------------------------------------------------------------------------- */