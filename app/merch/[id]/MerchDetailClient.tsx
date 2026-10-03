'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty } from '@/components/portal/ui';

export default function MerchDetailClient({ initial, cities }: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  const router = useRouter();
  const p = initial?.product as any;
  const images: string[] = (initial?.images as string[]) || [];
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState('');

  if (!p) {
    return (
      <PortalShell cities={cities}>
        <PfEmpty title="Produk tidak ditemukan" action={<Link href={`/merch`} className="pf-btn pf-btn-sm">Katalog merchandise</Link>} />
      </PortalShell>
    );
  }

  const add = async () => {
    setMsg('');
    const r: any = await portalPost('portal/cart', { action: 'add', productid: p.PRODUCTID, qty });
    if (!isOk(r)) {
      setMsg(String(r?.message || 'Gagal menambah.'));
      return;
    }
    router.push(`/cart/`);
  };

  return (
    <PortalShell cities={cities}>
      <div className="pf-grid pf-grid-2" style={{ alignItems: 'start' }}>
        <div className="pf-card">
          <img src={assetUrl(p.IMAGE || images[0])} alt={p.NAME} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
        </div>

        <div className="pf-col" style={{ gap: 14 }}>
          <div className="pf-card">
            <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
              <div className="pf-row pf-wrapx pf-gap-sm">
                {p.CATEGORY ? <PfBadge>{p.CATEGORY}</PfBadge> : null}
                <PfBadge tone={p.STOCK > 0 ? 'ok' : 'danger'}>{p.STOCK > 0 ? `Stok ${p.STOCK}` : 'Habis'}</PfBadge>
                {p.SELLER?.SELLERNAME ? <PfBadge>{p.SELLER.SELLERNAME}</PfBadge> : null}
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 850, letterSpacing: '-.02em' }}>{p.NAME}</h1>
              <span className="pf-price" style={{ fontSize: 20 }}>{rp(p.PRICE)}</span>
              {p.DESCR ? <div className="pf-dim">{p.DESCR}</div> : null}
              {msg ? <div className="pf-alert pf-alert-error">{msg}</div> : null}
              <div className="pf-row pf-gap-sm">
                <div className="pf-qty">
                  <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => setQty((n) => Math.min(Math.max(1, p.STOCK), n + 1))}>+</button>
                </div>
                <button className="pf-btn" type="button" disabled={p.STOCK <= 0} onClick={add}>Tambah ke keranjang</button>
              </div>
              <Link href={`/cart`} className="pf-tiny">Lihat keranjang</Link>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}