// API menu cp_message_send — padanan store/proxy "cpmessagesend/cpmessagesend".
// Endpoint: api/core/home/cpmessagesend/cpmessagesend.
// Backend: appservice/app/Models/Mcpmessagesend.php. Tanpa ubah/hapus pesan.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpmessagesend/cpmessagesend';

export type TargetType = 'ALL' | 'GROUP' | 'USER' | '';

export type SendForm = {
  TITLE: string;
  BODY: string;
  PRIORITY: string;
  TARGETTYPE: TargetType;
  TARGET: (number | string)[];
  EXPIRESAT: string;
};

// read_groups: pilihan group untuk target GROUP.
export async function read_groups() {
  return apiPost(SEGMENT, {
    method: 'read_groups',
  });
}

// read_users: cari user aktif untuk target USER.
export async function read_users(q?: string) {
  return apiPost(SEGMENT, {
    method: 'read_users',
    q: q || '',
  });
}

// preview_count: hitung penerima sebelum kirim.
export async function preview_count(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'preview_count',
    vdata: JSON.stringify(vdata),
  });
}

// process_send: kirim pesan (atomik + idempotency key anti klik ganda).
export async function process_send(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_send',
    vdata: JSON.stringify(vdata),
  });
}
