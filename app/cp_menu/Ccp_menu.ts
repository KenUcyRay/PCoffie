// Controller menu cp_menu — padanan Ccp_userlogin.js langit_v2.
// Tanpa btnew (tidak ada tambah). State/API milik GRIDcp_menu.
import type { GridApi } from './GRIDcp_menu';

export const mcontrol = 'cp_menu';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_menu');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}
