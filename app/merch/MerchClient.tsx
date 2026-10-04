'use client';

// =============================================================================
// KATALOG MERCHANDISE
// -----------------------------------------------------------------------------
// Pemanggilan API tidak berubah. Tampilan: bar filter lengket, kartu produk
// dengan proporsi gambar tetap, dan tombol aksi yang tidak lagi meluap dari kartu.
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfEmpty, PfError, PfLoadingGrid, PfReveal,
  PfSelectWrap, useToast,
} from '@/components/portal/ui';

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
  const { toast, toastNode } = useToast();

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
      // Gagal -> alert di atas (pf-alert-error). Berhasil -> toast hijau,
      // supaya pesan succes tidak pernah tampil dengan gaya error.
      if (!isOk(r)) {
        setMsg(String(r?.message || 'Gagal menambah ke keranjang.'));
        toast(String(r?.message || 'Gagal menambah ke keranjang.'), 'error');
        return;
      }
      toast(`${p.NAME} masuk keranjang`, 'ok');
      refreshCart();
    } catch {
      router.push(`/login/?next=${encodeURIComponent('/merch/')}`);
    }
  };

  return (
    <PortalShell cities={cities}>
      <div className="pf-col pf-gap-lg">
        <div className="pf-row-between pf-wrapx pf-gap-sm">
          <h1 className="pf-h1">Merchandise</h1>
          <Link href={`/cart`} className="pf-btn pf-btn-soft pf-btn-sm">
            <PfIcon name="cart" size={16} />
            Keranjang{cartCount ? ` (${cartCount})` : ''}
          </Link>
        </div>

        <div className="pf-filterbar" style={{ marginBottom: 0 }}>
          <form className="pf-searchbar" onSubmit={(e) => { e.preventDefault(); load(); }} role="search">
            <PfIcon name="search" size={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk…" aria-label="Cari produk" />
            <button type="submit" className="pf-btn pf-btn-sm">Cari</button>
          </form>
          <div className="pf-row pf-gap-sm" style={{ marginTop: 'var(--pf-s2)' }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <PfSelectWrap value={cat} aria-label="Kategori produk"
                onChange={(e) => { setCat(e.target.value); setTimeout(load, 0); }}>
                <option value="">Semua kategori</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </PfSelectWrap>
            </span>
            <span className="pf-tiny pf-nowrap">{loading ? 'Memuat…' : `${rows.length} produk`}</span>
          </div>
        </div>

        {msg ? <PfAlert tone="error">{msg}</PfAlert> : null}
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoadingGrid count={8} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="package" title="Produk tidak tersedia" hint="Coba kategori atau kata kunci lain." />
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="pf-grid pf-grid-auto">
            {rows.map((p, i) => (
              <PfReveal key={p.PRODUCTID} delay={Math.min(i, 8) * 45}>
                <article className="pf-card pf-card-link pf-col">
                  <Link href={`/merch/${p.PRODUCTID}`} aria-label={p.NAME}>
                    <div className="pf-pr-media">
                      {p.IMAGE
                        ? <img src={assetUrl(p.IMAGE)} alt="" loading="lazy" width={400} height={400} />
                        : <div className="pf-pr-media-empty"><PfIcon name="package" size={24} /></div>}
                    <div className="pf-pr-tag">
                      {p.STOCK > 0
                        ? <PfBadge tone="ok">Stok {p.STOCK}</PfBadge>
                        : <PfBadge tone="danger">Stok habis</PfBadge>}
                    </div>
                    </div>
                  </Link>
                  <div className="pf-pr-body pf-grow">
                    <Link href={`/merch/${p.PRODUCTID}`}>
                      <h3 className="pf-pr-title pf-clamp-2">{p.NAME}</h3>
                    </Link>
                    {p.CATEGORY ? <span className="pf-pr-cat">{p.CATEGORY}</span> : null}
                    <div className="pf-pr-foot">
                      <span className="pf-price" style={{ fontSize: 'var(--pf-fs-body)' }}>{rp(p.PRICE)}</span>
                      <PfButton
                        size="sm"
                        icon="cart"
                        disabled={p.STOCK <= 0}
                        onClick={() => addToCart(p)}
                        aria-label={`Tambah ${p.NAME} ke keranjang`}
                      >
                        Keranjang
                      </PfButton>
                    </div>
                  </div>
                </article>
              </PfReveal>
            ))}
          </div>
        ) : null}
      </div>

      {toastNode}
    </PortalShell>
  );
}