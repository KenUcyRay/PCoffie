// API menu cp_matrix — padanan store/proxy "cpmatrix/cpmatrix".
// Endpoint: api/core/home/cpmatrix/cpmatrix (method read_data/read_detail/process_update).
// Backend: appservice/app/Models/Mcpmatrix.php. Tanpa create/delete.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpmatrix/cpmatrix';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid module (paging + filter kolom + sorting server).
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

// read_detail: 1 module + jumlah menu di dalamnya.
export async function read_detail(defid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ DEFID: defid }),
  });
}

// process_update: ubah nama + urutan + ikon (kode tidak boleh berubah).
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}
