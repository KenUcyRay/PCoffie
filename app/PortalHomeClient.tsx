'use client';

// Beranda portal: dirender di server (app/page.tsx) lalu dihidrasi di klien.
// Data, panggilan API, dan alur tetap sama; yang berubah hanya susunan tampilan.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, portalPost } from '@/lib/portal/api';
import { rpShort, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfBadge, PfButton, PfEmpty, PfError, PfEventCard, PfLoadingGrid, PfReveal,
  PfSection, usePortalData, useToast, type PortalEvent,
} from '@/components/portal/ui';

type Props = {
  initial: any | null;
  appName: string;
  cities: { CITYCODE: string; CITYNAME: string; CITYPROV?: string }[];
};

type Promo = { PROMOID: number; CODE: string; NAME: string; DESCR?: string; DISCOUNT: number; DISCTYPE?: string; ENDDATE?: string; LEFT?: number };
type News = { NEWSID: number; TITLE: string; SUMMARY?: string; MAINIMAGE?: string; PUBLISHEDAT?: string };
type Ad = { CAMPAIGNID: number; TITLE: string; BANNER?: string; HREF?: string };

const CITY_KEY = `${BASE_PATH.replace(/\//g, '')}::city`;

export default function PortalHomeClient({ initial, appName, cities }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState('');
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const { data, loading, error, reload } = usePortalData<any>('portal/public/home', {}, [initial ? 'ssr' : 'csr']);
  const { toast, toastNode } = useToast();
  const src = data || initial;

  const cityBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setCity(localStorage.getItem(CITY_KEY) || ''); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cityOpen) return;
    const onDown = (e: MouseEvent) => {
      if (cityBox.current && !cityBox.current.contains(e.target as Node)) setCityOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCityOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [cityOpen]);

  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast('Kode promo disalin', 'ok');
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      toast('Gagal menyalin kode', 'error');
    }
  }, [toast]);

  const adClick = (a: Ad) => {
    portalPost('portal/public/ad/click', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {});
    const href = String(a.HREF || '');
    if (href) window.open(href, '_blank', 'noopener');
  };

  const adView = (a: Ad) => {
    portalPost('portal/public/ad/view', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {});
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (city) params.set('city', city);
    const s = params.toString();
    router.push(`/events${s ? `?${s}` : ''}`);
  };

  const pickCity = (c: string) => {
    setCity(c);
    setCityOpen(false);
    try { localStorage.setItem(CITY_KEY, c); } catch { /* ignore */ }
  };

  const cityName = cities.find((c) => c.CITYCODE === city)?.CITYNAME || 'Semua kota';

  const events: PortalEvent[] = (src?.events as PortalEvent[]) || [];
  const hot: PortalEvent[] = (src?.hot as PortalEvent[]) || [];
  const promos: Promo[] = (src?.promos as Promo[]) || [];
  const news: News[] = (src?.news as News[]) || [];
  const ads: Ad[] = (src?.ads as Ad[]) || [];
  const cats: { CATCODE: string; CATNAME: string }[] = (src?.categories as any[]) || [];

  return (
    <PortalShell appName={appName} cities={cities}>
      {error && !src ? <PfError message={error} onRetry={reload} /> : null}

      {/* ------------------------------------------------------------ HERO */}
      <section className="pf-hero pf-rise">
        <div className="pf-hero-inner">
          <h1 className="pf-hero-title">Temukan event seru, beli tiketnya gampang</h1>
          <p className="pf-hero-text">
            Pilih event, pilih tiket, lalu selesaikan pembayaran. Tiket dan QR-nya langsung muncul di akun Anda.
          </p>

          <form className="pf-hero-search" onSubmit={submitSearch} role="search">
            <PfIcon name="search" size={20} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari event, berita, promo…"
              aria-label="Cari event, berita, promo"
            />
            <button type="submit" className="pf-btn pf-btn-sm">Cari</button>
          </form>

          <div className="pf-row pf-gap-sm pf-wrapx" style={{ marginTop: 'var(--pf-s3)' }}>
            <div ref={cityBox} style={{ position: 'relative' }}>
              <button
                type="button"
                className="pf-hero-city"
                onClick={() => setCityOpen((v) => !v)}
                aria-expanded={cityOpen}
                aria-haspopup="listbox"
              >
                <PfIcon name="location" size={20} />
                {cityName}
                <PfIcon name="chevronDown" size={16} />
              </button>
              {cityOpen ? (
                <div className="pf-pop" role="listbox" aria-label="Pilih kota" style={{ minWidth: 220 }}>
                  <button type="button" role="option" aria-selected={!city}
                    className={`pf-pop-item${!city ? ' is-active' : ''}`} onClick={() => pickCity('')}>
                    Semua kota
                    {!city ? <PfIcon name="check" size={16} /> : null}
                  </button>
                  {cities.map((c) => (
                    <button key={c.CITYCODE} type="button" role="option" aria-selected={city === c.CITYCODE}
                      className={`pf-pop-item${city === c.CITYCODE ? ' is-active' : ''}`}
                      onClick={() => pickCity(c.CITYCODE)}>
                      <span>{c.CITYNAME}</span>
                      {city === c.CITYCODE ? <PfIcon name="check" size={16} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="pf-hero-actions">
            <Link href={`/events`} className="pf-btn pf-btn-soft">
              Lihat semua event <PfIcon name="arrowRight" size={20} />
            </Link>
            <Link href={`/tickets`} className="pf-btn pf-btn-ghost">
              <PfIcon name="ticket" size={20} /> Tiket saya
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- IKLAN (carousel) */}
      {ads.length > 0 ? (
        <PfSection
          title="Iklan"
          action={<PfBadge tone="warn" icon="sparkles">Bersponsor</PfBadge>}
        >
          <AdCarousel ads={ads} onView={adView} onClick={adClick} />
        </PfSection>
      ) : null}

      {/* ------------------------------------------------------- KATEGORI */}
      {cats.length > 0 ? (
        <PfSection title="Kategori">
          <div className="pf-chips" role="list">
            {cats.map((c, i) => (
              <Link key={c.CATCODE} role="listitem"
                href={`/events?cat=${encodeURIComponent(c.CATCODE)}`}
                className="pf-chip pf-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <PfIcon name="tag" size={16} />
                {c.CATNAME}
              </Link>
            ))}
          </div>
        </PfSection>
      ) : null}

      {/* -------------------------------------------------- EVENT TERDEKAT */}
      <PfSection
        title="Event terdekat"
        sub={events.length ? `${events.length} event tersedia` : undefined}
        action={<Link href={`/events`} className="pf-section-link">Lihat semua <PfIcon name="chevronRight" size={16} /></Link>}
      >
        {loading && !src ? (
          <PfLoadingGrid count={6} />
        ) : events.length === 0 ? (
          <div className="pf-card"><PfEmpty icon="calendar" title="Belum ada event" hint="Event yang dipublikasikan akan muncul di sini." /></div>
        ) : (
          <div className="pf-grid pf-grid-auto">
            {events.map((e, i) => (
              <PfReveal key={e.EVENTID} delay={Math.min(i, 6) * 60}>
                <PfEventCard ev={e} />
              </PfReveal>
            ))}
          </div>
        )}
      </PfSection>

      {/* ------------------------------------------------------------ POPULER */}
      {hot.length > 0 ? (
        <PfSection title="Populer">
          <div className="pf-grid pf-grid-auto">
            {hot.map((e, i) => (
              <PfReveal key={e.EVENTID} delay={Math.min(i, 6) * 60}>
                <PfEventCard ev={e} badge={<PfBadge tone="accent" icon="sparkles">Populer</PfBadge>} />
              </PfReveal>
            ))}
          </div>
        </PfSection>
      ) : null}

      {/* ------------------------------------------------------------- PROMO */}
      {promos.length > 0 ? (
        <PfSection
          title="Promo"
          action={<Link href={`/promos`} className="pf-section-link">Lihat semua <PfIcon name="chevronRight" size={16} /></Link>}
        >
          <div className="pf-grid pf-grid-3">
            {promos.map((p, i) => (
              <PfReveal key={p.PROMOID} delay={Math.min(i, 5) * 60} className="pf-col">
                <div className="pf-card pf-col pf-grow">
                  <div className="pf-card-head">
                    <span className="pf-card-title">
                      <PfIcon name="discount" size={20} />
                      <span className="pf-clamp-1">{p.NAME || 'Promo'}</span>
                    </span>
                    <PfBadge tone="accent">
                      {p.DISCTYPE === 'PCT' || p.DISCTYPE === 'PERCENT'
                        ? `${Number(p.DISCOUNT)}%`
                        : rpShort(p.DISCOUNT)}
                    </PfBadge>
                  </div>
                  <div className="pf-card-pad pf-col pf-gap-sm pf-grow">
                    <p className="pf-sm pf-dim pf-clamp-2" style={{ minHeight: 34 }}>{p.DESCR || ''}</p>
                    <PfButton
                      variant={copied === p.CODE ? 'soft' : 'primary'}
                      icon={copied === p.CODE ? 'check' : 'copy'}
                      block
                      onClick={() => copyCode(p.CODE)}
                    >
                      {copied === p.CODE ? 'Kode disalin' : `Salin Kode: ${p.CODE}`}
                    </PfButton>
                    <span className="pf-tiny">Berlaku sampai {tanggalPendek(p.ENDDATE)}</span>
                  </div>
                </div>
              </PfReveal>
            ))}
          </div>
        </PfSection>
      ) : null}

      {/* ------------------------------------------------------------ BERITA */}
      {news.length > 0 ? (
        <PfSection
          title="Berita"
          action={<Link href={`/news`} className="pf-section-link">Lihat semua <PfIcon name="chevronRight" size={16} /></Link>}
        >
          <div className="pf-grid pf-grid-3">
            {news.map((n, i) => (
              <PfReveal key={n.NEWSID} delay={Math.min(i, 5) * 60} className="pf-col">
                <Link href={`/news?open=${n.NEWSID}`} className="pf-card pf-card-link pf-col pf-grow">
                  <div className="pf-art">
                    <div className="pf-art-media">
                      {n.MAINIMAGE
                        ? <img src={assetUrl(n.MAINIMAGE)} alt="" loading="lazy" width={640} height={360} />
                        : <div className="pf-art-media-empty"><PfIcon name="news" size={24} /></div>}
                    </div>
                    <span className="pf-tiny">{tanggalPendek(n.PUBLISHEDAT)}</span>
                  </div>
                  <div className="pf-card-pad pf-col pf-gap-xs pf-grow">
                    <h3 className="pf-art-title pf-clamp-2">{n.TITLE}</h3>
                    {n.SUMMARY ? <p className="pf-art-text pf-clamp-2">{n.SUMMARY}</p> : null}
                  </div>
                </Link>
              </PfReveal>
            ))}
          </div>
        </PfSection>
      ) : null}

      {toastNode}
    </PortalShell>
  );
}

/* =============================================================================
   Karusel iklan: bisa digeser (scroll-snap), ada penanda posisi, dan berhenti
  打得-ish saat tab tidak aktif. Logikanya murni tampilan.
   ========================================================================== */
function AdCarousel({
  ads, onView, onClick,
}: { ads: Ad[]; onView: (a: Ad) => void; onClick: (a: Ad) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  // Iklan yang terlihat dicatat sekali per slide (tampilan, bukan klik).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const i = Number((e.target as HTMLElement).dataset.i || '0');
        setIdx(i);
        const a = ads[i];
        if (a) onView(a);
      });
    }, { threshold: 0.6 });
    Array.from(el.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [ads, onView]);

  // Berhenti meluncur sendiri saat tab tidak aktif.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onVis = () => { if (document.hidden) el.style.scrollBehavior = 'auto'; else el.style.scrollBehavior = ''; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    const t = el?.children[i] as HTMLElement | undefined;
    if (el && t) el.scrollTo({ left: t.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  return (
    <div className="pf-carousel">
      <div className="pf-carousel-track" ref={track} aria-label="Iklan">
        {ads.map((a, i) => (
          <button
            key={a.CAMPAIGNID}
            type="button"
            data-i={i}
            className="pf-slide"
            onClick={() => onClick(a)}
            aria-label={a.TITLE}
          >
            {a.BANNER ? (
              <img
                src={assetUrl(a.BANNER)}
                alt=""
                loading="lazy"
                width={1200}
                height={300}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <>
                <span className="pf-slide-deco" aria-hidden="true" />
                <span className="pf-slide-body">
                  <span className="pf-slide-kicker">Iklan</span>
                  <span className="pf-slide-title">{a.TITLE}</span>
                  {a.HREF ? <span className="pf-slide-text">Klik untuk detail</span> : null}
                </span>
              </>
            )}
          </button>
        ))}
      </div>

      {ads.length > 1 ? (
        <>
          <button type="button" className="pf-carousel-arrow is-prev" onClick={() => go(Math.max(0, idx - 1))} aria-label="Iklan sebelumnya">
            <PfIcon name="chevronLeft" size={20} />
          </button>
          <button type="button" className="pf-carousel-arrow is-next" onClick={() => go(Math.min(ads.length - 1, idx + 1))} aria-label="Iklan berikutnya">
            <PfIcon name="chevronRight" size={20} />
          </button>
          <div className="pf-dots">
            {ads.map((a, i) => (
              <button key={a.CAMPAIGNID} type="button"
                className={`pf-dot-btn${i === idx ? ' is-active' : ''}`}
                onClick={() => go(i)}
                aria-label={`Iklan ${i + 1} dari ${ads.length}`}
                aria-current={i === idx ? 'true' : undefined}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}