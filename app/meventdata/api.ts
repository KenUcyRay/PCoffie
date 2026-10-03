// API menu meventdata — padanan store/proxy "meventdata/meventdata".
// Endpoint: api/core/home/meventdata/meventdata.
// Backend: appservice/app/Models/Mmeventdata.php. Hapus hanya DRAFT perawan.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/meventdata/meventdata';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid event (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; catcode?: string; citycode?: string;
  date_from?: string; date_to?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, catcode: opts.catcode, citycode: opts.citycode,
    date_from: opts.date_from, date_to: opts.date_to,
  });
}

// read_detail: satu event + kuota/terjual.
export async function read_detail(eventid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ EVENTID: eventid }),
  });
}

// read_dropdown: event untuk dropdown (default hanya yang belum selesai).
export async function read_dropdown(opts: { q?: string; open_only?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_dropdown',
    q: opts.q, open_only: opts.open_only,
  });
}

// process_create/process_update: tambah/ubah (vdata JSON).
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

// Aksi status: publish/unpublish/cancel/duplicate/delete.
export async function process_publish(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_publish',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_unpublish(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_unpublish',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_cancel(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_cancel',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_duplicate(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_duplicate',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}

// upload_poster: multipart (bukan JSON). Return {success, path, message}.
export async function upload_poster(file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_poster');
  fd.append('poster', file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// URL penuh file dari path relatif DB (mis. uploads/event/x.png).
export function posterUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}

// read_cat_active/read_city_active: dropdown kategori & kota aktif
// (endpoint halaman lain, tanpa paging).
export async function read_cat_active() {
  return apiPost('home/cpcategory/cpcategory', {
    method: 'read_active',
  });
}

export async function read_city_active() {
  return apiPost('home/cpcity/cpcity', {
    method: 'read_active',
  });
}
