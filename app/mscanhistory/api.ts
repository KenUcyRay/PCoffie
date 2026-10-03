// API menu mscanhistory — padanan store/proxy "mscanhistory/mscanhistory".
// Endpoint: api/core/home/mscanhistory/mscanhistory.
// Backend: appservice/app/Models/Mmscanhistory.php. Hanya baca + export.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mscanhistory/mscanhistory';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid scan (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; eventid?: string;
  result?: string; user?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    eventid: opts.eventid, result: opts.result, user: opts.user,
  });
}

// read_summary: total, valid, dipakai, tolak (+ persen hadir per event).
export async function read_summary(eventid?: string) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    eventid: eventid || '',
  });
}

// read_export: CSV mengikuti filter aktif (maks 10.000 baris).
export async function read_export(opts: {
  date_from?: string; date_to?: string; eventid?: string;
  result?: string; user?: string; q?: string; filters?: Record<string, string>;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    date_from: opts.date_from, date_to: opts.date_to,
    eventid: opts.eventid, result: opts.result, user: opts.user, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}
