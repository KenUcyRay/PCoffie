// API menu meventcity (Discovery) — ringkasan event per kota.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/meventcity/meventcity';

// read_summary: per kota aktif, jumlah + tiket terjual + hampir habis/sold out.
export async function read_summary(opts: { cat?: string; datefrom?: string; dateto?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    cat: opts.cat, datefrom: opts.datefrom, dateto: opts.dateto,
  });
}
