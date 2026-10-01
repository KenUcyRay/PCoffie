// API menu cp_usersetting — padanan store/proxy "cpuser/cpuser" langit_v2.
// Endpoint: api/core/home/cpuser/cpuser (method read_data/process_*).
import { apiPost } from '@/lib/api';

// read_data: grid user (paging + pencarian).
export async function read_data(opts: { limit?: number; offset?: number; q?: string } = {}) {
  return apiPost('home/cpuser/cpuser', {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
  });
}

// read_akses_department: Department Access milik 1 user.
export async function read_akses_department(USERLOGIN: string) {
  return apiPost('home/cpuser/cpuser', {
    method: 'read_akses_department',
    vdata: JSON.stringify({ USERLOGIN }),
  });
}

// process_create: create_user_akses (vheader + vdata dept).
export async function process_create(vheader: unknown, vdata: unknown) {
  return apiPost('home/cpuser/cpuser', {
    method: 'create_user_akses',
    vheader: JSON.stringify(vheader),
    vdata: JSON.stringify(vdata),
  });
}

// process_update: edit_user_akses.
export async function process_update(vheader: unknown, vdata: unknown) {
  return apiPost('home/cpuser/cpuser', {
    method: 'edit_user_akses',
    vheader: JSON.stringify(vheader),
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: delete_user_akses.
export async function process_delete(vdata: unknown) {
  return apiPost('home/cpuser/cpuser', {
    method: 'delete_user_akses',
    vdata: JSON.stringify(vdata),
  });
}

// change_password: ganti password user sendiri.
export async function change_password(vheader: unknown) {
  return apiPost('home/cpuser/cpuser', {
    method: 'change_password',
    vheader: JSON.stringify(vheader),
  });
}