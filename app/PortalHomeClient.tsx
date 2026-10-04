'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, portalPost } from '@/lib/portal/api';
import { rpShort, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import { PfEmpty, PfError, PfLoadingGrid, PfReveal, usePortalData, useToast, type PortalEvent } from '@/components/portal/ui';

type Props = { initial: any | null; appName: string; cities: { CITYCODE: string; CITYNAME: string; CITYPROV?: string }[] };
type Promo = { PROMOID: number; CODE: string; NAME: string; DESCR?: string; DISCOUNT: number; DISCTYPE?: string; ENDDATE?: string };
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
  useEffect(() => { try { setCity(localStorage.getItem(CITY_KEY) || ''); } catch {} }, []);
  useEffect(() => {
    if (!cityOpen) return;
    const onDown = (e: MouseEvent) => { if (cityBox.current && !cityBox.current.contains(e.target as Node)) setCityOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCityOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [cityOpen]);
  const copyCode = useCallback(async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(code); toast('Kode promo disalin', 'ok'); window.setTimeout(() => setCopied(''), 2000); } catch { toast('Gagal menyalin kode', 'error'); }
  }, [toast]);
  const adClick = (a: Ad) => { portalPost('portal/public/ad/click', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {}); const h = String(a.HREF || ''); if (h) window.open(h, '_blank', 'noopener'); };
  const adView = (a: Ad) => { portalPost('portal/public/ad/view', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {}); };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); if (city) p.set('city', city); const s = p.toString(); router.push(`/events${s ? `?${s}` : ''}`); };
  const pickCity = (c: string) => { setCity(c); setCityOpen(false); try { localStorage.setItem(CITY_KEY, c); } catch {} };
  const cityName = cities.find((c) => c.CITYCODE === city)?.CITYNAME || 'Semua Kota';
  const events: PortalEvent[] = (src?.events as PortalEvent[]) || [];
  const hot: PortalEvent[] = (src?.hot as PortalEvent[]) || [];
  const promos: Promo[] = (src?.promos as Promo[]) || [];
  const news: News[] = (src?.news as News[]) || [];
  const ads: Ad[] = (src?.ads as Ad[]) || [];
  const cats: { CATCODE: string; CATNAME: string }[] = (src?.categories as any[]) || [];
  useEffect(() => { if (ads[0]) adView(ads[0]); }, [ads]);
  const catIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('konser')) return 'building'; if (n.includes('teater')) return 'ticket'; if (n.includes('teknologi')) return 'settings'; if (n.includes('kuliner')) return 'package'; if (n.includes('wisata')) return 'location'; return 'sparkles';
  };
  return (
    <PortalShell appName={appName} cities={cities}>
      <div className="v-home">
        {error && !src ? <div className="pf-wrap-inner" style={{ paddingTop: 16 }}><PfError message={error} onRetry={reload} /></div> : null}
        <section className="v-hero">
          <img src="https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1400&q=80" alt="" className="v-hero-bg" aria-hidden="true" />
          <div className="v-hero-overlay" aria-hidden="true" />
          <div className="pf-wrap-inner" style={{ position: 'relative', textAlign: 'center' }}>
            <span className="v-hero-pill">FEATURED EVENT</span>
            <h1>Temukan Pengalaman<br />Di TicketIn</h1>
            <p className="v-hero-sub">Akses eksklusif ke konser musik, festival seni, dan konferensi teknologi terbaik di seluruh Indonesia dengan sistem pembayaran aman.</p>
            <form className="v-searchbar" onSubmit={submitSearch} role="search">
              <div className="v-search-field">
                <PfIcon name="search" size={16} />
                <label><small>CARI EVENT</small><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Artis, Konser, atau Festival" aria-label="Cari event" /></label>
              </div>
              <div className="v-search-field" ref={cityBox} style={{ position: 'relative' as const }}>
                <PfIcon name="location" size={16} />
                <label><small>LOKASI</small>
                  <button type="button" onClick={() => setCityOpen((v) => !v)} aria-expanded={cityOpen} aria-haspopup="listbox" style={{ background: 'transparent', border: 0, color: '#e2e8f0', fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}>{cityName}</button>
                </label>
                {cityOpen ? (
                  <div className="pf-pop" role="listbox" aria-label="Pilih kota" style={{ left: 0, right: 'auto', minWidth: 200 }}>
                    <button type="button" role="option" aria-selected={!city} className={`pf-pop-item${!city ? ' is-active' : ''}`} onClick={() => pickCity('')}>Semua Kota{!city ? <PfIcon name="check" size={16} /> : null}</button>
                    {cities.map((c) => (
                      <button key={c.CITYCODE} type="button" role="option" aria-selected={city === c.CITYCODE} className={`pf-pop-item${city === c.CITYCODE ? ' is-active' : ''}`} onClick={() => pickCity(c.CITYCODE)}><span>{c.CITYNAME}</span>{city === c.CITYCODE ? <PfIcon name="check" size={16} /> : null}</button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="v-search-field" style={{ borderRight: 0 }}>
                <PfIcon name="calendar" size={16} />
                <label><small>WAKTU</small><Link href="/events" style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, textDecoration: 'none' }}>Kapan Saja</Link></label>
              </div>
              <button type="submit" className="v-search-go" aria-label="Cari"><PfIcon name="arrowRight" size={20} /></button>
            </form>
            <div className="v-hero-chips">
              {(cats.length ? cats.slice(0, 6) : [{ CATCODE: 'musik', CATNAME: 'Musik' }, { CATCODE: 'seni', CATNAME: 'Seni' }, { CATCODE: 'teknologi', CATNAME: 'Teknologi' }, { CATCODE: 'olahraga', CATNAME: 'Olahraga' }, { CATCODE: 'kuliner', CATNAME: 'Kuliner' }] as any[]).map((c, i) => (
                <Link key={c.CATCODE} href={`/events?cat=${encodeURIComponent(c.CATCODE)}`} className={`v-hero-chip${i === 2 && cats.length === 0 ? ' is-active' : ''}`}>{c.CATNAME}</Link>
              ))}
            </div>
          </div>
        </section>

        <section className="v-section">
          <div className="pf-wrap-inner">
            <div className="v-section-head"><h2>Kategori Populer</h2><Link href="/events">Lihat Semua &gt;</Link></div>
            <div className="v-cat-grid">
              {(cats.length ? cats.slice(0, 6) : [{ CATCODE: 'konser', CATNAME: 'Konser' }, { CATCODE: 'teater', CATNAME: 'Teater' }, { CATCODE: 'teknologi', CATNAME: 'Teknologi' }, { CATCODE: 'kuliner', CATNAME: 'Kuliner' }, { CATCODE: 'wisata', CATNAME: 'Wisata' }, { CATCODE: 'hiburan', CATNAME: 'Hiburan' }] as any[]).map((c) => (
                <Link key={c.CATCODE} href={`/events?cat=${encodeURIComponent(c.CATCODE)}`} className="v-cat">
                  <span className="v-cat-ico"><PfIcon name={catIcon(c.CATNAME) as any} size={20} /></span>
                  <span>{c.CATNAME}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="v-section" style={{ paddingTop: 0 }}>
          <div className="pf-wrap-inner">
            <div className="v-sale-card" role="button" tabIndex={0} onClick={() => ads[0] && adClick(ads[0])} onKeyDown={(e) => { if (e.key === 'Enter' && ads[0]) adClick(ads[0]); }}>
              <div>
                <span className="pf-badge" style={{ background: '#a3e635', color: '#0a1026', borderColor: '#a3e635', fontSize: 10 }}>BERSPONSOR</span>
                <h3 style={{ marginTop: 10, fontSize: 18, fontWeight: 800, color: '#fff' }}>Upgrade Akun Premium</h3>
                <p style={{ marginTop: 6, fontSize: 12, color: '#a1a1aa', lineHeight: 1.5 }}>Nikmati akses early-bird dan diskon eksklusif 20% untuk semua event pilihan TicketIn.</p>
                <span className="pf-btn pf-btn-sm" style={{ marginTop: 14, background: '#06b6d4', borderColor: '#06b6d4', color: '#fff' } as any}>Pelajari Selengkapnya</span>
              </div>
              <div className="v-sale-big">SALE</div>
            </div>
          </div>
        </section>

        <section className="v-section">
          <div className="pf-wrap-inner">
            <div className="v-section-head"><div><div className="v-kicker">EVENT TERDEKAT</div><h2>Populer Di Sekitarmu</h2></div><Link href="/events">Lihat semua</Link></div>
            {loading && !src ? <PfLoadingGrid count={3} /> : events.length === 0 ? <div className="v-card" style={{ padding: 24 }}><PfEmpty icon="calendar" title="Belum ada event" hint="Event yang dipublikasikan akan muncul di sini." /></div> : (
              <div className="v-grid-3">
                {events.slice(0, 3).map((e, i) => (
                  <PfReveal key={e.EVENTID} delay={Math.min(i, 3) * 60}>
                    <Link href={`/events/${e.EVENTID}`} className="v-card">
                      <div className="v-card-media">
                        {e.POSTER ? <img src={assetUrl(e.POSTER)} alt="" loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#334155' }}><PfIcon name="photo" size={24} /></div>}
                        <span className="v-card-badge">Trending</span>
                        <span className="v-card-heart"><PfIcon name="ticket" size={16} /></span>
                      </div>
                      <div className="v-card-body">
                        <div className="v-card-title">{e.TITLE}</div>
                        <div className="v-card-meta"><PfIcon name="calendar" size={16} />{tanggalPendek(e.STARTAT)} · {e.VENUE || e.CITYCODE || '-'}</div>
                        <div className="v-card-foot"><span className="v-card-price"><small>Mulai dari</small> {rpShort(e.MINPRICE)}</span><span className="pf-btn pf-btn-sm" style={{ background: '#06b6d4', borderColor: '#06b6d4', color: '#fff', height: 28, fontSize: 11 } as any}>Beli</span></div>
                      </div>
                    </Link>
                  </PfReveal>
                ))}
              </div>
            )}
          </div>
        </section>

        {hot.length > 0 ? (
          <section className="v-section v-section-alt">
            <div className="pf-wrap-inner">
              <div style={{ textAlign: 'center', marginBottom: 16 }}><div className="v-kicker">LAGI RAMAI</div><h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 }}>Top Ranking Minggu Ini</h2><p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Event dengan antusiasme tertinggi dari seluruh Indonesia yang wajib kamu ikuti.</p></div>
              <div className="v-grid-3">
                {hot.slice(0, 3).map((e, i) => (
                  <PfReveal key={e.EVENTID} delay={Math.min(i, 3) * 60}>
                    <Link href={`/events/${e.EVENTID}`} className="v-card">
                      <div className="v-card-media"><span className="v-rank-num">{i + 1}</span>{e.POSTER ? <img src={assetUrl(e.POSTER)} alt="" loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#334155' }}><PfIcon name="photo" size={24} /></div>}<span className="v-card-heart"><PfIcon name="ticket" size={16} /></span></div>
                      <div className="v-card-body"><div className="v-card-title">{e.TITLE}</div><div className="v-card-meta"><PfIcon name="calendar" size={16} />{tanggalPendek(e.STARTAT)} · {e.VENUE || '-'}</div><div className="v-card-foot"><span className="v-card-price">{Number(e.MINPRICE) ? rpShort(e.MINPRICE) : 'Gratis'}</span><span className="pf-btn pf-btn-sm" style={{ background: '#06b6d4', borderColor: '#06b6d4', color: '#fff', height: 28, fontSize: 11 } as any}>Beli</span></div></div>
                    </Link>
                  </PfReveal>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {news.length > 0 ? (
          <section className="v-section">
            <div className="pf-wrap-inner">
              <div className="v-section-head"><h2>Update &amp; Artikel</h2><Link href="/news">Lihat Semua Berita</Link></div>
              <div className="v-grid-3">
                {news.slice(0, 3).map((n, i) => (
                  <PfReveal key={n.NEWSID} delay={Math.min(i, 3) * 60}>
                    <Link href={`/news?open=${n.NEWSID}`} className="v-article">
                      <div className="v-article-media">{n.MAINIMAGE ? <img src={assetUrl(n.MAINIMAGE)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PfIcon name="news" size={24} />}</div>
                      <div className="v-article-body"><span className="v-article-kicker">{tanggalPendek(n.PUBLISHEDAT)}</span><div className="v-article-title" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.TITLE}</div><span className="v-article-link">Baca Selengkapnya &gt;</span></div>
                    </Link>
                  </PfReveal>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {promos.length > 0 ? (
          <section className="v-section" style={{ paddingBottom: 8 }}>
            <div className="pf-wrap-inner">
              <div className="v-section-head"><h2>Promo</h2><Link href="/promos">Lihat semua</Link></div>
              <div className="v-grid-3">
                {promos.slice(0, 3).map((p, i) => (
                  <PfReveal key={p.PROMOID} delay={Math.min(i, 3) * 60}>
                    <div className="v-card" style={{ padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.NAME || 'Promo'}</span><span className="pf-badge" style={{ background: '#06b6d4', color: '#0a1026', borderColor: '#06b6d4' }}>{p.DISCTYPE === 'PCT' || p.DISCTYPE === 'PERCENT' ? `${Number(p.DISCOUNT)}%` : rpShort(p.DISCOUNT)}</span></div>
                      <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.DESCR || ''}</p>
                      <button type="button" onClick={() => copyCode(p.CODE)} className="pf-btn pf-btn-sm" style={{ marginTop: 10, width: '100%', background: copied === p.CODE ? '#ecfeff' : '#06b6d4', color: copied === p.CODE ? '#0e7490' : '#fff', borderColor: '#06b6d4' } as any}>{copied === p.CODE ? 'Kode disalin' : `Salin Kode: ${p.CODE}`}</button>
                    </div>
                  </PfReveal>
                ))}
              </div>
            </div>
          </section>
        ) : null}
        {toastNode}
      </div>
    </PortalShell>
  );
}
