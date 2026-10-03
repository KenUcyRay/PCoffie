// API menu mrefund — padanan store/proxy "mrefund/mrefund".
// Endpoint: api/core/home/mrefund/mrefund.
// Backend: appservice/app/Models/Mmrefund.php. Tanpa hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mrefund/mrefund';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid refund (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; eventid?: number | string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, eventid: opts.eventid,
  });
}

// read_summary: per status + nominal menunggu.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_detail: satu refund + data tiket/event.
export async function read_detail(refundid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ REFUNDID: refundid }),
  });
}

// check_ticket/search_ticket: syarat + cari tiket untuk form pengajuan.
export async function check_ticket(attendeeid: number) {
  return apiPost(SEGMENT, {
    method: 'check_ticket',
    vdata: JSON.stringify({ ATTENDEEID: attendeeid }),
  });
}

export async function search_ticket(q?: string) {
  return apiPost(SEGMENT, {
    method: 'search_ticket',
    q: q || '',
  });
}

// process_apply/process_approve/process_reject/process_finish.
export async function process_apply(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_apply',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_approve(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_approve',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_reject(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_reject',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_finish(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_finish',
    vdata: JSON.stringify(vdata),
  });
}
