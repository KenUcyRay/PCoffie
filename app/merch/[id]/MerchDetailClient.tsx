'use client';

// =============================================================================
// DETAIL PRODUK MERCHANDISE
// -----------------------------------------------------------------------------
// Endpoint dan alur (tambah ke keranjang -> /cart/) tidak berubah.
// Tampilan: galeri dengan penanda posisi, dua panel di desktop / susunan
// menumpuk di ponsel, dan bilah aksi menempel di bawah pada layar kecil.
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfEmpty, PfQty,
} from '@/components/portal/ui';

export default function MerchDetailClient({ initial, cities }: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  const router = useRouter();
  const p = initial?.product as any;
  const images: string[] = (initial?.images as string[]) || [];
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState('');
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const gallery: string[] = [p?.IMAGE, ...images].filter(Boolean).map(String);

  // Galeri bisa digeser; penanda posisi mengikuti slide yang terlihat.
  useEffect(() => {
    const el = track.current;
    if (!el || gallery.length < 2) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) setIdx(Number((e.target as HTMLElement).dataset.i || '0'));
      });
    }, { threshold: 0.7 });
    Array.from(el.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [gallery.length]);

  if (!p) {
    return (
      <PortalShell cities={cities}>
        <div className="pf-card">
          <PfEmpty icon="package" title="Produk tidak ditemukan"
            action={<Link href={`/merch`} className="pf-btn pf-btn-sm">Katalog merchandise</Link>} />
        </div>
      </PortalShell>
    );
  }

  const add = async () => {
    setMsg('');
    setBusy(true);
    const r: any = await portalPost('portal/cart', { action: 'add', productid: p.PRODUCTID, qty });
    setBusy(false);
    if (!isOk(r)) {
      setMsg(String(r?.message || 'Gagal menambah.'));
      return;
    }
    router.push(`/cart/`);
  };

  return (
    <PortalShell cities={cities}>
      <PfCrumbs items={[
        { label: 'Beranda', href: '/' },
        { label: 'Merchandise', href: '/merch' },
        { label: p.NAME },
      ]} />

      <div className="pf-columns">
        {/* ------------------------------------------------------------ galeri */}
        <div className="pf-col pf-gap-md">
          <div className="pf-card">
            <div className="pf-carousel-track" ref={track} style={{ borderRadius: 0 }}>
              {gallery.length === 0 ? (
                <div className="pf-pr-media" style={{ aspectRatio: '1 / 1' }}>
                  <div className="pf-pr-media-empty"><PfIcon name="package" size={24} /></div>
                </div>
              ) : gallery.map((src, i) => (
                <div key={`${src}-${i}`} data-i={i} className="pf-pr-media" style={{ aspectRatio: '1 / 1' }}>
                  <img src={assetUrl(src)} alt={i === 0 ? p.NAME : `${p.NAME} (${i + 1})`}
                    width={800} height={800} loading={i === 0 ? 'eager' : 'lazy'} />
                </div>
              ))}
            </div>
            {gallery.length > 1 ? (
              <div className="pf-dots" style={{ padding: 'var(--pf-s3) 0' }}>
                {gallery.map((_, i) => (
                  <button key={i} type="button" className={`pf-dot-btn${i === idx ? ' is-active' : ''}`}
                    onClick={() => {
                      const el = track.current;
                      const t = el?.children[i] as HTMLElement | undefined;
                      if (el && t) el.scrollTo({ left: t.offsetLeft - el.offsetLeft, behavior: 'smooth' });
                    }}
                    aria-label={`Gambar ${i + 1} dari ${gallery.length}`}
                    aria-current={i === idx ? 'true' : undefined} />
                ))}
              </div>
            ) : null}
          </div>

          {p.DESCR ? (
            <section className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="info" size={20} /> Keterangan produk</span>
              </div>
              <div className="pf-card-pad">
                <p className="pf-body pf-dim" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{p.DESCR}</p>
              </div>
            </section>
          ) : null}
        </div>

        {/* -------------------------------------------------------------- info */}
        <aside className="pf-columns-aside">
          <div className="pf-card">
            <div className="pf-card-pad pf-col pf-gap-md">
              <div className="pf-row pf-wrapx pf-gap-xs">
                {p.CATEGORY ? <PfBadge tone="accent">{p.CATEGORY}</PfBadge> : null}
                {p.STOCK > 0
                  ? <PfBadge tone="ok" icon="check">Stok {p.STOCK}</PfBadge>
                  : <PfBadge tone="danger" icon="close">Stok habis</PfBadge>}
                {p.SELLER?.SELLERNAME ? <PfBadge icon="building">{p.SELLER.SELLERNAME}</PfBadge> : null}
              </div>

              <h1 className="pf-h1">{p.NAME}</h1>
              <span className="pf-price pf-price-lg">{rp(p.PRICE)}</span>

              {msg ? <PfAlert tone="error">{msg}</PfAlert> : null}

              <div className="pf-row-between pf-wrapx pf-gap-sm">
                <span className="pf-sm pf-strong">Jumlah</span>
                <PfQty value={qty} max={Math.max(1, Number(p.STOCK || 1))} onChange={setQty} label="Jumlah produk" />
              </div>

              <PfButton block size="lg" icon="cart" busy={busy} busyLabel="Menambahkan…"
                disabled={p.STOCK <= 0} onClick={add} className="pf-hide-mobile">
                Tambah ke keranjang
              </PfButton>

              <Link href={`/cart`} className="pf-section-link" style={{ alignSelf: 'flex-start' }}>
                Lihat keranjang <PfIcon name="chevronRight" size={16} />
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {/* Bilah aksi menempel di bawah pada ponsel. */}
      <div className="pf-actionbar pf-only-mobile">
        <div className="pf-actionbar-total">
          <span className="pf-tiny">Total</span>
          <strong>{rp(Number(p.PRICE || 0) * qty)}</strong>
        </div>
        <PfButton size="lg" icon="cart" busy={busy} busyLabel="Menambahkan…" disabled={p.STOCK <= 0} onClick={add}>
          Tambah
        </PfButton>
      </div>
    </PortalShell>
  );
}