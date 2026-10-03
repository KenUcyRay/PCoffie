// API menu mpromolist (Discovery) — katalog promo, hanya baca.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mpromolist/mpromolist';

export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; status?: string;
  disctype?: string; scopetype?: string; sort?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data', limit: opts.limit, offset: opts.offset, q: opts.q,
    status: opts.status, disctype: opts.disctype, scopetype: opts.scopetype, sort: opts.sort,
  });
}

export async function read_summary() {
  return apiPost(SEGMENT, { method: 'read_summary' });
}

export async function read_detail(promoid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ PROMOID: promoid }),
  });
}