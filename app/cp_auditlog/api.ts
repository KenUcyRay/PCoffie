// API menu cp_auditlog — read-only: list, detail, export CSV.
// SEGMENT frontend: home/cpauditlog/cpauditlog (method read_data/read_detail/read_export).
// Backend: appservice/app/Models/Mcpauditlog.php.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpauditlog/cpauditlog';

// Filter bar audit log (rentang + pencarian). Semua opsional; default backend 7 hari.
export type AuditFilters = {
  date_from?: string;
  date_to?: string;
  user?: string;
  action?: string;
  page?: string;
  q?: string;
};

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid audit log (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; user?: string;
  action?: string; page?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    user: opts.user, action: opts.action, page: opts.page,
  });
}

// read_detail: 1 baris lengkap (before/after JSON).
export async function read_detail(logid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ LOGID: logid }),
  });
}

// read_export: CSV mengikuti filter aktif (maks 10.000 baris). Dicatat sebagai EXPORT.
export async function read_export(opts: {
  date_from?: string; date_to?: string; user?: string; action?: string;
  page?: string; q?: string; filters?: Record<string, string>;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    date_from: opts.date_from, date_to: opts.date_to,
    user: opts.user, action: opts.action, page: opts.page, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}
