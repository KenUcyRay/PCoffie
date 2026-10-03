// API menu cp_message_history — padanan store/proxy "cpmessagehistory/cpmessagehistory".
// Endpoint: api/core/home/cpmessagehistory/cpmessagehistory.
// Backend: appservice/app/Models/Mcpmessagehistory.php. Tanpa ubah isi/hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpmessagehistory/cpmessagehistory';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid pesan (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; priority?: string;
  targettype?: string; status?: string; sender?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    priority: opts.priority, targettype: opts.targettype,
    status: opts.status, sender: opts.sender,
  });
}

// read_detail: satu pesan + agregat terbaca.
export async function read_detail(msgid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ MSGID: msgid }),
  });
}

// read_recipients: penerima satu pesan (paging + cari + filter status baca).
export async function read_recipients(opts: { msgid: number; limit?: number; offset?: number; q?: string; readstatus?: string }) {
  return apiPost(SEGMENT, {
    method: 'read_recipients',
    vdata: JSON.stringify({ MSGID: opts.msgid }),
    limit: opts.limit, offset: opts.offset, q: opts.q, readstatus: opts.readstatus,
  });
}

// read_summary: pesan terkirim/ditarik + total penerima dan terbaca.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// process_recall: tarik pesan (alasan wajib, tanpa hapus fisik).
export async function process_recall(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_recall',
    vdata: JSON.stringify(vdata),
  });
}
