// API menu minvoice — padanan store/proxy "minvoice/minvoice".
// Endpoint: api/core/home/minvoice/minvoice.
// Backend: appservice/app/Models/Minvoice.php. Read-only (tanpa hapus).
import { apiPost, getApiBase } from '@/lib/api';

const SEGMENT = 'home/minvoice/minvoice';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid invoice (range default bulan ini, maks 1 tahun).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; datefrom?: string; dateto?: string;
  reftype?: string; status?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    datefrom: opts.datefrom, dateto: opts.dateto,
    reftype: opts.reftype, status: opts.status,
  });
}

// read_detail: invoice lengkap untuk cetak (+info refund).
export async function read_detail(invoiceid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ INVOICEID: invoiceid }),
  });
}

// read_summary: jumlah + nilai terbit vs batal.
export async function read_summary(datefrom?: string, dateto?: string) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    datefrom, dateto,
  });
}

// read_identity: kop aplikasi (nama, logo, alamat, kontak).
export async function read_identity() {
  return apiPost(SEGMENT, {
    method: 'read_identity',
  });
}

// read_export: CSV mengikuti filter aktif -> {filename, csv_base64, total}.
export async function read_export(opts: {
  datefrom?: string; dateto?: string; reftype?: string; status?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    datefrom: opts.datefrom, dateto: opts.dateto,
    reftype: opts.reftype, status: opts.status,
  });
}

// URL penuh logo dari path relatif DB (mis. uploads/setting/logo.png).
export function logoUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}
