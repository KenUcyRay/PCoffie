// API menu cp_syslog — read-only: list, detail, ringkasan.
// SEGMENT frontend: home/cpsyslog/cpsyslog (method read_data/read_detail/read_summary).
// Backend: appservice/app/Models/Mcpsyslog.php.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpsyslog/cpsyslog';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid system log (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; level?: string; source?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    level: opts.level, source: opts.source,
  });
}

// read_detail: 1 baris lengkap (konteks + stack trace).
export async function read_detail(syslogid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ SYSLOGID: syslogid }),
  });
}

// read_summary: jumlah per level pada rentang terpilih.
export async function read_summary(opts: { date_from?: string; date_to?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    date_from: opts.date_from, date_to: opts.date_to,
  });
}
