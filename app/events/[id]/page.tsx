import { serverPortal } from '@/lib/portal/server';
import EventDetailClient from './EventDetailClient';

// Halaman publik dirender di server: detail event, tipe tiket, sisa kuota,
// dan promo event ini sudah ada di HTML pertama.
export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id || 0);
  const sp: any = await serverPortal('portal/public/event', { eventid: id });
  const cities: any = await serverPortal('portal/public/cities', {});
  return (
    <EventDetailClient
      initial={sp}
      cities={((cities?.rows as any[]) || []).map((c) => ({ CITYCODE: String(c.CITYCODE || ''), CITYNAME: String(c.CITYNAME || '') }))}
    />
  );
}