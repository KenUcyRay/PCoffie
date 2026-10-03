// Controller menu mbank — padanan Cmbank.js langit_v2.
// Tanpa state/async di sini; state milik GRID, aksi form milik FRM.
import type { GridApi } from './GRIDmbank';

export const mcontrol = 'mbank';

// Label jenis pemilik.
export const OWNER_LABEL: Record<string, string> = {
  SELLER: 'Penjual',
  ORGANIZER: 'Penyelenggara',
};

// Label status verifikasi.
export const VERIFY_LABEL: Record<string, string> = {
  BELUM_VERIFIKASI: 'Belum verifikasi',
  TERVERIFIKASI: 'Terverifikasi',
  DITOLAK: 'Ditolak',
};

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mbank');
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
