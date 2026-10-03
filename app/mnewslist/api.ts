// API menu mnewslist (Discovery) — baca berita, hanya baca.
import { apiPost, getApiBase } from '@/lib/api';

const SEGMENT = 'home/mnewslist/mnewslist';

export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; status?: string;
  cat?: string; eventcat?: string; sort?: string; filters?: Record<string, string>;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data', limit: opts.limit, offset: opts.offset, q: opts.q,
    status: opts.status, cat: opts.cat, eventcat: opts.eventcat, sort: opts.sort,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}

export async function read_facets() {
  return apiPost(SEGMENT, { method: 'read_facets' });
}

export async function read_detail(slug: string) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ SLUG: slug }),
  });
}

// URL penuh file gambar dari path relatif DB (mis. uploads/news/x.png).
// Semantik sama dengan imageUrl() di News Data.
export function newsImageUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}
