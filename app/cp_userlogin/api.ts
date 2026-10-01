// API menu cp_userlogin — padanan store/proxy "cpuserlogin/cpuserlogin".
// Endpoint: api/core/home/cpuserlogin/cpuserlogin (method read_data/process_*).
// Backend: appservice/app/Models/Mcpuserlogin.php.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpuserlogin/cpuserlogin';

// read_data: grid user login (paging + pencarian).
export async function read_data(opts: { limit?: number; offset?: number; q?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
  });
}

// read_group_combo: isi combobox pilihan group waktu tambah/edit user.
export async function read_group_combo() {
  return apiPost(SEGMENT, {
    method: 'read_group_combo',
  });
}

// process_create: create_user (vdata JSON string).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'create_user',
    vdata: JSON.stringify(vdata),
  });
}

// process_update: update_user.
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'update_user',
    vdata: JSON.stringify(vdata),
  });
}

// process_delete: delete_user.
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'delete_user',
    vdata: JSON.stringify(vdata),
  });
}
