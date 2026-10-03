// API menu cp_menu — padanan store/proxy "cpmenu/cpmenu".
// Endpoint: api/core/home/cpmenu/cpmenu (method read_tree/read_detail/process_update).
// Backend: appservice/app/Models/Mcpmenu.php. Tanpa create/delete.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpmenu/cpmenu';

// read_tree: struktur induk-child satu module (tanpa paging; tree butuh utuh).
export async function read_tree(opts: { mmodule: string; q?: string } = { mmodule: '' }) {
  return apiPost(SEGMENT, {
    method: 'read_tree',
    vdata: JSON.stringify({ MMODULE: opts.mmodule }),
    q: opts.q,
  });
}

// read_modules: daftar module untuk dropdown (pakai SEGMENT module, route generik sama).
export async function read_modules() {
  return apiPost('home/cpmatrix/cpmatrix', {
    method: 'read_data',
    limit: 0,
  });
}

// read_detail: 1 menu + jumlah group yang punya akses.
export async function read_detail(mcode: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ MCODE: mcode }),
  });
}

// process_update: ubah nama + urutan + expand (struktur tidak boleh berubah).
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}
