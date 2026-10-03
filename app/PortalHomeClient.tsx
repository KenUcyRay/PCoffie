'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp, rpShort, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfEventCard, PfLoading, usePortalData, type PortalEvent } from '@/components/portal/ui';

type Props = {
  initial: any | null;
  appName: string;
  cities: { CITYCODE: string; CITYNAME: string; CITYPROV?: string }[];
};

type Promo = { PROMOID: number; CODE: string; NAME: string; DESCR?: string; DISCOUNT: number; DISCTYPE?: string; ENDDATE?: string; LEFT?: number };
type News = { NEWSID: number; TITLE: string; SUMMARY?: string; MAINIMAGE?: string; PUBLISHEDAT?: string };
type Ad = { CAMPAIGNID: number; TITLE: string; BANNER?: string; HREF?: string };

export default function PortalHomeClient({ initial, appName, cities }: Props) {
  const [copied, setCopied] = useState('');
  const { data, loading, error, reload } = usePortalData<any>('portal/public/home', {}, [initial ? 'ssr' : 'csr']);
  const src = data || initial;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };

  const adClick = async (a: Ad) => {
    portalPost('portal/public/ad/click', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {});
    const href = String(a.HREF || '');
    if (href) window.open(href, '_blank', 'noopener');
  };

  const events: PortalEvent[] = (src?.events as PortalEvent[]) || [];
  const hot: PortalEvent[] = (src?.hot as PortalEvent[]) || [];
  const promos: Promo[] = (src?.promos as Promo[]) || [];
  const news: News[] = (src?.news as News[]) || [];
  const ads: Ad[] = (src?.ads as Ad[]) || [];
  const cats: { CATCODE: string; CATNAME: string }[] = (src?.categories as any[]) || [];

  return (
    <PortalShell appName={appName} cities={cities}>
      {error && !src ? <PfError message={error} onRetry={reload} /> : null}

      {/* Iklan: label jelas "Iklan", tayang & klik dicatat backend dengan pembatasan */}
      {ads.length > 0 && (
        <div className="pf-col" style={{ gap: 8 }}>
          {ads.map((a) => (
            <div key={a.CAMPAIGNID}>
              <div className="pf-row pf-gap-sm" style={{ marginBottom: 6 }}>
                <PfBadge tone="warn">Iklan</PfBadge>
                <span className="pf-tiny">{a.TITLE}</span>
              </div>
              <button
                type="button"
                onClick={() => adClick(a)}
                className="pf-card"
                style={{ width: '100%', padding: 0, cursor: a.HREF ? 'pointer' : 'default' }}
                onMouseEnter={() => portalPost('portal/public/ad/view', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {})}
              >
                {a.BANNER ? <img src={assetUrl(a.BANNER)} alt={a.TITLE} style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} /> : null}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hero + kategori */}
      <div className="pf-section">
        <div className="pf-card" style={{ background: 'linear-gradient(135deg, var(--pf-accent) 0%, var(--pf-accent-dark) 100%)', border: 'none', color: '#fff' }}>
          <div className="pf-card-pad pf-col" style={{ gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 850, letterSpacing: '-.02em', lineHeight: 1.2 }}>Temukan event seru, beli tiketnya gampang</div>
            <div style={{ opacity: .92, fontSize: 14 }}>
              Pilih event, pilih tiket, lalu selesaikan pembayaran. Tiket dan QR-nya langsung muncul di akun Anda.
            </div>
            <div className="pf-row pf-gap-sm pf-wrapx">
              <Link href={`/events`} className="pf-btn pf-btn-ghost pf-btn-sm" style={{ color: 'var(--pf-accent-dark)' }}>Lihat semua event</Link>
              <Link href={`/tickets`} className="pf-btn pf-btn-sm" style={{ background: '#fff', color: 'var(--pf-accent-dark)' }}>Tiket saya</Link>
            </div>
          </div>
        </div>
      </div>

      {cats.length > 0 && (
        <div className="pf-section">
          <div className="pf-row pf-wrapx pf-gap-sm">
            {cats.map((c) => (
              <Link key={c.CATCODE} href={`/events?cat=${encodeURIComponent(c.CATCODE)}`} className="pf-badge">
                {c.CATNAME}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Event terdekat */}
      <section className="pf-section">
        <div className="pf-section-title">
          <span>Event terdekat</span>
          <Link href={`/events`} className="pf-tiny">Lihat semua</Link>
        </div>
        {loading && !src ? (
          <PfLoading />
        ) : events.length === 0 ? (
          <PfEmpty title="Belum ada event" hint="Event yang dipublikasikan akan muncul di sini." />
        ) : (
          <div className="pf-grid pf-grid-auto">
            {events.map((e) => <PfEventCard key={e.EVENTID} ev={e} />)}
          </div>
        )}
      </section>

      {/* Event populer */}
      {hot.length > 0 && (
        <section className="pf-section">
          <div className="pf-section-title"><span>Populer</span></div>
          <div className="pf-grid pf-grid-auto">
            {hot.map((e) => <PfEventCard key={e.EVENTID} ev={e} />)}
          </div>
        </section>
      )}

      {/* Promo dengan tombol Salin Kode */}
      {promos.length > 0 && (
        <section className="pf-section">
          <div className="pf-section-title">
            <span>Promo</span>
            <Link href={`/promos`} className="pf-tiny">Lihat semua</Link>
          </div>
          <div className="pf-grid pf-grid-3">
            {promos.map((p) => (
              <div key={p.PROMOID} className="pf-card">
                <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
                  <div className="pf-row-between">
                    <strong style={{ fontSize: 14.5 }}>{p.NAME || 'Promo'}</strong>
                    <PfBadge tone="accent">
                      {p.DISCTYPE === 'PCT' || p.DISCTYPE === 'PERCENT'
                        ? `${Number(p.DISCOUNT)}%`
                        : rpShort(p.DISCOUNT)}
                    </PfBadge>
                  </div>
                  <div className="pf-dim" style={{ minHeight: 20 }}>{p.DESCR || ''}</div>
                  <button type="button" className="pf-btn pf-btn-soft pf-btn-sm pf-btn-block" onClick={() => copyCode(p.CODE)}>
                    {copied === p.CODE ? 'Kode disalin ✓' : `Salin Kode: ${p.CODE}`}
                  </button>
                  <div className="pf-tiny">Berlaku sampai {tanggalPendek(p.ENDDATE)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Berita */}
      {news.length > 0 && (
        <section className="pf-section">
          <div className="pf-section-title">
            <span>Berita</span>
            <Link href={`/news`} className="pf-tiny">Lihat semua</Link>
          </div>
          <div className="pf-grid pf-grid-3">
            {news.map((n) => (
              <Link key={n.NEWSID} href={`/news?open=${n.NEWSID}`} className="pf-card">
                {n.MAINIMAGE ? <img className="pf-ev-img" src={assetUrl(n.MAINIMAGE)} alt="" loading="lazy" /> : null}
                <div className="pf-card-pad pf-col" style={{ gap: 6 }}>
                  <div className="pf-tiny">{tanggalPendek(n.PUBLISHEDAT)}</div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.35 }}>{n.TITLE}</div>
                  {n.SUMMARY ? <div className="pf-dim">{n.SUMMARY}</div> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="pf-foot">
        <div className="pf-wrap pf-foot-grid">
          <div className="pf-col" style={{ gap: 6 }}>
            <strong>{appName}</strong>
            <span className="pf-dim">Portal pembeli tiket event & merchandise.</span>
          </div>
          <div className="pf-col" style={{ gap: 6 }}>
            <strong className="pf-dim">Jelajahi</strong>
            <Link href={`/events`} className="pf-dim">Event</Link>
            <Link href={`/merch`} className="pf-dim">Merchandise</Link>
            <Link href={`/tickets`} className="pf-dim">Tiket saya</Link>
          </div>
          <div className="pf-col" style={{ gap: 6 }}>
            <strong className="pf-dim">Akun</strong>
            <Link href={`/login`} className="pf-dim">Masuk</Link>
            <Link href={`/register`} className="pf-dim">Daftar</Link>
            <Link href={`/console`} className="pf-dim">Console operator</Link>
          </div>
        </div>
      </footer>
    </PortalShell>
  );
}