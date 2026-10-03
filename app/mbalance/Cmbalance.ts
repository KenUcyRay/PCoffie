// Controller menu mbalance — padanan Cmbalance.js langit_v2.
// Tanpa state/async di sini; state milik GRID.
import type { GridApi } from './GRIDmbalance';

export const mcontrol = 'mbalance';

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000 (negatif: -Rp...).
export function formatBalRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  const neg = n < 0 ? '-' : '';
  return neg + 'Rp' + Math.round(Math.abs(n)).toLocaleString('id-ID');
}

// Format datetime ke lokal Indonesia lengkap dengan detik, mis. 03 Okt 2026, 14.05.22.
export function formatBalTgl(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Label jenis entri ledger.
export const ENTRY_LABEL: Record<string, string> = {
  SALE: 'Penjualan',
  RELEASE: 'Pelepasan',
  REVERSAL: 'Pembatalan',
  REFUND: 'Refund',
  WITHDRAWAL: 'Penarikan',
  WITHDRAWAL_REVERSAL: 'Penarikan kembali',
};

// Unduh CSV dari base64 (pola halaman lain).
export function downloadBalCSV(base64: string, filename: string): void {
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
    // console.log('renderer controller mbalance');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: tanpa btnew (read-only, tanpa koreksi saldo).
export function btnew_click(_grid: GridApi | null): void {
  // sengaja kosong
}
