// TEMPLATE controller — padanan C<mod>.js langit_v2.
//
// Cara pakai: rename Cmod.ts -> C<mcontrol>.ts, lalu ganti nilai mcontrol di
// bawah dan sesuaikan import type GridApi.
//
// Isi controller HANYA handler yang dipanggil toolbar mainpage
// (ExtJS: `handler: "btrefresh_click"`), lalu meneruskannya ke grid lewat
// reference. JANGAN simpan state atau memanggil API di sini — itu milik
// GRID<mod> (padanan store + proxy + grid di langit_v2).
import type { GridApi } from './GRIDmod';

export const mcontrol = 'mod';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller ' + mcontrol);
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