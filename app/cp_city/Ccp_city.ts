// Controller menu cp_city — padanan Ccp_userlogin.js langit_v2.
// Handler-nya dipanggil toolbar mainpage, lalu nyentukin grid lewat GridApi.
// State/API TIDAK boleh ada di controller (itu milik GRIDcp_city).
import type { GridApi } from './GRIDcp_city';

export const mcontrol = 'cp_city';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_city');
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
