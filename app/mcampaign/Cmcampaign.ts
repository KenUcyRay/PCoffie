// Controller menu mcampaign — padanan Cmcampaign.js langit_v2.
// Tanpa state/async di sini; state milik GRID, aksi form milik FRM.
import type { GridApi } from './GRIDmcampaign';

export const mcontrol = 'mcampaign';

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatAdRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

// Tanggal saja (10 karakter pertama), mis. 2026-10-03.
export function formatAdTgl(value: unknown): string {
  const s = String(value ?? '').slice(0, 10);
  return s || '-';
}

// Label status kampanye.
export const CAMP_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  MENUNGGU_BAYAR: 'Menunggu bayar',
  AKTIF: 'Aktif',
  DIJEDA: 'Dijeda',
  DIBATALKAN: 'Dibatalkan',
};

// Label tampilan periode.
export const PERIOD_LABEL: Record<string, string> = {
  TERJADWAL: 'Terjadwal',
  TAYANG: 'Tayang',
  SELESAI: 'Selesai',
};

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mcampaign');
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
