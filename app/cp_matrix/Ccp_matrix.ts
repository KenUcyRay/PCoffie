// Controller menu cp_matrix — padanan Ccp_userlogin.js langit_v2.
// Tanpa btnew (tidak ada tambah). State/API milik GRIDcp_matrix.
import type { GridApi } from './GRIDcp_matrix';

export const mcontrol = 'cp_matrix';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_matrix');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}
