// API menu meventcategory (Discovery) — ringkasan event per kategori.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/meventcategory/meventcategory';

// read_summary: per kategori (aktif), jumlah + tiket terjual + hampir habis/sold out.
export async function read_summary(opts: { city?: string; datefrom?: string; dateto?: string } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_summary',
    city: opts.city, datefrom: opts.datefrom, dateto: opts.dateto,
  });
}
