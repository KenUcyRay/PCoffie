// Controller menu msales — padanan Cmsales.js langit_v2.
// Tanpa state/async di sini; state milik GRID (read-only report).
import type { GridApi } from './GRIDsales';

export const mcontrol = 'msales';

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatRptRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  const neg = n < 0 ? '-' : '';
  return neg + 'Rp' + Math.round(Math.abs(n)).toLocaleString('id-ID');
}

// Format tanggal lokal Indonesia pendek, mis. 03 Okt.
export function formatRptTgl(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

// Unduh CSV dari base64 (pola halaman lain).
export function downloadRptCSV(base64: string, filename: string): void {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller msales');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: tanpa btnew (read-only report).
export function btnew_click(_grid: GridApi | null): void {
  // sengaja kosong
}
