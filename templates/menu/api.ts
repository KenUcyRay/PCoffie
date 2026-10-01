// TEMPLATE api — padanan store/proxy "<model>/<model>" langit_v2.
// Cara pakai: ganti SEGMENT dengan "model/model" backend tujuan
// (mis. 'home/msupplier/msupplier'), dan sesuaikan nama method
// (read_data/process_create/process_update/process_delete) dengan
// method di Model PHP appservice (M<model>.php).
import { apiPost } from '@/lib/api';

// GANTI: segmen endpoint backend, mis. 'home/msupplier/msupplier'.
const SEGMENT = 'home/mod/mod';

// read_data: isi grid (paging + filter per kolom). Backend harus mengembalikan
// { success:'true', Rows, TotalRows } dan menerima limit/offset/q.
export async function read_data(opts: { limit?: number; offset?: number; q?: string; filters?: Record<string, string> } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}

// process_create: tambah data (vheader + vdata, keduanya JSON string).
export async function process_create(vheader: unknown, vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vheader: JSON.stringify(vheader),
    vdata: JSON.stringify(vdata),
  });
}

// process_update: ubah data.
export async function process_update(vheader: unknown, vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vheader: JSON.stringify(vheader),
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: hapus data.
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}
