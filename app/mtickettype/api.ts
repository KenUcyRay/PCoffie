// API menu mtickettype — padanan store/proxy "mtickettype/mtickettype".
// Endpoint: api/core/home/mtickettype/mtickettype.
// Backend: appservice/app/Models/Mmtickettype.php. Hapus hanya tipe tanpa peserta.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mtickettype/mtickettype';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: tipe tiket satu event (paging + filter kolom + sorting server).
export async function read_data(opts: {
  eventid: number; limit?: number; offset?: number; q?: string;
  filters?: Record<string, string>; sort?: SortState;
}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    vdata: JSON.stringify({ EVENTID: opts.eventid }),
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
  });
}

// read_summary: total kuota, terjual, sisa, potensi pendapatan satu event.
export async function read_summary(eventid: number) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    vdata: JSON.stringify({ EVENTID: eventid }),
  });
}

// process_create/process_update: tambah/ubah tipe.
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

// change_status/change_order/process_delete: status, urutan, hapus.
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

export async function change_order(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_order',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}
