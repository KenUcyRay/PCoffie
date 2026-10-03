// API menu meventlist (Discovery) — katalog event hanya baca.
// Endpoint: api/core/home/meventlist/meventlist.
import { apiPost, getApiBase } from '@/lib/api';

const SEGMENT = 'home/meventlist/meventlist';

export type SortKey = 'terdekat' | 'terpopuler' | 'termurah' | 'termahal';

export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; status?: string;
  cat?: string; city?: string; datefrom?: string; dateto?: string;
  price_min?: string; price_max?: string; sales?: string; sort?: SortKey;
  filters?: Record<string, string>;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q, status: opts.status,
    cat: opts.cat, city: opts.city, datefrom: opts.datefrom, dateto: opts.dateto,
    price_min: opts.price_min, price_max: opts.price_max, sales: opts.sales,
    sort: opts.sort,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}

// read_detail: satu event + tipe tiket + promo berlaku.
export async function read_detail(eventid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ EVENTID: eventid }),
  });
}

// read_config: kategori/kota aktif + rentang harga publik.
export async function read_config() {
  return apiPost(SEGMENT, {
    method: 'read_config',
  });
}

// URL penuh poster dari path relatif DB (uploads/event/x.png).
export function posterUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}
