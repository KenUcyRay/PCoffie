# Deploy Tiket APP ke Server

Dokumen ini menjelaskan cara kerja auto-deploy, cara Manual deploy, dan
bagaimana_URL publik_ obtained.

## Ringkasan

| Aspek | Nilai |
|---|---|
| Server | `mahora@192.168.0.50` (Ubuntu 26.04, WiFi LAN) |
| Lokasi kode | `/var/www/tiket-app` |
| Remote git | `git@github.com:amayones/ticket-app.git` (deploy key `~/.ssh/github_deploy`) |
| Pemicu auto-deploy | systemd timer `tiket-app-autodeploy.timer`, tiap 2 menit |
| Script deploy | `/var/www/tiket-app/deploy.sh` |
| Log deploy | `/var/log/tiket-app-deploy.log` |

## Auto-deploy (push ke `main` → server ikut berubah)

Auto-deploy berjalan **di sisi server**, bukan lewat GitHub Actions:

1. Tiap 2 menit `tiket-app-autodeploy.timer` memicu `tiket-app-autodeploy.service`.
2. Service menjalankan `deploy.sh`.
3. `deploy.sh` melakukan `git fetch origin main`, lalu membandingkan `HEAD` dengan
   `origin/main`:
   - **Sama** → keluar cepat, tidak ada build (log: `Tidak ada perubahan baru`).
   - **Beda** → `git reset --hard origin/main`, lalu:
     - `composer install --no-dev` (backend Lumen)
     - perbaiki izin `storage/`, `bootstrap/cache`, `.env`
     - `npm ci` + `npm run build` (frontend Next.js)
     - `systemctl restart tiket-app-next`
     - `systemctl reload apache2`
     - health check `/tiket-app/console/` dan endpoint login API

Jadi setelah `git push origin main`, perubahan aktif di server **maksimal ~2 menit**.

### Kenapa bukan GitHub Actions

GitHub Actions dengan runner `ubuntu-latest` dijalankan di cloud dan
**tidak bisa menjangkau `192.168.0.50`** karena alamat itu IP privat jaringan
rumah. Runner juga tidak punya akses ke API router/modem, dan tidak ada jalur
SSH yang bisa dibuka tanpa membuka port di router.

Opsi kalau nanti ingin status deploy terlihat di GitHub: pasang
**self-hosted runner** di server. Perlu diperhatikan, repository ini private,
jadi menit runner bisa ikut terpotong dari kuota Actions.

## Deploy manual

```bash
ssh mahora@192.168.0.50
bash /var/www/tiket-app/deploy.sh          # hanya jalan kalau ada commit baru
FORCE=1 bash /var/www/tiket-app/deploy.sh  # paksa build ulang walaupun sama
```

Status timer:

```bash
systemctl list-timers tiket-app-autodeploy.timer
journalctl -u tiket-app-autodeploy.service -n 30
tail -40 /var/log/tiket-app-deploy.log
```

## Service yang harus hidup

| Service | Peran | Auto-start |
|---|---|---|
| `docker.service` | menjalankan container SQL Server | `enabled` |
| container `sqlserver` | SQL Server 2025, database `ticket_db` | `--restart unless-stopped` |
| `apache2.service` | web server + PHP backend | `enabled` |
| `tiket-app-next.service` | Next.js control panel (port 3000) | `enabled` |
| `cloudflared-ticket.service` | URL publik sementara | `enabled` |
| `tiket-app-autodeploy.timer` | cek commit baru tiap 2 menit | `enabled` |

Cek cepat:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/tiket-app/console/
bash ~/tunnel-url.sh
```

## URL publik

Sekarang memakai **Cloudflare Quick Tunnel** (`cloudflared-ticket.service`),
karena server berada di balik double NAT sehingga port forwarding tidak
mungkin. Konsekuensinya: **URL berubah setiap server restart**.

```bash
bash ~/tunnel-url.sh
```

URL-nya juga tampil otomatis di halaman `http://192.168.0.50/tiket-app/`
(halaman placeholder membaca URL terbaru dari log `cloudflared`).

### Beralih ke URL tetap

Butuh subdomain sendiri (misal DuckDNS) yang DNS-nya dipegang Cloudflare:

1. Daftar subdomain di DuckDNS, misal `tiketku.duckdns.org`.
2. Tambah domain itu sebagai site di Cloudflare (akun gratis).
3. Ganti nameserver di DuckDNS dengan nameserver dari Cloudflare.
4. Buat token Cloudflare (izin `Cloudflare Tunnel: Edit` + `DNS: Edit`).
5. Ganti `cloudflared-ticket.service` menjadi tunnel permanen dengan
   `tunnel create` + `tunnel route dns`.

## Database

- SQL Server 2025 (`mcr.microsoft.com/mssql/server:2025-latest`) dalam container
  bernama `sqlserver`, port `1433`, data persisten di
  `/srv/apps/database/mssql-data-2025`.
- Database aplikasi: `ticket_db` (47 tabel).
- Login aplikasi: `tiketapp` (bukan `sa`), owner `ticket_db`.
- Kredensial ada di `/var/www/tiket-app/appservice/.env` (mode `640`,
  grup `www-data`). File ini **tidak pernah** masuk repo.

Backup:

```bash
docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P 'Mahora123!' -C -N \
  -Q "BACKUP DATABASE ticket_db TO DISK=N'/var/opt/mssql/backup/ticket_db.bak' WITH INIT"
```

Data SQL Server versi lama (2022) masih tersimpan di
`/srv/apps/database/mssql-data-LAMA` beserta container `sqlserver2022-lama`
(status restart `no`), jadi masih ada jalur rollback.

## Kalau ada masalah

| Gejala | Cause / solusi |
|---|---|
| `deploy.sh` berhenti di `GAGAL saat git fetch` | deploy key server belum terdaftar di repo GitHub (Settings → Deploy keys) |
| Halaman control panel 502 dari tunnel | `tiket-app-next` mati: `systemctl status tiket-app-next`, cek `/var/log/tiket-app-next.log` |
| API 500 | cek `tail -40 /var/log/apache2/tiket-app-error.log` dan `storage/logs/lumen-*.log` |
| Tunnel URL mati | `systemctl restart cloudflared-ticket`, lalu `bash ~/tunnel-url.sh` |
| `pcre.jit` error | sudah dimatikan lewat `/etc/php/8.5/mods-available/pcre.ini`, jangan dihapus |