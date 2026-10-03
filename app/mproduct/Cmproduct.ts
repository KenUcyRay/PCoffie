// Controller menu mproduct — padanan Cmproduct.js langit_v2.
// Katalog hanya baca; state/API milik GRIDmproduct.
import type { GridApi } from './GRIDmproduct';

export const mcontrol = 'mproduct';

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
    // console.log('renderer controller mproduct');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}
