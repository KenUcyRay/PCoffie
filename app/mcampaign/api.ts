// API menu mcampaign — padanan store/proxy "mcampaign/mcampaign".
// Endpoint: api/core/home/mcampaign/mcampaign.
// Backend: appservice/app/Models/Mmcampaign.php. Tanpa hapus.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/mcampaign/mcampaign';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid kampanye (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; positionid?: number | string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, positionid: opts.positionid,
  });
}

// read_summary: jumlah per status + tayang/klik hari ini + pendapatan bulan ini.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_position: daftar posisi + penghuni hari ini (tanpa paging).
export async function read_position() {
  return apiPost(SEGMENT, {
    method: 'read_position',
  });
}

// position_update: ubah tarif/kapasitas/status posisi.
export async function position_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'position_update',
    vdata: JSON.stringify(vdata),
  });
}

// read_detail: satu kampanye + 30 hari statistik.
export async function read_detail(campaignid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ CAMPAIGNID: campaignid }),
  });
}

// process_create/process_update: tambah/ubah (aturan status backend).
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

// change_status: AJUKAN/JEDA/LANJUT/BATAL (+CANCELREASON untuk BATAL).
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

// record_payment: catat bayar (MENUNGGU_BAYAR -> AKTIF, cek banner+kapasitas).
export async function record_payment(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'record_payment',
    vdata: JSON.stringify(vdata),
  });
}

// upload_banner: banner via multipart (bukan JSON).
// Return {success, message, Rows:[{BANNERIMAGE}]}.
export async function upload_banner(campaignid: number, file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_banner');
  fd.append('CAMPAIGNID', String(campaignid));
  fd.append('BANNER', file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// URL penuh file banner dari nama file DB (mis. ad-1-20261003120000.png).
export function bannerUrl(name?: string | null): string {
  if (!name) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/uploads/ads/${String(name).replace(/^\/+/, '')}`;
}
