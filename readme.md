# app-core — Cara menambah menu (ala langit_v2)

app-core meniru pola `langit_v2` + `lumen_backend`, tetapi ditulis dengan
Next.js (frontend) + Lumen `appservice` (backend).

## 0. Instalasi

### Yang perlu disiapkan

| Kebutuhan | Versi / catatan |
|---|---|
| Node.js | 18+ (sudah dipakai di sini v24) |
| PHP | 8.1+ (Lumen 10) + ekstensi `pdo_sqlsrv` |
| Composer | v2 |
| SQL Server | 2012+ (pakai `OFFSET/FETCH`, `MERGE`, `dbo.app_encrypt`) |
| Web server | Apache/Lightttpd yang menunjuk ke `appservice/public` |

> `appservice/public` harus dilayani pada path `/app-core/appservice/public`
> supaya cocok dengan `basePath: '/app-core'` di `next.config.js`.

### 1. Frontend

```bash
npm install
```

File env frontend **sudah ikut di-commit** (tidak di-gitignore):

| File | Isi |
|---|---|
| `.env.development` | `NEXT_PUBLIC_API_BASE=http://localhost:83/app-core/appservice/public/api/core` |
| `.env.production` | `NEXT_PUBLIC_API_BASE=/app-core/appservice/public/api/core` |

Kalau dua file itu hilang, buat ulang sesuai tabel di atas — dev memakai alamat
absolut (backend di port 83), produksi memakai path relatif. Ganti host/portnya
kalau backendmu tidak di `localhost:83`.

### 2. Backend (`appservice`)

`appservice/vendor` **di-gitignore**, jadi wajib `composer install`:

```bash
cd appservice
composer install
```

`appservice/.env` **juga di-gitignore** (berisi `APP_KEY`, `JWT_SECRET`, dan
password database) — jadi harus dibuat sendiri:

```bash
cp appservice/.env.example appservice/.env
```

Lalu isi `appservice/.env`:

```ini
APP_KEY=base64:<generate>
APP_DEBUG=true
APP_URL=http://localhost:83/app-core/appservice/public

DB_CONNECTION=sqlsrv
DB_HOST=<host>
DB_PORT=1433
DB_DATABASE=nextlumen_db
DB_USERNAME=<user>
DB_PASSWORD=<password>

JWT_ALGO=HS256
JWT_SECRET=<random-panjang>
JWT_TTL=480
JWT_REFRESH_TTL=20160
```

> **Penting:** `appservice/.env.example` di repo **belum memuat `JWT_ALGO`,
> `JWT_SECRET`, `JWT_TTL`, dan `JWT_REFRESH_TTL`**. Tambahkan manual — tanpa
> `JWT_SECRET` proses login akan gagal.

Generate `APP_KEY` dan `JWT_SECRET`:

```bash
php -r "echo 'base64:'.base64_encode(random_bytes(32)), PHP_EOL;"
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

### 3. Database

Jalankan `appservice/database/nextlumen_schema.sql` di SQL Server. File itu
membuat 4 tabel inti: `CPUSER`, `CPMATRIX`, `CPMENU`, `CPMENUACCESS`.

> **Penting:** file tersebut **belum memuat stored procedure dan function**.
> `Mlogin.php` memanggil `EXEC SP_USERLOGIN` dan `EXEC SP_USER_RELOAD`, dan
> password memakai `dbo.app_encrypt(...)`. Jadi dari database yang sudah jalan
> (atau dari proyek referensi) Anda masih perlu membuat/memuat sendiri:
>
> - `dbo.app_encrypt` / `dbo.app_decrypt`
> - `SP_USERLOGIN` (login + kirim `dtmenu_header`, `dtmenu`, `profile`)
> - `SP_USER_RELOAD` (pembacaan ulang sesi)
>
> Tanpa itu halaman login akan selalu gagal meskipun halamannya terbuka.

### 4. Jalankan

```bash
npm run dev          # http://localhost:3000/app-core/
```

Buka `http://localhost:3000/app-core/login/`, lalu **login ulang** setelah
menambah modul/menu (menu dikirim dari `SP_USER_RELOAD` saat sesi dibuat).

Produksi:

```bash
npm run build && npm start
```

> Jangan `npm run build` sambil `npm run dev` masih jalan — keduanya berbagi
> folder `.next` dan build akan menimpanya sehingga dev server error
> (`Cannot find module './xxx.js'`).

### Ringkasan file yang di-gitignore

| Path | Gitignore | Setelah clone |
|---|---|---|
| `node_modules/` | ya | `npm install` |
| `.next/` | ya | dibuat otomatis oleh `next dev` |
| `appservice/vendor` | ya | `composer install` |
| `appservice/.env` | ya | `cp .env.example .env` + isi manual |
| `.env.development`, `.env.production` | **tidak** | sudah ikut |

---

## 1. Konsep (sama seperti langit_v2)

- Modul aplikasi didaftar di **`CPMATRIX`** (`DEFMODULE='MODULE MENU'`).
- Menu didaftar di **`CPMENU`** (`MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MSHORT`).
- Hak akses dibuka di **`CPMENUACCESS`** (`RGROUP, RMODULE, RMENUID`).
- Sidebar (menu tree) + tab dibangun dari `auth/me` (`dtmenu_header` + `dtmenu`),
  diurutkan `MMODULE_SHORT/MSHORT`, sama seperti `Cmode_standard.js`.
- Frontend membuka menu **berdasarkan konvensi nama** (tiruan
  `resolveStandardLeafClass`): `MCONTROL` -> folder `app/<mcontrol>/` ->
  file `<mcontrol>.tsx` (mainpage, default export), `C<mcontrol>.ts`
  (controller), `GRID<mcontrol>.tsx` (grid + store + proxy), `FRM<mcontrol>.tsx`
  (form), `api.ts` (proxy).
- Menu yang **sudah punya akses tetapi foldernya belum ada** tetap muncul di
  sidebar; saat diklik tampil pesan `menu Control: <mcontrol> tidak ditemukan`
  (persis perilaku `resolveStandardLeafClass` langit_v2).

## 2. Struktur file per menu (pola MVC ala ExtJS)

```
app/<mcontrol>/
  <mcontrol>.tsx     mainpage   — TIPIS: layout + toolbar + nyambungin controller
  C<mcontrol>.ts     controller — HANYA handler (init/renderpage/btrefresh_click/…)
  GRID<mcontrol>.tsx grid       — state + paging + pencarian + action column
  FRM<mcontrol>.tsx  form       — form modal (atau panel, tergantung kebutuhan)
  api.ts             proxy      — pemanggilan backend
```

**Aturan mainpage (paling penting).** Mainpage adalah padanan `TDK.mpph.mpph`
ExtJS: isinya hanya `controller`, `dockedItems` (toolbar), dan `items` (grid).
Mainpage **TIDAK BOLEH** punya `useState`, `async function`, atau panggilan API.
Semua logic/data ada di GRID dan FRM.

```tsx
// app/<mcontrol>/<mcontrol>.tsx — seluruh isi mainpage
const grid = useRef<GridApi>(null);
useEffect(() => { controller_init(); }, []);
return (
  <div className="card">
    <div className="toolbar">
      <Btn pid="btrefresh" icon="refresh" onClick={() => btrefresh_click(grid.current)}>Refresh</Btn>
      <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Create</Btn>
    </div>
    <GRID<mcontrol> ref={grid} />
  </div>
);
```

Toolbar memakai `pid` (`btrefresh`, `btnew`, `btsave`, dst) sebagai penanda
ala ExtJS, lalu `onClick` meneruskannya ke **controller**, bukan langsung ke
aksi. Controller meneruskannya ke grid lewat reference (di React = `ref` +
`useImperativeHandle`):

```ts
// C<mcontrol>.ts
import type { GridApi } from './GRID<mcontrol>';
export function btrefresh_click(grid: GridApi | null): void { grid?.refresh(); }
export function btnew_click(grid: GridApi | null): void { grid?.create(); }
```

GRID men-*expose* API-nya, dan di situ semua logic-nya tinggal:

```tsx
// GRID<mcontrol>.tsx
export type GridApi = { refresh: () => void; create: () => void; edit: (r: Row) => void; remove: (r: Row) => void };
useImperativeHandle(ref, () => ({ refresh, create, edit, remove }), [...]);
```

Kalau satu menu punya dua panel (mis. `cp_usergroup`: daftar group + panel hak
akses), mainpage tetap tipis — dua `ref` saling diteruskan, persis seperti dua
`reference` di ExtJS:

```tsx
const grid = useRef<GridApi>(null);
const akses = useRef<AksesApi>(null);
<GRIDcp_usergroup ref={grid} aksesRef={akses} />
<FRMcp_usergroup ref={akses} />
```

## 3. Menambah modul + menu (di database)

Contoh menambah modul `msupplier`, menu `msupplier`:

```sql
-- 1) modul (CPMATRIX DEFMODULE='MODULE MENU')
INSERT INTO CPMATRIX (DEFMODULE, DEFCODE, DEFNAME, DEFSHORT)
VALUES ('MODULE MENU', 'MSUPPLIER', 'Master Supplier', 30);

-- 2) menu (CPMENU). MCONTROL = nama folder di app/ (huruf kecil).
INSERT INTO CPMENU (MCODE, MPARRENT, MMODULE, MCONTROL, MNAME, MEXPAND, MSHORT)
VALUES (80000001, 0, 'MSUPPLIER', 'msupplier', 'Supplier', 'TRUE', 1);

-- 3) akses (CPMENUACCESS). RGROUP = CPUSER.USERGROUP.
INSERT INTO CPMENUACCESS (RGROUP, RMODULE, RMENUID)
VALUES ('ADMIN', 'MSUPPLIER', 80000001);
```

Setelah langkah ini, **menu langsung muncul di sidebar** (setelah login ulang /
`auth/me` terbaru) — walaupun folder `app/msupplier/` belum dibuat. Saat diklik,
aplikasi menampilkan pesan `menu Control: msupplier tidak ditemukan` sampai
halamannya dibuat (langkah 4).

### Constraint yang wajib dijaga

| Aturan | Kenapa |
|---|---|
| `MCODE` dan `CPMENUACCESS.RMENUID` **harus angka** (`NUMERIC(18,0)`) | keduanya yang dipakai join ke akses; `MENUID` (IDENTITY) bukan yang dipakai |
| `RMODULE` **wajib sama** dengan `CPMENU.MMODULE` untuk `MCODE` itu | `update_akses_group` (`Mcpusergroup.php`) MERGE match on `(RGROUP, RMODULE, RMENUID)` — kalau beda, checkbox di halaman User Group tidak nyambung dan muncul data dobel |
| Group user **bukan tabel terpisah** | group = baris `CPMATRIX` dengan `DEFMODULE='GROUP_USERLOGIN'`; `CPUSER.USERGROUP` = `DEFCODE` itu, dan itulah yang mengisi `CPMENUACCESS.RGROUP` |
| Kode group maks 20 karakter | `CPMENUACCESS.RGROUP VARCHAR(20)` (lebih kecil dari `CPUSER.USERGROUP VARCHAR(25)`); UI create group mewajibkan `/^[A-Z_-]+$/` |
| `MPARRENT = 0` untuk menu root | tree dibangun dari `MPARRENT` (`lib/menu.ts`) |
| `DEFSHORT` = urutan module | urutan sidebar dari `DEFSHORT`, urutan isi module dari `MSHORT`; nama yang tampil di sidebar dari `CPMENU.MNAME` |

**Menu tree tidak diambil dari query langsung ke `CPMENU`.** `Mlogin::reload`
memanggil stored procedure `EXEC SP_USER_RELOAD ?` (`appservice/app/Models/Mlogin.php`),
dan SP itu berada di database, bukan di repo ini. Karena itu setelah INSERT
wajib refresh sesi. Kalau menu tidak muncul, yang perlu dicurigai adalah filter
di SP-nya — bukan SQL yang dijalankan.

## 4. Membuat halaman menu (di frontend)

Copy folder template lalu rename (contoh `msupplier`):

```
templates/menu/            ->  app/msupplier/
  mod.tsx                 ->      msupplier.tsx   (mainpage, default export)
  Cmod.ts                 ->      Cmsupplier.ts   (controller)
  GRIDmod.tsx             ->      GRIDmsupplier.tsx (grid)
  FRMmod.tsx              ->      FRMmsupplier.tsx  (form)
  api.ts                  ->      api.ts (ganti SEGMENT + method)
```

Aturan penamaan (wajib, agar resolver `app/[mcontrol]/page.tsx` menemukannya):

- Nama folder = `MCONTROL` (huruf kecil, mis. `msupplier`).
- Mainpage = `<mcontrol>.tsx` dengan **default export** (tanpa `<Shell>`,
  karena Shell sudah dipasang oleh `MenuHost`).
- Controller = `C<mcontrol>.ts` berisi `init/renderpage/btrefresh_click/btnew_click`.
- Grid = `GRID<mcontrol>.tsx`, Form = `FRM<mcontrol>.tsx`.
- `api.ts` memakai `apiPost('home/<model>/<model>', { method, vdata, vheader })`.

Halaman yang **tidak butuh data** cukup 1 file: `<mcontrol>.tsx` (mainpage).
`C*`, `GRID*`, `FRM*`, dan model backend bersifat opsional.

Contoh yang sudah jadi: `app/cp_usersetting/`, `app/cp_userlogin/`, `app/cp_usergroup/`.

## 5. Membuat endpoint backend (di appservice)

Tambahkan Model `M<model>.php` di `appservice/app/Models/`
(padanan `Mlogin/Mcpuser/Mcpusergroup` lumen_backend), mis. `Mmsupplier.php`
dengan method `read_data/process_create/process_update/process_delete` yang
mengembalikan `{ success:'true', Rows, TotalRows, message }` dan menerima
`limit/offset/q` untuk paging (pageSize baku 25).

Routing generik `POST api/core/home/{A}/{B}` (`C_home@general`) otomatis
meneruskannya ke `App\Models\M{A}::<method>` — tidak perlu menambah route baru.

### Di mana model ditentukan

`MCONTROL` (nama file frontend) dan nama model backend adalah **dua hal terpisah**
— tidak ada kaitan otomatis. Penentu model ada di `SEGMENT` pada `api.ts`:

```
api.ts        apiPost('home/cpuser/cpuser', {...})
lib/api.ts    POST {API_BASE}/home/cpuser/cpuser
web.php:25    $router->post('/home/{A}/{B}', 'C_home@general')   -> $A='cpuser'
C_home.php:79 $modelClass = "\App\Models\" . ucfirst('M' . $A)     -> Mcpuser
C_home.php:88 $method = ($A !== $B) ? 'read' : $payload['method'] -> read_data
C_home.php:98 Mcpuser::read_data($payload)
```

Contoh nyata di project ini: `MCONTROL = cp_usersetting` memanggil model
`Mcpuser`, bukan `Mcpusersetting`.

Tiga aturan untuk `SEGMENT`:

1. `{A}` **harus sama dengan `{B}`**. Kalau beda, `C_home.php:88` memaksa method
   jadi `read`, jadi `process_create` dsb. tidak akan jalan.
2. `{A}` **lowercase, tanpa `-` / `.` / `/`**. `ucfirst('M'.$A)` masuk ke PSR-4
   autoloader, jadi nama file yang dicari = `M` + `ucfirst({A})`.
3. Route-nya hanya satu segmen (`home/{A}/{B}`), tidak bisa `home/a/b/c`.

`C_home@general` juga menyuntikkan `$payload['VUSERLOGIN']` dari JWT sebelum
memanggil model, jadi di `M<model>.php` Anda bisa baca `$param['VUSERLOGIN']`.

## 6. Mode layout

Hanya ada dua mode (seperti langit_v2): `mode_desktop` dan `mode_standard`,
disimpan di `CPUSER.GROUPMODEL` dan diganti lewat tombol Mode Layout
(`change_layout` di `Mcpuser.php`).

## 7. Sidebar

Sidebar ada di `components/Sidebar.tsx`, dipakai oleh `StandardShell`
(mode_standard). **Struktur menu dan route tidak diubah** — menunya tetap
dibangun dari `auth/me` → `dtmenu` lewat `lib/menu.ts::buildModuleTree`, jadi
menambah menu lewat SQL tetap langsung otomatis muncul di sidebar.

Isi komponen:

| Bagian | Detail |
|---|---|
| Header (64px) | logo 40×40 gradasi, nama app, tombol toggle **di dalam sidebar** (ikon `panel-left`) |
| Grup | rekursif: module (level 0) → grup menu (level 1) → halaman (level 2) |
| Indentasi | anak menu `padding-left: 20px` + garis pemandu `border-left` putih 9% |
| Animasi grup | `grid-template-rows: 0fr → 1fr`, chevron berputar 180° |
| Tooltip | hanya saat collapsed, muncul di hover/fokus |
| Footer | kartu profil (avatar 36px + nama + user login + chevron) → popup User Profile / Logout |
| Mobile `<768px` | drawer slide-out 280px (max 86vw) + overlay gelap, selalu mode penuh |

Breakpoint 768px harus sama antara `useIsNarrow(768)` di `Sidebar.tsx` dan
`@media (max-width: 768px)` di `app/layout.tsx`.

Shortcut: `Ctrl+B` / `Cmd+B` toggle sidebar, `Esc` menutup drawer + popup.
Pilihan collapsed disimpan di `localStorage` (`appcore::sidebar::collapsed`)
dengan `try/catch`, dibaca setelah mount supaya aman untuk SSR.

Ikon sidebar memakai registry Tabler yang sudah ada (`components/Icon.tsx`),
alias baru: `panel`, `panelOpen`, `apps`, `select`, `folderOpen`, `navStack`,
`sitemap`. Tidak ada library baru.

Tambahan: di mobile tombol burger hanya ada di top bar halaman
(`Shells.tsx::StandardShell`) — di desktop toggle-nya ada di header sidebar
supaya tidak ada dua tombol toggle. `DesktopShell` (mode_desktop) masih memakai
`MenuTree` +Start menu seperti sebelumnya.

## 8. Area kerja (tampilan)

Semua komponen area kerja punya design token + class bersama di
`app/layout.tsx` (inline `<style>`). Menu baru **tidak** perlu CSS sendiri —
pakai pola yang sama dengan `templates/menu/`.

### Token

Semua warna/jari radii/shadow ada di blok `:root` (`--bg`, `--surface`,
`--border`, `--text`, `--muted`, `--brand`, `--r-lg`, `--sh`, `--h-ctl`, …).
Ubah di satu tempat untuk mengubah seluruh tampilan.

### Komponen bersama

| Komponen | Class | Dipakai di |
|---|---|---|
| Judul halaman | `<PageHead title subtitle icon actions>` (`components/Page.tsx`) | semua mainpage + Home |
| Judul/aksi dalam card | `<CardHead icon>` | panel sekunder |
| Card | `.card` + `.card-body` | konten non-tabel |
| Grid | `.grid-box` (toolbar + `.table-wrap` + `table.grid` + `.toolbar.bbar`) | semua GRID |
| Tombol | `<Btn icon iconOnly className>` | semua tombol |
| Empty state | `<EmptyRow colSpan loading message>` | semua GRID |
| Status pill | `.badge.ok` / `.badge.off` | kolom status |

### FRM = window yang ukurannya bisa diatur

Padanan `Ext.window.Window` di langit_v2. Contoh asli `FRMmpph.js`:

```js
width:  mainpage.getWidth()  * 0.35,
height: mainpage.getHeight() * 0.44,
```

Di app-core ukurannya ditulis **di dalam file FRM** lewat `<Window>`:

```tsx
<Window
  title="Create User"          // = title di Ext.define
  icon="add"                   // = ikon header
  width="46%"                  // angka = px, string = satuan CSS
  height="46%"                 // opsional; body scroll sendiri
  footer={<>…tombol dgn pid="btsave" / pid="btdelete"…</>}
>
```

Komponen pembantu (semua di `components/Window.tsx`):

| Komponen | Padalan langit_v2 |
|---|---|
| `<Window title icon width height footer>` | `Ext.window.Window` + `width`/`height`/`tbar` |
| `<FrmRow label>` | `fieldDefaults: { labelAlign, labelWidth }` — label **sejajar kiri** |
| `<FrmSet legend icon columns>` | `xtype: "fieldset"` |

`FrmRow` membuat form jadi **2 kolom, compact** — bukan label di atas input yang
menjadikan form memanjang ke bawah. `columns` di `FrmSet` mengatur jumlah kolom
(1/2/3).

Contoh FRM yang jadi acuan: `app/cp_usersetting/FRMcp_usersetting.tsx`
(2 kolom, `width="44%"`) dan `app/cp_usersetting/FRMprofile_user.tsx`
(3 fieldset, 1 kolom untuk password).

Catatan: app-core **tidak memakai konsep department**. Kolom `CPUSER.USERDEPT`
masih ada di tabel tapi tidak diisi lagi oleh `Mcpuser::create_user_akses` /
`edit_user_akses`, dan tidak ada lagi UI/endpoint department.

### Pola halaman menu (mainpage)

```tsx
<PageHead icon="user" title="User Login" subtitle="Kelola akun user login." />
<div className="card">
  <div className="toolbar">
    <Btn pid="btrefresh" icon="refresh" onClick={() => btrefresh_click(grid.current)}>Refresh</Btn>
    <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Create</Btn>
  </div>
  <GRID<mcontrol> ref={grid} />
</div>
```

`.card { padding: 0 }`, jadi **isi card bukan tabel wajib dibungkus
`.card-body`** (atau `.grid-box`). Toolbar pertama di dalam card/grid-box
automatis dapat padding + garis bawah; toolbar terakhir (`bbar`) dapat padding
+ garis atas — jadi **hapus `style={{ marginTop: 10 }}`** dari toolbar.

Tabel wajib dibungkus `<div className="table-wrap">` supaya bisa scroll
horizontal sendiri tanpa bikin halaman ikut melebar.

## 9. Catatan teknis

- **Jangan `next build` saat `next dev` sedang berjalan.** Keduanya berbagi
  folder `.next`; build akan menimpanya dan dev server jadi error
  `Cannot find module './xxx.js'` + hydration error.
- **CSS inline di `app/layout.tsx` tidak boleh memuat `<`, `>`, `&`, `"`, atau `'`.**
  `<style>` adalah raw-text element: browser tidak decode entity di dalamnya,
  sedangkan React meng-escape kelima karakter itu saat SSR. Akibatnya hydration
  gagal dengan "Text content does not match server-rendered HTML". Yang perlu
  dijauhi: child selector (`.a .b`), `content: ""`, dan `content: ''`.
  Untuk garis indikator item aktif, pakai `box-shadow: inset 3px 0 0 #3b82f6`
  sebagai pengganti `content: ""` + `::before`.
  CSS di file `.css` eksternal boleh; aturan 5 karakter itu hanya untuk
  `<style>` inline.
- Semua icon memakai **Tabler Icons** lewat registry tunggal
  `components/Icon.tsx` (`<Icon name="..."/>` dan `<Btn icon="...">`).
  Tidak ada lagi ikon unicode/emoji/teks.