// API menu mscanticket — padanan store/proxy "mscanticket/mscanticket".
// Endpoint: api/core/home/mscanticket/mscanticket.
// Backend: appservice/app/Models/Mmscanticket.php. Tanpa ubah/hapus.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/mscanticket/mscanticket';

// read_events: event PUBLISHED (hari ini/terdekat di atas).
export async function read_events() {
  return apiPost(SEGMENT, {
    method: 'read_events',
  });
}

// read_summary: masuk vs berhak masuk satu event.
export async function read_summary(eventid: number) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    vdata: JSON.stringify({ EVENTID: eventid }),
  });
}

// process_scan: validasi + check-in atomik (token QR atau kode manual).
export async function process_scan(vdata: { EVENTID: number; TOKEN?: string; CODE?: string; METHOD: string }) {
  return apiPost(SEGMENT, {
    method: 'process_scan',
    vdata: JSON.stringify(vdata),
  });
}
