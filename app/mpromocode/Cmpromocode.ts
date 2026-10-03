// Controller menu mpromocode — padanan Cmpromocode.js langit_v2.
// Tanpa state/async di sini; state milik GRID, aksi form milik FRM.
import type { GridApi } from './GRIDmpromocode';

export const mcontrol = 'mpromocode';

// Label tampilan status promo (dihitung backend).
export const DISPLAY_LABEL: Record<string, string> = {
  BERLAKU: 'Berlaku',
  AKAN_DATANG: 'Akan datang',
  KEDALUWARSA: 'Kedaluwarsa',
  KUOTA_HABIS: 'Kuota habis',
  NONAKTIF: 'Nonaktif',
};

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatPromoRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

// Nilai promo: persen atau nominal (+maksimum bila ada).
export function formatNilai(row: { DISCTYPE?: string; DISCVALUE?: unknown; MAXDISC?: unknown }): string {
  const v = Number(row.DISCVALUE);
  if (String(row.DISCTYPE || '').toUpperCase() === 'PERSEN') {
    const base = Number.isFinite(v) ? `${v}%` : '-';
    return row.MAXDISC ? `${base} (maks ${formatPromoRp(row.MAXDISC)})` : base;
  }
  return formatPromoRp(row.DISCVALUE);
}

// Kuota: pakai/batas (tanpa batas bila NULL).
export function formatKuota(row: { QUOTA?: number | null; USEDCOUNT?: number }): string {
  const used = Number(row.USEDCOUNT) || 0;
  if (row.QUOTA === null || row.QUOTA === undefined) return `${used}× (tanpa batas)`;
  return `${used}/${row.QUOTA}`;
}

// Tanggal saja (10 karakter pertama), mis. 2026-10-03.
export function formatTgl(value: unknown): string {
  const s = String(value ?? '').slice(0, 10);
  return s || '-';
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mpromocode');
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
