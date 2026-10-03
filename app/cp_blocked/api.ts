// API menu cp_blocked — padanan store/proxy "cpblocked/cpblocked".
// Endpoint: api/core/home/cpblocked/cpblocked (method read_data/read_summary/process_create/process_unblock).
// Backend: appservice/app/Models/Mcpblocked.php. Tanpa hapus fisik.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpblocked/cpblocked';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid blokir (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; type?: string;
  source?: string; status?: string; value?: string; reason?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    type: opts.type, source: opts.source, status: opts.status,
    value: opts.value, reason: opts.reason,
  });
}

// read_summary: blokir aktif per jenis + blokir otomatis 24 jam terakhir.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// process_create: tambah blokir manual (ENDTIME '' = permanen).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

// process_unblock: buka blokir AKTIF (STATUS -> DIBUKA, tanpa hapus fisik).
export async function process_unblock(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_unblock',
    vdata: JSON.stringify(vdata),
  });
}
