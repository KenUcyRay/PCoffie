import { serverPortal } from '@/lib/portal/server';
import MerchClient from './MerchClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Merchandise' };

export default async function MerchPage() {
  const sp = await serverPortal('portal/public/products', { limit: 24 });
  const cities = await serverPortal('portal/public/cities', {});
  return (
    <MerchClient
      initial={sp || null}
      cities={((cities?.rows as any[]) || []).map((c) => ({ CITYCODE: String(c.CITYCODE || ''), CITYNAME: String(c.CITYNAME || '') }))}
    />
  );
}