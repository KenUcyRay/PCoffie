// API menu mpayment — padanan store/proxy "mpayment/mpayment".
// Endpoint: api/core/home/mpayment/mpayment.
// Backend: appservice/app/Models/Mmpayment.php (+PaymentService). Tanpa hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mpayment/mpayment';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid pembayaran (range default bulan ini, maks 1 tahun).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; paidfrom?: string; paidto?: string; reftype?: string;
  paymethodid?: number | string; status?: string; eventid?: number | string;
  sellerid?: number | string; source?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    paidfrom: opts.paidfrom, paidto: opts.paidto, reftype: opts.reftype,
    paymethodid: opts.paymethodid, status: opts.status,
    eventid: opts.eventid, sellerid: opts.sellerid, source: opts.source,
  });
}

// read_detail: satu pembayaran + rincian + invoice + riwayat refund.
export async function read_detail(paymentid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ PAYMENTID: paymentid }),
  });
}

// read_summary: angka ringkasan pada rentang terpilih.
export async function read_summary(paidfrom?: string, paidto?: string) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    paidfrom, paidto,
  });
}

// search_payable: referensi yang boleh dibayar (untuk form catat).
export async function search_payable(reftype: string, q?: string) {
  return apiPost(SEGMENT, {
    method: 'search_payable',
    vdata: JSON.stringify({ REFTYPE: reftype, Q: q || '' }),
  });
}

// read_methods: metode aktif + biaya + batas (untuk form catat).
export async function read_methods() {
  return apiPost(SEGMENT, {
    method: 'read_methods',
  });
}

// process_record/process_cancel: catat/batal via layanan pusat.
export async function process_record(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_record',
    vdata: JSON.stringify(vdata),
  });
}

// preview_record: pratinjau hitungan TANPA menulis (ringkasan + uji promo).
export async function preview_record(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'preview_record',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_cancel(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_cancel',
    vdata: JSON.stringify(vdata),
  });
}

// read_consistency: pemeriksaan konsistensi sumber vs pembayaran.
export async function read_consistency() {
  return apiPost(SEGMENT, {
    method: 'read_consistency',
  });
}

// read_export: CSV mengikuti filter aktif -> {filename, csv_base64, total}.
export async function read_export(opts: {
  paidfrom?: string; paidto?: string; reftype?: string; status?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    paidfrom: opts.paidfrom, paidto: opts.paidto,
    reftype: opts.reftype, status: opts.status,
  });
}
