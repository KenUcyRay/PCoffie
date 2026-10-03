// API menu cp_notification_template — padanan store/proxy "cpnotificationtemplate/cpnotificationtemplate".
// Endpoint: api/core/home/cpnotificationtemplate/cpnotificationtemplate.
// Backend: appservice/app/Models/Mcpnotificationtemplate.php. Tanpa tambah/hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpnotificationtemplate/cpnotificationtemplate';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid template (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; channel?: string; isactive?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    channel: opts.channel, isactive: opts.isactive,
  });
}

// read_detail: satu template + daftar penanda + bawaan.
export async function read_detail(templateid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ TEMPLATEID: templateid }),
  });
}

// process_update: ubah judul + isi + status (kode/saluran terkunci).
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// reset_default: kembalikan judul + isi dari bawaan.
export async function reset_default(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'reset_default',
    vdata: JSON.stringify(vdata),
  });
}

// preview: render judul + isi form (belum disimpan) dengan contoh nilai.
export async function preview(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'preview',
    vdata: JSON.stringify(vdata),
  });
}

// send_test_email: kirim template terrender (contoh) ke satu alamat.
export async function send_test_email(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'send_test_email',
    vdata: JSON.stringify(vdata),
  });
}
