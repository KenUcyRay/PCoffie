import { serverPortal } from '@/lib/portal/server';
import NewsClient from './NewsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Berita' };

export default async function NewsPage() {
  const [list, cities] = await Promise.all([
    serverPortal('portal/public/news', { limit: 30 }),
    serverPortal('portal/public/cities', {}),
  ]);
  return (
    <NewsClient
      initial={list || null}
      cities={((cities?.rows as any[]) || []).map((c) => ({ CITYCODE: String(c.CITYCODE || ''), CITYNAME: String(c.CITYNAME || '') }))}
    />
  );
}
