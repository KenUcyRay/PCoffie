// Controller menu mpayout — padanan Cmpayout.js langit_v2.
// Tanpa state/async di sini; state milik GRID, aksi form milik FRM.
import type { GridApi } from './GRIDmpayout';

export const mcontrol = 'mpayout';

// Label status payout.
export const PO_STATUS_LABEL: Record<string, string> = {
  DIAJUKAN: 'Diajukan',
  DIPROSES: 'Diproses',
  BERHASIL: 'Berhasil',
  GAGAL: 'Gagal',
  DITOLAK: 'Ditolak',
};

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatPoRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  const neg = n < 0 ? '-' : '';
  return neg + 'Rp' + Math.round(Math.abs(n)).toLocaleString('id-ID');
}

// Format datetime ke lokal Indonesia lengkap dengan detik, mis. 03 Okt 2026, 14.05.22.
export function formatPoTgl(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Unduh CSV dari base64 (pola halaman lain).
export function downloadPoCSV(base64: string, filename: string): void {
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
    // console.log('renderer controller mpayout');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: tanpa btnew (ajukan lewat tab Siap Dicairkan).
export function btnew_click(_grid: GridApi | null): void {
  // sengaja kosong
}
