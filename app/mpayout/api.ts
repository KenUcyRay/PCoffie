// API menu mpayout — padanan store/proxy "mpayout/mpayout".
// Endpoint: api/core/home/mpayout/mpayout.
// Backend: appservice/app/Models/Mmpayout.php. Tanpa hapus.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/mpayout/mpayout';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: riwayat payout (paging + filter).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; datefrom?: string; dateto?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, datefrom: opts.datefrom, dateto: opts.dateto,
  });
}

// read_ready: event ENDED + kelayakan + estimasi bersih.
export async function read_ready(q?: string) {
  return apiPost(SEGMENT, {
    method: 'read_ready',
    q: q || '',
  });
}

// preview: rincian hitungan + alasan bila tidak layak + rekening.
export async function preview(eventid: number) {
  return apiPost(SEGMENT, {
    method: 'preview',
    vdata: JSON.stringify({ EVENTID: eventid }),
  });
}

// read_detail: satu payout + peringatan pasca-payout.
export async function read_detail(payoutid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ PAYOUTID: payoutid }),
  });
}

// process_request: ajukan (simpan snapshot hitungan).
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

// fail: -> DITOLAK/GAGAL (alasan wajib).
export async function fail(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'fail',
    vdata: JSON.stringify(vdata),
  });
}

// upload_proof: bukti transfer via multipart (bukan JSON).
export async function upload_proof(payoutid: number, file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_proof');
  fd.append('PAYOUTID', String(payoutid));
  fd.append('PROOF', file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// read_export: CSV riwayat -> {filename, csv_base64, total}.
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
