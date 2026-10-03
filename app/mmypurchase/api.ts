// API menu mmypurchase — padanan store/proxy "mmypurchase/mmypurchase".
// Endpoint: api/core/home/mmypurchase/mmypurchase.
// Backend: appservice/app/Models/Mmmypurchase.php (mesin Mmorder).
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mmypurchase/mmypurchase';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid pesanan (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; status?: string; paystatus?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    status: opts.status, paystatus: opts.paystatus,
  });
}

// read_sellers: penjual aktif untuk form (tanpa akses lain).
export async function read_sellers() {
  return apiPost(SEGMENT, {
    method: 'read_sellers',
  });
}

// read_products: produk layak jual satu penjual untuk form (tanpa akses lain).
export async function read_products(sellerid: number | string, q?: string) {
  return apiPost(SEGMENT, {
    method: 'read_products',
    vdata: JSON.stringify({ SELLERID: sellerid }),
    q: q || '',
  });
}

// read_summary: jumlah per status + menunggu bayar.
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

// process_create: buat pesanan (transaksi + idempotency).
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

// process_cancel/process_pay/process_receive: batal, lunas, terima.
export async function process_cancel(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_cancel',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_pay(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_pay',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_receive(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_receive',
    vdata: JSON.stringify(vdata),
  });
}

// process_complaint/process_complaint_close: keluhan.
export async function process_complaint(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_complaint',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_complaint_close(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_complaint_close',
    vdata: JSON.stringify(vdata),
  });
}
