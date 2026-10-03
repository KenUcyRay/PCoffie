// API menu cp_session — padanan store/proxy "cpsession/cpsession".
// Endpoint: api/core/home/cpsession/cpsession (method read_data/read_summary/process_revoke).
// Backend: appservice/app/Models/Mcpsession.php. Tanpa create/delete.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpsession/cpsession';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid sesi (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; user?: string;
  status?: string; ip?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    user: opts.user, status: opts.status, ip: opts.ip,
  });
}

// read_summary: jumlah sesi aktif + user yang sedang aktif.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// process_revoke: cabut sesi AKTIF milik user lain (sesi sendiri ditolak backend).
export async function process_revoke(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_revoke',
    vdata: JSON.stringify(vdata),
  });
}
