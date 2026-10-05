// Konfigurasi identitas aplikasi — SATU-SATUNYA file yang perlu diubah
// saat rebrand / dipakai ulang untuk aplikasi lain.
//
//   NEXT_PUBLIC_APP_NAME   nama tampil (judul tab, login, sidebar)
//   NEXT_PUBLIC_BASE_PATH  prefix URL, mis. /tiket-app
//   NEXT_PUBLIC_API_BASE   alamat backend (lihat .env.development/.env.production)
//
// Storage key diturunkan dari slug BASE_PATH supaya dua aplikasi berbeda
// di domain yang sama tidak tabrakan localStorage. Konsekuensi: ganti nama
// = sesi lama hangus sekali (user otomatis logout + kembali ke Home).
//
// Yang TIDAK ikut (di luar repo / infra, lihat checklist rebrand):
//   httpd.conf (ProxyPass/Location), nama folder, nama database,
//   APP_URL backend, package.json name.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '/pcoffie';

export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME || 'PCOFFIE';

/** Prefix URL aplikasi, mis. '/tiket-app'. Selalu diawali slash, tanpa trailing slash. */
export const BASE_PATH: string = BASE.length > 1 ? BASE.replace(/\/+$/, '') : BASE;

/** Slug untuk storage key, mis. 'tiket-app'. */
export const APP_SLUG: string = BASE_PATH.replace(/^\//, '');

/** Kunci storage namespaced, mis. STORE('route') -> 'tiket-app::route'. */
export function STORE(key: string): string {
  return `${APP_SLUG}::${key}`;
}

/** Alamat backend API. */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || `${BASE_PATH}/appservice/public/api/core`;
}
