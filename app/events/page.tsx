import type { Metadata } from 'next';
import { serverPortal } from '@/lib/portal/server';
import EventsClient from './EventsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Event' };

export default async function EventsPage() {
  const sp = await serverPortal('portal/public/cities', {});
  const cities = (sp?.rows as any[]) || [];
  return (
    <EventsClient
      cities={cities.map((c) => ({ CITYCODE: String(c.CITYCODE || ''), CITYNAME: String(c.CITYNAME || ''), CITYPROV: String(c.CITYPROV || '') }))}
    />
  );
}