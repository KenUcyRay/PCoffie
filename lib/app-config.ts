// Konfigurasi identitas aplikasi — SATU-SATUNYA file yang perlu diubah
// saat rebrand / dipakai ulang untuk aplikasi lain.
//
//   NEXT_PUBLIC_APP_NAME   nama tampil (judul tab, login, sidebar)
//   NEXT_PUBLIC_BASE_PATH  prefix URL: '' (kosong) = root domain,
//                          mis. '/pcoffie' untuk sub-path. Di produksi ini
//                          dikosongkan karena PCoffie memakai subdomain sendiri
//                          (pcoffie.trialab.web.id) dengan portal di '/' dan
//                          console di '/control'.
//   NEXT_PUBLIC_API_BASE   alamat backend (lihat .env.development/.env.production)
//
// Storage key diturunkan dari slug BASE_PATH supaya dua aplikasi berbeda
// di domain yang sama tidak tabrakan localStorage. Konsekuensi: ganti nama
// = sesi lama hangus sekali (user otomatis logout + kembali ke Home).
//
// PENTANG: kalau BASE_PATH kosong (root domain), APP_SLUG TIDAK boleh kosong —
// kalau iya kunci storage jadi '::auth::token' yang tidak namespaced dan
// gampang bentrok dengan aplikasi lain. Karena itu ada DEFAULT_SLUG.
//
// Yang TIDAK ikut (di luar repo / infra, lihat checklist rebrand):
//   httpd.conf (ProxyPass/Location), nama folder, nama database,
//   APP_URL backend, package.json name.
const DEFAULT_SLUG = 'pcoffie';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME || 'PCOFFIE';

/** Prefix URL aplikasi: '' untuk root domain, '/x' untuk sub-path. Tanpa trailing slash. */
export const BASE_PATH: string = BASE.replace(/\/+$/, '');

/** Slug untuk storage key. Tidak pernah kosong, walau aplikasi di root domain. */
export const APP_SLUG: string = BASE_PATH.replace(/^\//, '') || DEFAULT_SLUG;

/** Kunci storage namespaced, mis. STORE('route') -> 'pcoffie::route'. */
export function STORE(key: string): string {
  return `${APP_SLUG}::${key}`;
}

/** Alamat backend API. */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || `${BASE_PATH}/appservice/public/api/core`;
}
