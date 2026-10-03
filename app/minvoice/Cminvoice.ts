// Controller menu minvoice — padanan Cminvoice.js langit_v2.
// Tanpa state/async di sini; state milik GRID.
import type { GridApi } from './GRIDminvoice';

export const mcontrol = 'minvoice';

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatInvRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  const neg = n < 0 ? '-' : '';
  return neg + 'Rp' + Math.round(Math.abs(n)).toLocaleString('id-ID');
}

// Format tanggal lokal Indonesia tanpa jam, mis. 03 Okt 2026.
export function formatInvTgl(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Unduh CSV dari base64 (pola halaman lain).
export function downloadInvCSV(base64: string, filename: string): void {
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
    // console.log('renderer controller minvoice');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: tanpa btnew (read-only, invoice terbit otomatis).
export function btnew_click(_grid: GridApi | null): void {
  // sengaja kosong
}
