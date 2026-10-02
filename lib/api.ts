// Pengganti COMP.run.getservice/gethide + COMP.parse.parseBoolean + bearer memory.
// Cara pakai mirip referensi: apiPost('home/cpuser/cpuser', { method:'read_data', vdata: JSON.stringify({...}) })
import { STORE, apiBase } from './app-config';

export class SessionExpiredError extends Error {}

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
  if (res.status === 401 && !opts?.skipAuthExpiredHandler) {
    throw new SessionExpiredError('Sesi login habis. Silakan login kembali.');
  }
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok && !opts?.skipAuthExpiredHandler && res.status === 401) {
    throw new SessionExpiredError(json.message || 'Sesi login habis.');
  }
  return json as T;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}/${path}`.replace(/([^:])\/+/g, '$1/'), {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  return (await res.json().catch(() => ({}))) as T;
}
