// API menu mnewscategory — padanan store/proxy "mnewscategory/mnewscategory".
// Endpoint: api/core/home/mnewscategory/mnewscategory (method read_data/process_*).
// Backend: appservice/app/Models/Mmnewscategory.php.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mnewscategory/mnewscategory';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid kategori berita (paging + filter kolom + sorting server).
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

// read_active: daftar kategori aktif (kode + nama) untuk dropdown.
export async function read_active() {
  return apiPost(SEGMENT, {
    method: 'read_active',
  });
}

// process_create: tambah kategori (vdata JSON string).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

// process_update: ubah kategori.
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// change_status: aktif/nonaktif kategori.
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: hapus kategori.
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}
