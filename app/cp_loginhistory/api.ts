// API menu cp_loginhistory — read-only: list, ringkasan, export CSV.
// SEGMENT frontend: home/cploginhistory/cploginhistory.
// Backend: appservice/app/Models/Mcploginhistory.php.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cploginhistory/cploginhistory';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid riwayat login (paging + filter bar + filter kolom + sorting server).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; date_from?: string; date_to?: string; user?: string;
  result?: string; reason?: string; ip?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    date_from: opts.date_from, date_to: opts.date_to,
    user: opts.user, result: opts.result, reason: opts.reason, ip: opts.ip,
  });
}

// read_summary: angka sukses/gagal/diblokir + IP terbanyak gagal.
export async function read_summary(opts: { date_from?: string; date_to?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    date_from: opts.date_from, date_to: opts.date_to,
  });
}

// read_export: CSV mengikuti filter aktif (maks 10.000 baris). Dicatat sebagai EXPORT di Audit Log.
export async function read_export(opts: {
  date_from?: string; date_to?: string; user?: string; result?: string;
  reason?: string; ip?: string; q?: string; filters?: Record<string, string>;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    date_from: opts.date_from, date_to: opts.date_to,
    user: opts.user, result: opts.result, reason: opts.reason, ip: opts.ip, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}
