'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

type Prod = { PRODUCTID: number; NAME: string; DESCR?: string; CATEGORY?: string; PRICE: number; STOCK: number; SELLERID: number; IMAGE: string };

export default function MerchClient({ initial, cities }: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Prod[]>((initial?.rows as Prod[]) || []);
  const [cats, setCats] = useState<string[]>((initial?.categories as string[]) || []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/public/products', { cat, q, limit: 24 }, { auth: false });
      if (isOk(r)) { setRows((r.rows as Prod[]) || []); setCats((r.categories as string[]) || []); }
      else setError(String(r?.message || 'Gagal memuat produk.'));
    } catch (e: any) { setError(e?.message || 'Gagal terhubung.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!initial) load(); /* eslint-disable-next-line */ }, []);

  const refreshCart = async () => {
    try {
      const r: any = await portalPost('portal/cart', { action: 'list' });
      if (isOk(r)) {
        const n = ((r.cart as any[]) || []).reduce((s, g) => s + (g.items || []).reduce((a: number, i: any) => a + Number(i.qty || 0), 0), 0);
        setCartCount(n);
      }
    } catch { /* belum login */ }
  };

  useEffect(() => { refreshCart(); }, []);

  const addToCart = async (p: Prod) => {
    setMsg('');
    try {
      const r: any = await portalPost('portal/cart', { action: 'add', productid: p.PRODUCTID, qty: 1 });
      if (!isOk(r)) { setMsg(String(r?.message || 'Gagal menambah ke keranjang.')); return; }
      setMsg(`${p.NAME} masuk keranjang`);
      refreshCart();
    } catch {
      router.push(`/login/?next=${encodeURIComponent('/merch/')}`);
    }
  };

  return (
    <PortalShell cities={cities}>
      <div className="pf-col" style={{ gap: 14 }}>
        <div className="pf-row-between">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Merchandise</h1>
          <Link href={`/cart`} className="pf-btn pf-btn-sm">Keranjang{cartCount ? ` (${cartCount})` : ''}</Link>
        </div>

        <form className="pf-row pf-gap-sm" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <input className="pf-input" placeholder="Cari produk…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="pf-select" style={{ maxWidth: 170 }} value={cat} onChange={(e) => { setCat(e.target.value); setTimeout(load, 0); }}>
            <option value="">Semua kategori</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="pf-btn pf-btn-sm" type="submit">Cari</button>
        </form>

        {msg ? <div className="pf-alert pf-alert-info">{msg}</div> : null}
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && rows.length === 0 ? <PfEmpty title="Produk tidak tersedia" /> : null}

        <div className="pf-grid pf-grid-auto">
          {rows.map((p) => (
            <div key={p.PRODUCTID} className="pf-card">
              <Link href={`/merch/${p.PRODUCTID}`}>
                {p.IMAGE ? <img className="pf-ev-img" src={assetUrl(p.IMAGE)} alt="" loading="lazy" /> : <div className="pf-ev-img" />}
              </Link>
              <div className="pf-card-pad pf-col" style={{ gap: 8 }}>
                <div className="pf-row-between" style={{ alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: 14.5 }}>{p.NAME}</strong>
                  <PfBadge tone={p.STOCK > 0 ? 'ok' : 'danger'}>{p.STOCK > 0 ? `Stok ${p.STOCK}` : 'Habis'}</PfBadge>
                </div>
                {p.CATEGORY ? <span className="pf-tiny">{p.CATEGORY}</span> : null}
                <div className="pf-row-between">
                  <span className="pf-price">{rp(p.PRICE)}</span>
                  <button className="pf-btn pf-btn-sm" type="button" disabled={p.STOCK <= 0} onClick={() => addToCart(p)}>+ Keranjang</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}