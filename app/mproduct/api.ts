// API menu mproduct — padanan store/proxy "mproduct/mproduct" (hanya baca).
// Endpoint: api/core/home/mproduct/mproduct.
// Backend: appservice/app/Models/Mmproduct.php (reuse query Product Data).
import { apiPost, getApiBase } from '@/lib/api';

// URL penuh file dari path relatif DB (mis. uploads/merch/x.png).
export function imageUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}

const SEGMENT = 'home/mproduct/mproduct';

// read_data: katalog (paging + filter + 4 urutan). Default hanya yang layak jual.
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; category?: string;
  sellerid?: string; condition?: string; price_min?: string; price_max?: string;
  sortopt?: string; show_all?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    category: opts.category, sellerid: opts.sellerid, condition: opts.condition,
    price_min: opts.price_min, price_max: opts.price_max,
    sortopt: opts.sortopt, show_all: opts.show_all,
  });
}

// read_detail: satu produk + galeri + info penjual.
export async function read_detail(productid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ PRODUCTID: productid }),
  });
}
