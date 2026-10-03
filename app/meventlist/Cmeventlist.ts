// Controller menu meventlist — padanan controller langit_v2.
// Menyimpan preferensi & filter di sessionStorage agar bisa dibagikan
// antaroperator; juga penanda "buka detail event ini" antar-halaman.
import type { GridApi } from './GRIDmeventlist';

export const mcontrol = 'meventlist';

const PREF_KEY = 'tiket-app::vent-pref';
const FILTER_KEY = 'tiket-app::vent-filter';
const DETAIL_KEY = 'tiket-app::vent-detail';

export type VentPref = { mode: 'cards' | 'table' };

// Simpan & baca preferensi tampilan + filter (seluruh objek).
export function savePref(p: VentPref): void {
  try { window.sessionStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* abaikan */ }
}
export function loadPref(): VentPref {
  try {
    const v = window.sessionStorage.getItem(PREF_KEY);
    if (v) {
      const p = JSON.parse(v);
      if (p && (p.mode === 'cards' || p.mode === 'table')) return p;
    }
  } catch { /* abaikan */ }
  return { mode: 'cards' };
}

export type VentFilter = {
  q: string; status: string; cat: string; city: string;
  from: string; to: string; pmin: string; pmax: string;
  sales: string; sort: string; page: number;
};

export const DEFAULT_FILTER: VentFilter = {
  q: '', status: 'PUBLISHED', cat: '', city: '',
  from: '', to: '', pmin: '', pmax: '', sales: '', sort: 'terdekat', page: 0,
};

export function saveFilter(f: VentFilter): void {
  try { window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* abaikan */ }
}
export function loadFilter(): VentFilter {
  try {
    const v = window.sessionStorage.getItem(FILTER_KEY);
    if (v) {
      const p = JSON.parse(v);
      if (p && typeof p === 'object') return { ...DEFAULT_FILTER, ...p };
    }
  } catch { /* abaikan */ }
  return { ...DEFAULT_FILTER };
}

// Set penanda buka detail (dipakai halaman lain lalu navigate ke meventlist).
export function setDetailEvent(eventid: number): void {
  try { window.sessionStorage.setItem(DETAIL_KEY, String(eventid)); } catch { /* abaikan */ }
}
export function takeDetailEvent(): number | null {
  try {
    const v = window.sessionStorage.getItem(DETAIL_KEY);
    if (v == null) return null;
    window.sessionStorage.removeItem(DETAIL_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatVentRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

// Format datetime lokal Indonesia: 03 Okt 2026, 14.05.
export function formatVentTgl(value: unknown, withTime = true): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return withTime
    ? d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Label status event (operator).
export const EVENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ENDED: 'Ended',
  CANCELLED: 'Cancelled',
};

// Label penanda penjualan event / tipe tiket.
export const FLAG_LABEL: Record<string, string> = {
  TERSEDIA: 'Tersedia',
  HAMPIR_HABIS: 'Hampir habis',
  SOLD_OUT: 'Sold out',
};

export const TYPE_STATUS_LABEL: Record<string, string> = {
  TERSEDIA: 'Tersedia',
  HAMPIR_HABIS: 'Hampir habis',
  SOLD_OUT: 'Sold out',
  BELUM_DIBUKA: 'Penjualan belum dibuka',
  DITUTUP: 'Penjualan ditutup',
  TIDAK_AKTIF: 'Tidak aktif',
};

export function init(): void {
  renderpage();
}
export function renderpage(): void {
  try { /* renderer controller meventlist */ } catch { /* abaikan */ }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// tidak ada tambah/ubah di halaman katalog.
export function btnew_click(_grid: GridApi | null): void {
  // sengaja kosong
}
