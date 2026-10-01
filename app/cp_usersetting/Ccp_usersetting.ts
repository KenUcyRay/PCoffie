// Controller menu cp_usersetting — padanan Ccp_usersetting.js langit_v2.
//
// Di ExtJS controller cuma nyediain handler yang dipanggil toolbar mainpage
// lewat `handler: "btrefresh_click"`, lalu nyentukin pakai reference ke grid.
// Di React tidak ada Ext.apply/reference, jadi grid di-expose lewat ref dan
// dikasih ke handler sebagai argumen (tipenya GridApi dari GRIDcp_usersetting).
//
// PENTING: controller TIDAK boleh nyimpen state / memanggil API. Semua itu
// milik GRIDcp_usersetting (itu padanan store + proxy + grid di langit_v2).
import type { GridApi } from './GRIDcp_usersetting';

export const mcontrol = 'cp_usersetting';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_usersetting');
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

export function formatAmount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}