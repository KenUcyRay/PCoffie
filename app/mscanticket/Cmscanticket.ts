// Controller menu mscanticket — padanan Cmscanticket.js langit_v2.
// State/API milik GRIDmscanticket. Tanpa state/async di sini.
import type { GridApi } from './GRIDmscanticket';

export const mcontrol = 'mscanticket';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mscanticket');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}
