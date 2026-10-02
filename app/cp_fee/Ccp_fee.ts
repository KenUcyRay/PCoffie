// Controller menu cp_fee — padanan Ccp_userlogin.js langit_v2.
// Format Rupiah dipakai ulang dari halaman Payment Method (jangan disalin ulang).
// State/API TIDAK boleh ada di controller.
import type { GridApi } from './GRIDcp_fee';
import type { FeeForm } from './FRMcp_fee';
import { formatIDR as _formatIDR, formatPct as _formatPct } from '../cp_paymentmethod/Ccp_paymentmethod';

export const mcontrol = 'cp_fee';

export const formatIDR = _formatIDR;
export const formatPct = _formatPct;

// Format tanggal lokal Indonesia, mis. 2026-10-04 -> 4 Okt 2026.
export function formatTanggal(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Hari ini dalam format YYYY-MM-DD (untuk input date).
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_fee');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: pid="btnew" (buka form versi baru, prefill dari saat ini)
export function btnew_click(grid: GridApi | null, initial?: FeeForm): void {
  grid?.create(initial);
}
