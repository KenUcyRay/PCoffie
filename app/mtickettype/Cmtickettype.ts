// Controller menu mtickettype — padanan Cmtickettype.js langit_v2.
// State/API milik GRIDmtickettype. Tanpa state/async di sini.
import type { GridApi } from './GRIDmtickettype';

export const mcontrol = 'mtickettype';

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatIDR(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mtickettype');
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
