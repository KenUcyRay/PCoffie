# Marketing Tools: Promo Code & Ad Campaign

## Ringkasan
- **Promo Code** (`mpromocode`): kode diskon PERSEN/NOMINAL dengan kuota,
  batas per pembeli, periode, dan cakupan (SEMUA/KATEGORI/EVENT).
- **Ad Campaign** (`mcampaign`): pengelolaan kampanye iklan — posisi slot,
  tarif per hari, pembayaran, tayang, dan statistik harian.
- Ukuran murah (tanpa loyalty/poin, tanpa lelang slot, tanpa penagihan rinci).

## Promo Code

### Struktur
- `T_PROMO`: kode (unik tanpa memandang kapital), jenis, nilai, maksimum
  (PERSEN saja), minimum pembelian, kuota (NULL = tanpa batas),
  batas per pembeli, periode mulai–selesai, cakupan, status YES/NO.
- `T_PROMO_SCOPE`: target cakupan (KATEGORI = kode kategori, EVENT = kode event).
- `T_PROMO_USAGE`: riwayat pemakaian (siapa/kapan/event/nominal/potongan),
  status DIPAKAI/DIBATALKAN (batal = kuota kembali).

### Alur & Aturan
1. Admin buat promo (DRAFT implisit = ISACTIVE YES, langsung bisa dipakai
   selama periode). Kode 4–20 karakter huruf besar/angka/strip.
2. Cakupan SEMUA = semua; KATEGORI/EVENT = pilih minimal satu target yang
   harus ada di master (kode disimpan).
3. Validasi pemakaian (`PromoEngine::check`): aktif → periode → minimum →
   cakupan → kuota → batas per pembeli.
4. Hitung: PERSEN = persen × nominal, dibatasi maksimum (kalau diisi);
   NOMINAL = nilai, dibatasi nominal (tidak minus).
5. `record()`: INSERT DIPAKAI atomik (cek ulang dalam transaksi).
   `revert()`: DIPAKAI → DIBATALKAN (kuota kembali, tanpa hapus baris).
6. Batas per pembeli dihitung per event (bukan global).
7. Promo yang sudah pernah dipakai: jenis/nilai/maksimum/minimum/mulai/
   cakupan/target TERKUNCI; hanya deskripsi/kuota(≥ terpakai)/berakhir/status.
8. Promo yang sudah pernah dipakai TIDAK BOLEH dihapus (nonaktifkan saja).
9. Status tampilan: NONAKTIF / AKAN_DATANG / KEDALUWARSA / KUOTA_HABIS /
   BERLAKU (dihitung, tanpa kolom).
10. Uji kode: validasi + potongan TANPA mencatat pemakaian (simulasi murni).
11. Email pembeli di riwayat disamarkan sebagian.

### Contoh Data
- `BEBASADMIN` (NOMINAL 5000, min 50000, SEMUA, tanpa batas waktu/kuota).
- `HEMAT10` (PERSEN 10% max 25000, min 100000, SEMUA, kuota 500).
- `HABIS15` (PERSEN 15%, kuota 2, pemakaian 2 = contoh KUOTA_HABIS).
- `KEDALU20` (periode lampau = contoh KEDALUWARSA).
- `KONSER25` (PERSEN 25% max 50000, cakupan KATEGORI KONSER).
- `SEMARANG5` (NOMINAL 5000, cakupan EVENT SMG-2026-001).

## Ad Campaign

### Struktur
- `T_AD_POSITION`: slot tayang (kode/nama/dimensi/tarif-per-hari/kapasitas =
  kampanye bersamaan maks/urutan/status). 3 seed: HOME_TOP (kap 1),
  HOME_SECOND (kap 2), EVENT_LIST_TOP (kap 3).
- `T_AD_CAMPAIGN`: kampanye (kode AD-XXXX otomatis, judul, pengiklan, kontak,
  banner, tujuan EVENT/URL, posisi, periode, tarif-salinan, jumlah hari,
  total, status, waktu bayar, alasan batal). Tarif disalin saat dibuat
  (kebal ubah tarif posisi).
- `T_AD_STAT_DAILY`: tayang+klik per kampanye per tanggal (unik, agregat
  atomik tambah-angka).

### Alur & Aturan
1. DRAFT → AJUKAN → MENUNGGU_BAYAR → (catat bayar) → AKTIF ⇄ DIJEDA
   (JEDA/LANJUT) → selesai alami. Batal kapan saja dengan alasan (final).
2. Aktivasi HANYA via pencatatan pembayaran (transaksi: kunci baris, wajib
   banner, cek kapasitas lalu set PAIDAT).
3. Kapasitas: penghuni = AKTIF+DIJEDA yang periodenya bertabrakan; tolak
   bayar/lanjut bila penuh. DRAFT/MENUNGGU_BAYAR tidak menempati slot.
4. Setelah AKTIF: judul/pengiklan/kontak/tujuan/banner boleh diubah; tanggal
   & posisi TERKUNCI. DIBATALKAN read-only.
5. Banner: JPG/PNG/WEBP maks 2MB ke `uploads/ads/`, nama aman
   `ad-<id>-<waktu>.<ext>`; peringatan bila di bawah 1200×300; banner lama
   dihapus. Fallback placeholder bila belum ada.
6. Tayang publik (`AdServe::forPosition`, TANPA auth): kampanye AKTIF dalam
   periode, rotasi tanggal+ID (stabil sehari), dibatasi kapasitas.
7. Tayang dicatat agregat ringan; klik menaikkan tayang+klik bersama.
8. Pendapatan = total kampanye yang dibayar bulan berjalan (bukan penagihan).

### Contoh Data
- `AD-0001` AKTIF (HOME_TOP, dalam periode) + 3 hari statistik.
- `AD-0002` DRAFT, `AD-0003` MENUNGGU_BAYAR, `AD-0004` DIJEDA,
  `AD-0005` DIBATALKAN.

## File Terkait
- DB: `appservice/database/t_promo.sql`, `t_promo_scope.sql`,
  `t_promo_usage.sql`, `t_ad_position.sql`, `t_ad_campaign.sql`,
  `t_ad_stat_daily.sql`.
- Backend: `PromoEngine.php` (dipakai module lain), `Mmpromocode.php`,
  `AdServe.php` (dipakai halaman publik), `Mmcampaign.php`.
- Frontend: `app/mpromocode/`, `app/mcampaign/`.
- SEGMENT: `home/mpromocode/mpromocode`, `home/mcampaign/mcampaign`.
