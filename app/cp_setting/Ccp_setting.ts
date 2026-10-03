// Controller menu cp_setting — padanan Ccp_setting.js langit_v2.
// Form satu halaman (bukan grid): simpan milik GRIDcp_setting.
import type { GridApi } from './GRIDcp_setting';

export const mcontrol = 'cp_setting';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_setting');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: pid="btsave"
export function btsave_click(grid: GridApi | null): void {
  grid?.save();
}
