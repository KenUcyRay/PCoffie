// Controller menu cp_usergroup — padanan Ccp_usergroup.js langit_v2.
//
// Controller hanya nyediain handler yang dipanggil toolbar (ExtJS:
// `handler: "btrefresh_click"`), lalu meneruskannya ke panel yang dimaksud
// lewat reference. Dalam React, reference = ref milik mainpage yang diteruskan
// ke masing-masing panel lewat GridApi / AksesApi.
//
// State & API TIDAK ADA di sini — itu milik GRIDcp_usergroup (store+proxy grid)
// dan FRMcp_usergroup (panel hak akses).
import type { GridApi } from './GRIDcp_usergroup';
import type { AksesApi } from './FRMcp_usergroup';

export const mcontrol = 'cp_usergroup';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  // console.log('renderer controller cp_usergroup');
}

// toolbar panel kiri: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar panel kiri: pid="btnew"
export function btnew_click(grid: GridApi | null): void {
  grid?.create();
}

// toolbar panel kanan: pid="btsave"
export function btsave_click(akses: AksesApi | null): void {
  akses?.save();
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