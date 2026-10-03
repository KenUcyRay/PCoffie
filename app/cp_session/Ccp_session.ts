// Controller menu cp_session — padanan Ccp_session.js langit_v2.
// Tanpa btnew (tidak ada tambah). State/API milik GRIDcp_session.
import type { GridApi } from './GRIDcp_session';

export const mcontrol = 'cp_session';

// Format datetime ke lokal Indonesia lengkap dengan detik, mis. 03 Okt 2026, 14.05.22.
export function formatTanggal(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_session');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}
