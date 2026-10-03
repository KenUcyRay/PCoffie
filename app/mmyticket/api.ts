// API menu mmyticket — padanan store/proxy "mmyticket/mmyticket".
// Endpoint: api/core/home/mmyticket/mmyticket.
// Backend: appservice/app/Models/Mmmyticket.php. Tanpa tambah/ubah tiket.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mmyticket/mmyticket';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid tiket (event opsional; paging + filter + sorting server).
export async function read_data(opts: {
  eventid?: number | string; limit?: number; offset?: number; q?: string;
  filters?: Record<string, string>; sort?: SortState; paystatus?: string;
  attendstatus?: string; tiketstatus?: string; tickettypeid?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    vdata: JSON.stringify({ EVENTID: opts.eventid ?? '' }),
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    paystatus: opts.paystatus, attendstatus: opts.attendstatus,
    tiketstatus: opts.tiketstatus, tickettypeid: opts.tickettypeid,
  });
}

// read_summary: total, aktif, dipakai, dibatalkan.
export async function read_summary(eventid?: number | string) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    vdata: JSON.stringify({ EVENTID: eventid ?? '' }),
  });
}

// read_detail/read_token: satu tiket + token QR + flag QRACTIVE.
export async function read_detail(attendeeid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ ATTENDEEID: attendeeid }),
  });
}

// process_regen: buat ulang QR (versi naik, alasan wajib).
export async function process_regen(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_regen',
    vdata: JSON.stringify(vdata),
  });
}

// process_resend: kirim ulang tiket via template TICKET_ISSUED.
export async function process_resend(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_resend',
    vdata: JSON.stringify(vdata),
  });
}

// process_cancel: batalkan tiket (aturan Attendee List).
export async function process_cancel(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_cancel',
    vdata: JSON.stringify(vdata),
  });
}
