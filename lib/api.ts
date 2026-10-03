// Pengganti COMP.run.getservice/gethide + COMP.parse.parseBoolean + bearer memory.
// Cara pakai mirip referensi: apiPost('home/cpuser/cpuser', { method:'read_data', vdata: JSON.stringify({...}) })
import { STORE, apiBase } from './app-config';

export class SessionExpiredError extends Error {}

// Dipanggil setiap kali apiPost melempar SessionExpiredError, supaya aplikasi
// bisa langsung membuka dialog login ulang tanpa menunggu watcher 30 detik.
type ExpiredHandler = () => void;
let expiredHandler: ExpiredHandler | null = null;

export function setSessionExpiredHandler(fn: ExpiredHandler | null): void {
  expiredHandler = fn;
}

const TOKEN_KEY = STORE('auth::token');

let memoryToken: string | null = null;

export function getApiBase(): string {
  return apiBase();
}

export function parseBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY);
  } catch { memoryToken = null; }
  return memoryToken;
}

export function setToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* abaikan */ }
}

export async function apiPost<T = any>(path: string, body: Record<string, unknown>, opts?: { skipAuthExpiredHandler?: boolean }): Promise<T> {
  const res = await fetch(`${getApiBase()}/${path}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  // 401 = sesi/token ditolak backend. Pesan asli dari server dipakai supaya
  // penyebabnya terlihat (mis. "Token is invalid", "Sesi login tidak valid."),
  // bukan menyamar jadi "session habis" generik.
  if (res.status === 401 && !opts?.skipAuthExpiredHandler) {
    const message = String(json?.message || '').trim() || 'Sesi login habis. Silakan login kembali.';
    try { expiredHandler?.(); } catch { /* abaikan */ }
    throw new SessionExpiredError(message);
  }
  return json as T;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}/${path}`.replace(/([^:])\/+/g, '$1/'), {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  return (await res.json().catch(() => ({}))) as T;
}
