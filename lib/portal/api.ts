// Klien API portal pembeli.
//
// Semua endpoint memakai prefix "portal/..." yang dipetakan di routes/web.php
// backend. Formát balasan sama dengan model lain: { success: 'true'|'false',
// message, ... } (lihat lib/api.ts untuk versi Console).
import { apiBase } from '../app-config';

export type PortalResult<T = any> = {
  success: string | boolean;
  message?: string;
  [k: string]: any;
};

export function portalUrl(): string {
  return apiBase().replace(/([^:])\/+/g, '$1/');
}

/** Dipakai untuk URL gambar: apiBase tanpa /api/core + path tersimpan. */
export function assetUrl(stored: string | null | undefined): string {
  const p = String(stored ?? '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const root = apiBase().replace(/\/+$/, '').replace(/\/api\/core$/, '');
  return `${root}/${p.replace(/^\/+/, '')}`;
}

export function isOk(res: PortalResult | null | undefined): boolean {
  if (!res) return false;
  return res.success === true || String(res.success).toLowerCase() === 'true';
}

export async function portalPost<T = any>(
  path: string,
  body: Record<string, unknown> = {},
  opts?: { auth?: boolean },
): Promise<T> {
  const needAuth = opts?.auth !== false;
  let token: string | null = null;
  if (needAuth && typeof window !== 'undefined') {
    // Token Console disimpan di localStorage dengan prefix app.
    // Diambil langsung supaya tidak bentrok dengan lib/api.ts yang memakai memori.
    try {
      const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/pcoffie').replace(/^\/|\/+$/g, '');
      token = localStorage.getItem(`${slug}::auth::token`);
    } catch { token = null; }
  }

  const res = await fetch(`${portalUrl()}/${path}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (res.status === 401) {
    const err: any = new Error(String(json?.message || 'Silakan masuk terlebih dahulu.'));
    err.portalUnauth = true;
    throw err;
  }
  return json as T;
}