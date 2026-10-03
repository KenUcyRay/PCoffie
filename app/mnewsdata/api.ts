// API menu mnewsdata — padanan store/proxy "mnewsdata/mnewsdata".
// Endpoint: api/core/home/mnewsdata/mnewsdata (method read_*/process_*).
// Backend: appservice/app/Models/Mmnewsdata.php.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/mnewsdata/mnewsdata';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid berita (paging + filter kolom + sorting server).
export async function read_data(opts: { limit?: number; offset?: number; q?: string; filters?: Record<string, string>; sort?: SortState; status?: string; catcode?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key,
    dir: opts.sort?.dir,
    status: opts.status,
    catcode: opts.catcode,
  });
}

// read_summary: jumlah per status.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_detail: satu berita lengkap.
export async function read_detail(newsid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ NEWSID: newsid }),
  });
}

// process_create/process_update: tambah/ubah (isi disanitasi backend).
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

// process_publish/schedule/retract/archive/restore/delete: alur status.
export async function process_publish(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_publish',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_schedule(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_schedule',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_retract(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_retract',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_archive(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_archive',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_restore(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_restore',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}

// upload_image: gambar utama via multipart (bukan JSON).
// Return {success, path, message}. Path relatif dari public/.
export async function upload_image(file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_image');
  fd.append('image', file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// URL penuh file gambar dari path relatif DB (mis. uploads/news/x.png).
export function imageUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}
