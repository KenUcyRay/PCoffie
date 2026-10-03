// API menu mpromocode — padanan store/proxy "mpromocode/mpromocode".
// Endpoint: api/core/home/mpromocode/mpromocode.
// Backend: appservice/app/Models/Mmpromocode.php. Tanpa hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mpromocode/mpromocode';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid promo (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; disctype?: string; scopetype?: string; status?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    disctype: opts.disctype, scopetype: opts.scopetype, status: opts.status,
  });
}

// read_summary: jumlah per status tampilan + total potongan diberikan.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_detail: satu promo + cakupannya.
export async function read_detail(promoid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ PROMOID: promoid }),
  });
}

// read_usage: riwayat pemakaian satu promo (paging).
export async function read_usage(promoid: number, limit = 25, offset = 0) {
  return apiPost(SEGMENT, {
    method: 'read_usage',
    limit, offset,
    vdata: JSON.stringify({ PROMOID: promoid }),
  });
}

// process_create/process_update: tambah/ubah (aturan kunci backend).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// change_status: aktif/nonaktif (ISACTIVE YES/NO).
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: hapus (hanya yang belum pernah dipakai).
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}

// test_code: uji kode tanpa mencatat pemakaian -> VALID/REASON/DISCOUNT.
export async function test_code(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'test_code',
    vdata: JSON.stringify(vdata),
  });
}
