// API menu mattendee — padanan store/proxy "mattendee/mattendee".
// Endpoint: api/core/home/mattendee/mattendee.
// Backend: appservice/app/Models/Mmattendee.php. Tanpa hapus permanen.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mattendee/mattendee';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

export type ImportRow = {
  TYPENAME: string;
  NAME: string;
  EMAIL: string;
  PHONE: string;
  PAYSTATUS: string;
};

// read_data: peserta satu event (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  eventid: number; limit?: number; offset?: number; q?: string;
  filters?: Record<string, string>; sort?: SortState; paystatus?: string;
  attendstatus?: string; tiketstatus?: string; tickettypeid?: string;
} = { eventid: 0 }) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    vdata: JSON.stringify({ EVENTID: opts.eventid }),
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    paystatus: opts.paystatus, attendstatus: opts.attendstatus,
    tiketstatus: opts.tiketstatus, tickettypeid: opts.tickettypeid,
  });
}

// read_summary: total, lunas, belum bayar, hadir, persen hadir.
export async function read_summary(eventid: number) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    vdata: JSON.stringify({ EVENTID: eventid }),
  });
}

// read_detail: satu peserta.
export async function read_detail(attendeeid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ ATTENDEEID: attendeeid }),
  });
}

// process_create/process_update_contact: tambah manual + ubah kontak.
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_update_contact(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update_contact',
    vdata: JSON.stringify(vdata),
  });
}

// process_paystatus/process_checkin/process_uncheckin/process_cancel.
export async function process_paystatus(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_paystatus',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_checkin(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_checkin',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_uncheckin(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_uncheckin',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_cancel(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_cancel',
    vdata: JSON.stringify(vdata),
  });
}

// import_preview/import_commit: validasi + simpan CSV (baris sebagai JSON).
export async function import_preview(eventid: number, rows: ImportRow[]) {
  return apiPost(SEGMENT, {
    method: 'import_preview',
    vdata: JSON.stringify({ EVENTID: eventid, ROWS: rows }),
  });
}

export async function import_commit(eventid: number, rows: ImportRow[], skipInvalid: boolean) {
  return apiPost(SEGMENT, {
    method: 'import_commit',
    vdata: JSON.stringify({ EVENTID: eventid, ROWS: rows, SKIPINVALID: skipInvalid ? 'YES' : 'NO' }),
  });
}

// read_export: CSV mengikuti filter (maks 10.000 baris).
export async function read_export(opts: {
  eventid: number; q?: string; paystatus?: string; attendstatus?: string;
  tiketstatus?: string;
}) {
  return apiPost(SEGMENT, {
    method: 'read_export',
    vdata: JSON.stringify({ EVENTID: opts.eventid }),
    q: opts.q, paystatus: opts.paystatus,
    attendstatus: opts.attendstatus, tiketstatus: opts.tiketstatus,
  });
}
