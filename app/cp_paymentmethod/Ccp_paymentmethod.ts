// Controller menu cp_paymentmethod — padanan Ccp_userlogin.js langit_v2.
// Handler-nya dipanggil toolbar mainpage, lalu nyentukin grid lewat GridApi.
// State/API TIDAK boleh ada di controller (itu milik GRIDcp_paymentmethod).
import type { GridApi } from './GRIDcp_paymentmethod';

export const mcontrol = 'cp_paymentmethod';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_paymentmethod');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: pid="btnew"
export function btnew_click(grid: GridApi | null): void {
  grid?.create();
}

// Format angka_entries jadi Rupiah (id-ID), mis. 4000 -> Rp4.000.
export function formatIDR(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

// Format persen Indonesia (koma desimal), mis. 2.9 -> 2,9%.
export function formatPct(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return String(n).replace('.', ',') + '%';
}
