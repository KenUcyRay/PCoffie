// API menu mbalance — padanan store/proxy "mbalance/mbalance".
// Endpoint: api/core/home/mbalance/mbalance.
// Backend: appservice/app/Models/Mmbalance.php. Read-only (tanpa hapus).
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mbalance/mbalance';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: penjual + saldo (paging + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
  });
}

// read_summary: total tertahan/tersedia/ditarik semua penjual.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_ledger: mutasi satu penjual (paging + filter jenis/rentang).
export async function read_ledger(sellerid: number, opts: {
  limit?: number; offset?: number; entrytype?: string;
  datefrom?: string; dateto?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_ledger',
    limit: opts.limit, offset: opts.offset,
    entrytype: opts.entrytype, datefrom: opts.datefrom, dateto: opts.dateto,
    vdata: JSON.stringify({ SELLERID: sellerid }),
  });
}

// read_reconcile: selisih per penjual (0 = sehat). sellerid 0 = semua.
export async function read_reconcile(sellerid?: number) {
  return apiPost(SEGMENT, {
    method: 'read_reconcile',
    vdata: JSON.stringify({ SELLERID: sellerid || 0 }),
  });
}

// read_export: CSV mutasi -> {filename, csv_base64, total}.
export async function read_export(sellerid: number, entrytype?: string) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    entrytype,
    vdata: JSON.stringify({ SELLERID: sellerid }),
  });
}
