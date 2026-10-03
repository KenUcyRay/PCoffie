// Controller menu cp_security — padanan Ccp_security.js langit_v2.
// Form satu halaman (bukan grid): simpan + reset milik GRIDcp_security.
import type { GridApi } from './GRIDcp_security';

export const mcontrol = 'cp_security';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_security');
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

// toolbar mainpage: pid="btreset"
export function btreset_click(grid: GridApi | null): void {
  grid?.reset();
}
