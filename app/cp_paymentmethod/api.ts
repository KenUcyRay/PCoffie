// API menu cp_paymentmethod — padanan store/proxy "cppaymentmethod/cppaymentmethod".
// Endpoint: api/core/home/cppaymentmethod/cppaymentmethod (method read_data/process_*).
// Backend: appservice/app/Models/Mcppaymentmethod.php.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/cppaymentmethod/cppaymentmethod';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid metode (paging + filter kolom + sorting server).
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

// read_active: daftar metode aktif untuk halaman pembayaran nanti.
export async function read_active() {
  return apiPost(SEGMENT, {
    method: 'read_active',
  });
}

// read_bank_combo: dropdown bank aktif (via SEGMENT bank, route generik sama).
export async function read_bank_combo() {
  return apiPost('home/cpbank/cpbank', {
    method: 'read_active',
  });
}

// process_create: tambah metode (vdata JSON string).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

// process_update: ubah metode.
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// change_status: aktif/nonaktif metode.
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: hapus metode.
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}

// upload_logo: upload file logo via multipart (bukan JSON).
// Return {success, path, message}. Path relatif dari public/.
export async function upload_logo(file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_logo');
  fd.append('logo', file);
  const res = await fetch(`${getApiBase()}/home/cppaymentmethod/cppaymentmethod`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// URL penuh file logo dari path relatif DB (mis. uploads/payment/x.png).
export function logoUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}
