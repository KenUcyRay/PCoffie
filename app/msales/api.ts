// API menu msales — padanan store/proxy "msales/msales".
// Endpoint: api/core/home/msales/msales. Read-only report.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/msales/msales';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_ticket: ringkasan + per event + tren (default bulan ini).
export async function read_ticket(opts: { paidfrom?: string; paidto?: string; eventid?: string; category?: string; city?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_ticket',
    paidfrom: opts.paidfrom, paidto: opts.paidto,
    eventid: opts.eventid, category: opts.category, city: opts.city,
  });
}

// read_merch: ringkasan + per penjual + tren.
export async function read_merch(opts: { paidfrom?: string; paidto?: string; sellerid?: string; category?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_merch',
    paidfrom: opts.paidfrom, paidto: opts.paidto,
    sellerid: opts.sellerid, category: opts.category,
  });
}

// read_platform: komponen pendapatan platform + tren + rincian per jenis.
export async function read_platform(opts: { paidfrom?: string; paidto?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_platform',
    paidfrom: opts.paidfrom, paidto: opts.paidto,
  });
}

// read_adjustments: refund/pembatalan setelah payout BERHASIL.
export async function read_adjustments(opts: { paidfrom?: string; paidto?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_adjustments',
    paidfrom: opts.paidfrom, paidto: opts.paidto,
  });
}

// read_filters: pilihan event/kategori/kota/seller.
export async function read_filters() {
  return apiPost(SEGMENT, {
    method: 'read_filters',
  });
}

// read_export: CSV per tab -> {filename, csv_base64}.
export async function read_export(tab: string, opts: { paidfrom?: string; paidto?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    tab, paidfrom: opts.paidfrom, paidto: opts.paidto,
  });
}
