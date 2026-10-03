// API menu mbank — padanan store/proxy "mbank/mbank".
// Endpoint: api/core/home/mbank/mbank.
// Backend: appservice/app/Models/Mmbank.php. Tanpa hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mbank/mbank';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_data: grid rekening (paging + filter bar + filter kolom + sorting).
export async function read_data(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; ownertype?: string; bankid?: number | string;
  verifystatus?: string; status?: string; isprimary?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    ownertype: opts.ownertype, bankid: opts.bankid,
    verifystatus: opts.verifystatus, status: opts.status, isprimary: opts.isprimary,
  });
}

// read_detail: satu rekening (+penanda pemakaian, tanpa nomor utuh).
export async function read_detail(bankaccountid: number) {
  return apiPost(SEGMENT, {
    method: 'read_detail',
    vdata: JSON.stringify({ BANKACCOUNTID: bankaccountid }),
  });
}

// read_eligible: rekening layak pakai per pemilik (dropdown halaman lain).
export async function read_eligible(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'read_eligible',
    vdata: JSON.stringify(vdata),
  });
}

// read_banks/read_sellers/read_orgs: opsi dropdown form.
export async function read_banks() {
  return apiPost(SEGMENT, {
    method: 'read_banks',
  });
}

export async function read_sellers() {
  return apiPost(SEGMENT, {
    method: 'read_sellers',
  });
}

export async function read_orgs(q?: string) {
  return apiPost(SEGMENT, {
    method: 'read_orgs',
    q: q || '',
  });
}

// process_create/process_update: tambah/ubah.
export async function process_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_create',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// set_primary: jadikan utama.
export async function set_primary(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'set_primary',
    vdata: JSON.stringify(vdata),
  });
}

// change_status: AKTIF/NONAKTIF.
export async function change_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_status',
    vdata: JSON.stringify(vdata),
  });
}

// process_verify: TERIMA/TOLAK (+VERIFYNOTE untuk TOLAK).
export async function process_verify(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_verify',
    vdata: JSON.stringify(vdata),
  });
}

// reveal: tampilkan nomor utuh (tercatat di Audit Log).
export async function reveal(bankaccountid: number) {
  return apiPost(SEGMENT, {
    method: 'reveal',
    vdata: JSON.stringify({ BANKACCOUNTID: bankaccountid }),
  });
}

// process_delete: hapus (hanya yang belum pernah dipakai).
export async function process_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_delete',
    vdata: JSON.stringify(vdata),
  });
}
