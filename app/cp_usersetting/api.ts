// API menu cp_usersetting — padanan store/proxy "cpuser/cpuser" langit_v2.
// Endpoint: api/core/home/cpuser/cpuser (method read_data/process_*).
//
// TIDAK ada konsep department di app-core, jadi tidak ada read_akses_department
// dan tidak ada vdata daftar department lagi.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpuser/cpuser';

// read_data: isi grid. `filters` = filter per kolom (Object Column -> nilai),
// dikirim sebagai JSON string; `q` tetap didukung untuk pencarian umum.
export async function read_data(opts: { limit?: number; offset?: number; q?: string; filters?: Record<string, string> } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}

// process_create: create_user_akses.
export async function process_create(vheader: unknown) {
  return apiPost(SEGMENT, {
    method: 'create_user_akses',
    vheader: JSON.stringify(vheader),
  });
}

// process_update: edit_user_akses.
export async function process_update(vheader: unknown) {
  return apiPost(SEGMENT, {
    method: 'edit_user_akses',
    vheader: JSON.stringify(vheader),
  });
}

// process_delete: delete_user_akses.
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'delete_user_akses',
    vdata: JSON.stringify(vdata),
  });
}

// change_password: ganti password user sendiri.
export async function change_password(vheader: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_password',
    vheader: JSON.stringify(vheader),
  });
}