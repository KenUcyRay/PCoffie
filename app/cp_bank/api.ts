// API menu cp_bank — padanan store/proxy "cpbank/cpbank".
// Endpoint: api/core/home/cpbank/cpbank (method read_data/process_*).
// Backend: appservice/app/Models/Mcpbank.php.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpbank/cpbank';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid bank (paging + filter kolom + sorting server).
export async function read_data(opts: { limit?: number; offset?: number; q?: string; filters?: Record<string, string>; sort?: SortState } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key,
    dir: opts.sort?.dir,
  });
}

// read_active: daftar bank aktif (kode + nama + singkat) untuk dropdown.
export async function read_active() {
  return apiPost(SEGMENT, {
    method: 'read_active',
  });
}

// process_create: tambah bank (vdata JSON string).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

// process_update: ubah bank.
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// change_status: aktif/nonaktif bank.
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: hapus bank.
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}
