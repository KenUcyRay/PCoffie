// API menu mhome (Discovery Home) — hanya baca.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mhome/mhome';

export async function read_summary() {
  return apiPost(SEGMENT, { method: 'read_summary' });
}

export async function read_events(limit = 6) {
  return apiPost(SEGMENT, { method: 'read_events', limit });
}

export async function read_news(limit = 4) {
  return apiPost(SEGMENT, { method: 'read_news', limit });
}

export async function read_promos(limit = 4) {
  return apiPost(SEGMENT, { method: 'read_promos', limit });
}

// Banner aktif pada posisi tertentu (HOME_TOP / HOME_SECOND / EVENT_LIST_TOP).
// Banner diambil lewat AdServe::forPosition: tidak ada pencatatan view/click.
export async function read_banner(poscode = 'HOME_TOP', max = 3) {
  return apiPost(SEGMENT, { method: 'read_banner', poscode, max });
}