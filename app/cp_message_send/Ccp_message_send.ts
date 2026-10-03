// Controller menu cp_message_send — padanan Ccp_message_send.js langit_v2.
// Form satu halaman (bukan grid): kirim + refresh milik GRIDcp_message_send.
import type { GridApi } from './GRIDcp_message_send';

export const mcontrol = 'cp_message_send';

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller cp_message_send');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: pid="btsend"
export function btsend_click(grid: GridApi | null): void {
  grid?.send();
}
