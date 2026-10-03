// API menu mwithdraw — padanan store/proxy "mwithdraw/mwithdraw".
// Endpoint: api/core/home/mwithdraw/mwithdraw.
// Backend: appservice/app/Models/Mmwithdraw.php. Tanpa hapus.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/mwithdraw/mwithdraw';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid penarikan (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; sellerid?: number | string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, sellerid: opts.sellerid,
  });
}

// read_detail: satu penarikan lengkap.
export async function read_detail(withdrawalid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ WITHDRAWALID: withdrawalid }),
  });
}

// read_summary: jumlah per status + nominal menunggu.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_sellers/read_accounts/read_rule: opsi form + aturan fee.
export async function read_sellers() {
  return apiPost(SEGMENT, {
    method: 'read_sellers',
  });
}

export async function read_accounts(sellerid: number) {
  return apiPost(SEGMENT, {
    method: 'read_accounts',
    vdata: JSON.stringify({ SELLERID: sellerid }),
  });
}

export async function read_rule() {
  return apiPost(SEGMENT, {
    method: 'read_rule',
  });
}

// process_request: ajukan (kunci dana di AVAILABLE).
export async function process_request(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_request',
    vdata: JSON.stringify(vdata),
  });
}

// process: DIAJUKAN -> DIPROSES.
export async function process(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process',
    vdata: JSON.stringify(vdata),
  });
}

// settle: DIPROSES -> BERHASIL (referensi + tanggal transfer wajib).
export async function settle(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'settle',
    vdata: JSON.stringify(vdata),
  });
}

// fail: -> DITOLAK/GAGAL (alasan wajib, dana kembali).
export async function fail(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'fail',
    vdata: JSON.stringify(vdata),
  });
}

// upload_proof: bukti transfer via multipart (bukan JSON).
export async function upload_proof(withdrawalid: number, file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_proof');
  fd.append('WITHDRAWALID', String(withdrawalid));
  fd.append('PROOF', file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// read_export: CSV mengikuti filter status.
export async function read_export(status?: string) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    status,
  });
}

// URL penuh file bukti dari nama file DB.
export function proofUrl(name?: string | null): string {
  if (!name) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/uploads/finance/${String(name).replace(/^\/+/, '')}`;
}
