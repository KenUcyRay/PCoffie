// API menu cp_fee — padanan store/proxy "cpfee/cpfee".
// Endpoint: api/core/home/cpfee/cpfee. Backend: appservice/app/Models/Mcpfee.php.
// Catatan: tidak ada endpoint ubah/hapus — versi dibuat baru atau dibatalkan.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpfee/cpfee';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_effective: pengaturan yang sedang berlaku (opsional pada tanggal).
export async function read_effective(date?: string) {
  return apiPost(SEGMENT, {
    method: 'read_effective',
    vdata: JSON.stringify(date ? { date } : {}),
  });
}

// read_scheduled: versi mendatang terdekat yang terjadwal (bisa kosong).
export async function read_scheduled() {
  return apiPost(SEGMENT, {
    method: 'read_scheduled',
  });
}

// read_history: riwayat versi (paging + filter kolom + sorting server).
export async function read_history(opts: { limit?: number; offset?: number; q?: string; filters?: Record<string, string>; sort?: SortState } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_history',
    limit: opts.limit,
    offset: opts.offset,
    q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key,
    dir: opts.sort?.dir,
  });
}

// process_create: buat versi baru (vdata JSON string).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

// cancel_version: batalkan versi mendatang.
export async function cancel_version(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'cancel_version',
    vdata: JSON.stringify(vdata),
  });
}
