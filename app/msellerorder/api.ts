// API menu msellerorder — padanan store/proxy "msellerorder/msellerorder".
// Endpoint: api/core/home/msellerorder/msellerorder.
// Backend: appservice/app/Models/Mmsellerorder.php (mesin Mmorder yang sama).
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/msellerorder/msellerorder';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid pesanan (default paling mendesak; paging + filter + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; paystatus?: string; sellerid?: string;
  courier?: string; date_from?: string; date_to?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, paystatus: opts.paystatus, sellerid: opts.sellerid,
    courier: opts.courier, date_from: opts.date_from, date_to: opts.date_to,
  });
}

// read_sellers: daftar penjual untuk filter.
export async function read_sellers() {
  return apiPost(SEGMENT, {
    method: 'read_sellers',
  });
}

// read_summary: perlu diproses/dikirim, terlambat, keluhan, selesai.
export async function read_summary() {
  return apiPost(SEGMENT, {
    method: 'read_summary',
  });
}

// read_detail: pesanan + item + riwayat + keluhan.
export async function read_detail(orderid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ ORDERID: orderid }),
  });
}

// process_process/process_ship/process_cancel: proses, kirim+resi, batalkan.
export async function process_process(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_process',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_ship(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_ship',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_cancel(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_cancel',
    vdata: JSON.stringify(vdata),
  });
}

// process_return: pengembalian via keluhan (stok opsional kembali).
export async function process_return(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_return',
    vdata: JSON.stringify(vdata),
  });
}

// process_complaint_respond: tanggapi keluhan.
export async function process_complaint_respond(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_complaint_respond',
    vdata: JSON.stringify(vdata),
  });
}
