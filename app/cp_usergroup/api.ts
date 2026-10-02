// API menu cp_usergroup — padanan store/proxy "cpusergroup/cpusergroup" langit_v2.
import { apiPost } from '@/lib/api';

// read_data: daftar group (paging + pencarian).
export async function read_data(opts: { limit?: number; offset?: number; q?: string; filters?: Record<string, string> } = {}) {
  return apiPost('home/cpusergroup/cpusergroup', {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}

// read_akses_menu: flat list menu + flag CHECKED untuk 1 group.
export async function read_akses_menu(vdata: unknown) {
  return apiPost('home/cpusergroup/cpusergroup', {
    method: 'read_akses_menu',
    vdata: JSON.stringify(vdata),
  });
}

// process_create: buat group baru (CPMATRIX GROUP_USERLOGIN).
export async function create_group(vdata: unknown) {
  return apiPost('home/cpusergroup/cpusergroup', {
    method: 'create_group',
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: hapus group.
export async function delete_akses_group(vdata: unknown) {
  return apiPost('home/cpusergroup/cpusergroup', {
    method: 'delete_akses_group',
    vdata: JSON.stringify(vdata),
  });
}

// process_update: simpan hak akses menu group (CPMENUACCESS).
export async function update_akses_group(vheader: unknown, vdata: unknown) {
  return apiPost('home/cpusergroup/cpusergroup', {
    method: 'update_akses_group',
    vheader: JSON.stringify(vheader),
    vdata: JSON.stringify(vdata),
  });
}