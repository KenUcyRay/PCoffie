// Controller menu mnewscategory — padanan Cmnewscategory.js langit_v2.
// Tanpa state/async di sini; state milik GRID, aksi form milik FRM.
import type { GridApi } from './GRIDmnewscategory';

export const mcontrol = 'mnewscategory';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mnewscategory');
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
