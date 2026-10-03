import { serverPortal } from '@/lib/portal/server';
import MerchDetailClient from './MerchDetailClient';

export const dynamic = 'force-dynamic';

export default async function MerchDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id || 0);
  const sp = await serverPortal('portal/public/product', { productid: id });
  const cities = await serverPortal('portal/public/cities', {});
  return (
    <MerchDetailClient
      initial={sp || null}
      cities={((cities?.rows as any[]) || []).map((c) => ({ CITYCODE: String(c.CITYCODE || ''), CITYNAME: String(c.CITYNAME || '') }))}
    />
  );
}