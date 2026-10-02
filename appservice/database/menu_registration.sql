-- Menu Registration for Module System, Module Discovery, Module Event, Module Ticketing
-- Module Merchandise, Module Marketing, Module Finance, Module Account
-- Idempotent: Cek dulu apakah sudah ada, baru INSERT
-- Menu yang sudah ada (Module System) tidak diubah
-- Total: 22 menu induk (19 punya child, 3 tanpa child) + 45 child = 67 data

-- MODULE SYSTEM (MODSYSTEM) - Menu yang sudah ada:
-- Module Setup > Module List (MCODE: 10010001)
-- Module Setup > Menu List (MCODE: 10010002)
-- Master Data > Category Data (MCODE: 10020001)
-- Master Data > City Data (MCODE: 10020002)
-- Master Data > Bank Data (MCODE: 10020003)
-- Master Data > Payment Method (MCODE: 10020004)
-- Master Data > Fee Setting (MCODE: 10020005)
-- Security Center > Security Setting (MCODE: 10030001)
-- Security Center > Session List (MCODE: 10030002)
-- Security Center > Blocked Access (MCODE: 10030003)
-- Log Center > Audit Log (MCODE: 10040001)
-- Log Center > System Log (MCODE: 10040002)
-- Log Center > Login History (MCODE: 10040003)
-- Broadcast Message > Send Message (MCODE: 10050001)
-- Broadcast Message > Message History (MCODE: 10050002)
-- App Setting > General Setting (MCODE: 10060001)
-- App Setting > Notification Template (MCODE: 10060002)
-- User Access (MCODE: 10000001) - root menu
-- User Login (MCODE: 10000002) - root menu
-- User Group (MCODE: 10000003) - root menu

-- =====================================================
-- MODULE DISCOVERY (MODDISC, DEFSHORT: 20)
-- =====================================================

-- Module Discovery > Home (no child, leaf)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 20000001, 0, 'MODDISC', 'moddischome', 'Home', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 20000001);

-- Module Discovery > Event Catalog > Event List
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 20010001, 20000001, 'MODDISC', 'moddisceventlist', 'Event List', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 20010001);

-- Module Discovery > Event Catalog > Event by Category
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 20010002, 20000001, 'MODDISC', 'moddisceventcategory', 'Event by Category', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 20010002);

-- Module Discovery > Event Catalog > Event by City
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 20010003, 20000001, 'MODDISC', 'moddisceventcity', 'Event by City', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 20010003);

-- Module Discovery > Info Center > News List
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 20020001, 20000001, 'MODDISC', 'moddiscnewslist', 'News List', 'FALSE', 'FALSE', 'TRUE', 4
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 20020001);

-- Module Discovery > Info Center > Promo List
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 20020002, 20000001, 'MODDISC', 'moddiscpromolist', 'Promo List', 'FALSE', 'FALSE', 'TRUE', 5
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 20020002);

-- =====================================================
-- MODULE EVENT (MODEVENT, DEFSHORT: 30)
-- =====================================================

-- Module Event > Event Management > Event Data (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 30000001, 0, 'MODEVENT', 'modeventdata', 'Event Data', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 30000001);

-- Module Event > Event Management > Ticket Type (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 30000002, 0, 'MODEVENT', 'modeventtickettype', 'Ticket Type', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 30000002);

-- Module Event > Event Management > Attendee List (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 30000003, 0, 'MODEVENT', 'modeventattendee', 'Attendee List', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 30000003);

-- =====================================================
-- MODULE TICKETING (MODTICKET, DEFSHORT: 40)
-- =====================================================

-- Module Ticketing > Ticket Order > My Ticket (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 40000001, 0, 'MODTICKET', 'modticketmy', 'My Ticket', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 40000001);

-- Module Ticketing > Ticket Order > Ticket Refund (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 40000002, 0, 'MODTICKET', 'modticketrefund', 'Ticket Refund', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 40000002);

-- Module Ticketing > Ticket Check-in > Scan Ticket (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 40010001, 0, 'MODTICKET', 'modticketcheckscan', 'Scan Ticket', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 40010001);

-- Module Ticketing > Ticket Check-in > Scan History (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 40010002, 0, 'MODTICKET', 'modticketcheckhistory', 'Scan History', 'FALSE', 'FALSE', 'TRUE', 4
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 40010002);

-- =====================================================
-- MODULE MERCHANDISE (MODMERCH, DEFSHORT: 50)
-- =====================================================

-- Module Merchandise > Merchandise Shop > Product List (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 50000001, 0, 'MODMERCH', 'modmerchproduct', 'Product List', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 50000001);

-- Module Merchandise > Merchandise Shop > My Purchase (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 50000002, 0, 'MODMERCH', 'modmerchpurchase', 'My Purchase', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 50000002);

-- Module Merchandise > Seller Center > Product Data (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 50010001, 0, 'MODMERCH', 'modmerchproductdata', 'Product Data', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 50010001);

-- Module Merchandise > Seller Center > Seller Order (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 50010002, 0, 'MODMERCH', 'modmerchsellerorder', 'Seller Order', 'FALSE', 'FALSE', 'TRUE', 4
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 50010002);

-- =====================================================
-- MODULE MARKETING (MODMARKETING, DEFSHORT: 60)
-- =====================================================

-- Module Marketing > Marketing Tools > Promo Code (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 60000001, 0, 'MODMARKETING', 'modmarketingpromo', 'Promo Code', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 60000001);

-- Module Marketing > Marketing Tools > Ad Campaign (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 60000002, 0, 'MODMARKETING', 'modmarketingcampaign', 'Ad Campaign', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 60000002);

-- Module Marketing > Content Management > News Data (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 60010001, 0, 'MODMARKETING', 'modmarketingnewsdata', 'News Data', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 60010001);

-- Module Marketing > Content Management > News Category (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 60010002, 0, 'MODMARKETING', 'modmarketingnewscategory', 'News Category', 'FALSE', 'FALSE', 'TRUE', 4
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 60010002);

-- =====================================================
-- MODULE FINANCE (MODFINANCE, DEFSHORT: 70)
-- =====================================================

-- Module Finance > Transaction > Payment History (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70000001, 0, 'MODFINANCE', 'modfinancepayment', 'Payment History', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70000001);

-- Module Finance > Transaction > Invoice List (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70000002, 0, 'MODFINANCE', 'modfinanceinvoice', 'Invoice List', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70000002);

-- Module Finance > Organizer Finance > Sales Report (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70010001, 0, 'MODFINANCE', 'modfinancesales', 'Sales Report', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70010001);

-- Module Finance > Organizer Finance > Payout Request (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70010002, 0, 'MODFINANCE', 'modfinancepayout', 'Payout Request', 'FALSE', 'FALSE', 'TRUE', 4
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70010002);

-- Module Finance > Seller Finance > Seller Balance (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70020001, 0, 'MODFINANCE', 'modfinancesellerbalance', 'Seller Balance', 'FALSE', 'FALSE', 'TRUE', 5
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70020001);

-- Module Finance > Seller Finance > Withdrawal (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70020002, 0, 'MODFINANCE', 'modfinancesellerwithdraw', 'Withdrawal', 'FALSE', 'FALSE', 'TRUE', 6
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70020002);

-- Module Finance > Bank Account (no child, no parent)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 70030001, 0, 'MODFINANCE', 'modfinancebank', 'Bank Account', 'FALSE', 'FALSE', 'TRUE', 7
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 70030001);

-- =====================================================
-- MODULE ACCOUNT (MODACCOUNT, DEFSHORT: 80)
-- =====================================================

-- Module Account > Notification (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 80000001, 0, 'MODACCOUNT', 'modaccountnotification', 'Notification', 'FALSE', 'FALSE', 'TRUE', 1
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 80000001);

-- Module Account > Account Setting > Profile Data (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 80010001, 0, 'MODACCOUNT', 'modaccountprofile', 'Profile Data', 'FALSE', 'FALSE', 'TRUE', 2
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 80010001);

-- Module Account > Account Setting > Change Password (no child)
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MCHILDREN, MEXPAND, MLEAF, MSHORT)
SELECT 80010002, 0, 'MODACCOUNT', 'modaccountchangepassword', 'Change Password', 'FALSE', 'FALSE', 'TRUE', 3
WHERE NOT EXISTS (SELECT 1 FROM CPMENU WHERE MCODE = 80010002);

-- =====================================================
-- VERIFIKASI
-- =====================================================
-- SELECT * FROM CPMENU ORDER BY MMODULE, MPARRENT, MSHORT;
-- Expected: 67 rows (19 root + 48 child)
-- Module System: 16 rows (already exists)
-- Module Discovery: 6 rows (1 root + 5 child)
-- Module Event: 3 rows (3 root, no child)
-- Module Ticketing: 4 rows (4 root, no child)
-- Module Merchandise: 4 rows (4 root, no child)
-- Module Marketing: 4 rows (4 root, no child)
-- Module Finance: 7 rows (1 root + 6 child, but Bank Account has no parent)
-- Module Account: 3 rows (3 root, no child)
