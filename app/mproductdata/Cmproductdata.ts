// Controller menu mproductdata — padanan Cmproductdata.js langit_v2.
// Dua tab (Produk/Penjual); state/API milik masing-masing GRID.
import type { GridApi as ProductGridApi } from './GRIDmproductdata';
import type { GridApi as SellerGridApi } from './GRIDmseller';

export const mcontrol = 'mproductdata';

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatIDR(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mproductdata');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh" (teruskan ke tab aktif)
export function btrefresh_click(grid: ProductGridApi | SellerGridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: pid="btnew" (teruskan ke tab aktif)
export function btnew_click(grid: ProductGridApi | SellerGridApi | null): void {
  grid?.create();
}
