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
  const [locating, setLocating] = useState(false);
  const [suggest, setSuggest] = useState<PortalEvent[]>([]);
  const [sOpen, setSOpen] = useState(false);
  const [sLoading, setSLoading] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);
  const sTimer = useRef<number | null>(null);
  const { data, loading, error, reload } = usePortalData<any>('portal/public/home', {}, [initial ? 'ssr' : 'csr']);
  const { toast, toastNode } = useToast();
  const src = data || initial;
  const cityBox = useRef<HTMLDivElement>(null);
  const autoGeoTried = useRef(false);
  useEffect(() => { try { setCity(localStorage.getItem(CITY_KEY) || ''); } catch {} }, []);
  useEffect(() => () => { if (sTimer.current) window.clearTimeout(sTimer.current); }, []);
  const copyCode = useCallback(async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(code); toast('Kode promo disalin', 'ok'); window.setTimeout(() => setCopied(''), 2000); } catch { toast('Gagal menyalin kode', 'error'); }
  }, [toast]);
  const adClick = (a: Ad) => { portalPost('portal/public/ad/click', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {}); const h = String(a.HREF || ''); if (h) window.open(h, '_blank', 'noopener'); };
  const adView = (a: Ad) => { portalPost('portal/public/ad/view', { campaignid: a.CAMPAIGNID }, { auth: false }).catch(() => {}); };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); setSOpen(false); const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); if (city) p.set('city', city); const s = p.toString(); router.push(`/events${s ? `?${s}` : ''}`); };
  const onSearchChange = (v: string) => {
    setQ(v);
    if (sTimer.current) window.clearTimeout(sTimer.current);
    const term = v.trim();
    if (term.length < 1) { setSuggest([]); setSOpen(false); return; }
    setSOpen(true); setSLoading(true);
    sTimer.current = window.setTimeout(async () => {
      try {
        const r: any = await portalPost('portal/public/events', { q: term, limit: 6 }, { auth: false });
        const rows: PortalEvent[] = (r?.rows as PortalEvent[]) || (r?.data as PortalEvent[]) || [];
        if (rows.length === 0) {
          const all: PortalEvent[] = [...events, ...hot];
          const t = term.toLowerCase();
          const local = all.filter((e) => String(e.TITLE || '').toLowerCase().includes(t) || String((e as any).CITYCODE || '').toLowerCase().includes(t) || String((e as any).VENUE || '').toLowerCase().includes(t)).slice(0, 6);
          setSuggest(local);
        } else setSuggest(rows);
      } catch { setSuggest([]); }
      finally { setSLoading(false); }
    }, 280) as unknown as number;
  };
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setSOpen(false);
      if (cityBox.current && !cityBox.current.contains(e.target as Node)) setCityOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSOpen(false); setCityOpen(false); } };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);
  const pickCity = useCallback((c: string) => { setCity(c); setCityOpen(false); try { localStorage.setItem(CITY_KEY, c); } catch {} }, []);
  const cityName = cities.find((c) => c.CITYCODE === city)?.CITYNAME || 'Semua Kota';
  const requestGpsCity = useCallback(async (silent = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { if (!silent) toast('Geolocation tidak didukung di perangkat ini', 'error'); return; }
    setLocating(true);
    try {
      const pos: GeolocationPosition = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }));
      const { latitude, longitude } = pos.coords;
      let cityGuess = ''; let provGuess = '';
      try {
        const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`);
        if (r.ok) { const j: any = await r.json(); cityGuess = String(j.city || j.locality || ''); provGuess = String(j.principalSubdivision || j.city || ''); }
      } catch {}
      if (!cityGuess && !provGuess) {
        try {
          const r2 = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=id`, { headers: { Accept: 'application/json' } as any });
          if (r2.ok) { const j2: any = await r2.json(); const a = j2.address || {}; cityGuess = String(a.city || a.town || a.village || a.municipality || a.county || ''); provGuess = String(a.state || a.province || ''); }
        } catch {}
      }
      if (!cityGuess && !provGuess) { if (!silent) toast('Gagal mendeteksi kota dari GPS', 'error'); return; }
      const norm = (s: string) => s.toLowerCase().trim();
      const cg = norm(cityGuess); const pg = norm(provGuess);
      let match = cities.find((c) => norm(c.CITYNAME) === cg || norm(c.CITYNAME) === pg);
      if (!match && cg) match = cities.find((c) => norm(c.CITYNAME).includes(cg) || cg.includes(norm(c.CITYNAME)));
      if (!match && pg) match = cities.find((c) => (c.CITYPROV && (norm(c.CITYPROV).includes(pg) || pg.includes(norm(c.CITYPROV)))) || norm(c.CITYNAME).includes(pg));
      if (match) { pickCity(match.CITYCODE); toast(`Lokasi terdeteksi: ${match.CITYNAME}`, 'ok'); }
      else { if (!silent) toast(`Lokasi terdeteksi: ${cityGuess || provGuess}, belum ada di daftar kota`, 'error'); }
    } catch (e: any) {
      if (silent) return;
      const code = e?.code; if (code === 1) toast('Akses lokasi ditolak — aktifkan izin lokasi di browser', 'error');
      else if (code === 2) toast('Lokasi tidak tersedia', 'error');
      else if (code === 3) toast('Waktu permintaan lokasi habis', 'error');
      else toast('Gagal mendapatkan lokasi', 'error');
    } finally { setLocating(false); }
  }, [cities, toast, pickCity]);
  useEffect(() => {
    if (autoGeoTried.current) return;
    let saved = ''; try { saved = localStorage.getItem(CITY_KEY) || ''; } catch {}
    if (saved) return;
    autoGeoTried.current = true;
    const t = window.setTimeout(() => { requestGpsCity(true); }, 900);
    return () => window.clearTimeout(t);
  }, [requestGpsCity]);
  const events: PortalEvent[] = (src?.events as PortalEvent[]) || [];
  const hot: PortalEvent[] = (src?.hot as PortalEvent[]) || [];
  const promos: Promo[] = (src?.promos as Promo[]) || [];
  const news: News[] = (src?.news as News[]) || [];
  const ads: Ad[] = (src?.ads as Ad[]) || [];
  const cats: { CATCODE: string; CATNAME: string }[] = (src?.categories as any[]) || [];
  const cityEvents: PortalEvent[] = city ? events.filter((e) => String((e as any).CITYCODE || '').toUpperCase() === city.toUpperCase()) : events;
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
              <div className="v-search-field" ref={searchBox} style={{ position: 'relative' as const }}>
                <PfIcon name="search" size={16} />
                <label><small>CARI EVENT</small><input value={q} onChange={(e) => onSearchChange(e.target.value)} onFocus={() => { if (suggest.length) setSOpen(true); }} placeholder="Artis, Konser, atau Festival" aria-label="Cari event" autoComplete="off" /></label>
                {sOpen ? (
                  <div className="pf-pop" role="listbox" aria-label="Hasil pencarian" style={{ left: 0, right: 'auto', minWidth: 320, maxWidth: 420 }}>
                    {sLoading ? <div style={{ padding: '12px', fontSize: 12, color: '#64748b' }}>Mencari…</div> : suggest.length ? suggest.map((ev) => (
                      <Link key={ev.EVENTID} href={`/events/${ev.EVENTID}`} className="pf-pop-item" role="option" style={{ gap: 10, alignItems: 'center', textDecoration: 'none' }}>
                        <span style={{ width: 36, height: 36, borderRadius: 8, background: '#f4f4f5', overflow: 'hidden', flex: 'none', display: 'grid', placeItems: 'center' }}>{ev.POSTER ? <img src={assetUrl(ev.POSTER)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PfIcon name="calendar" size={16} />}</span>
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, fontWeight: 700, color: '#18181b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.TITLE}</span><span style={{ fontSize: 11, color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tanggalPendek(ev.STARTAT)} · {ev.VENUE || ev.CITYCODE || '-'}</span></span>
                      </Link>
                    )) : <div style={{ padding: '12px', fontSize: 12, color: '#71717a' }}>Tidak ada event untuk “{q.trim()}”</div>}
                    {!sLoading ? <button type="button" onClick={submitSearch} style={{ width: '100%', marginTop: 6, padding: '8px', borderRadius: 10, border: '1px solid #e6e8ec', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#0e7490', cursor: 'pointer' }}>Lihat semua hasil untuk “{q.trim()}”</button> : null}
                  </div>
                ) : null}
              </div>
              <div className="v-search-field" ref={cityBox} style={{ position: 'relative' as const }}>
                <span style={{ display: 'inline-flex', flex: 'none' }}><PfIcon name="location" size={16} /></span>
                <div className="v-field">
                  <small>LOKASI</small>
                  <div className="v-field-row">
                    <button type="button" onClick={() => setCityOpen((v) => !v)} aria-expanded={cityOpen} aria-haspopup="listbox" title={cityName}>{cityName}</button>
                    <button type="button" className="v-gps-btn" onClick={() => requestGpsCity(false)} disabled={locating} title="Gunakan lokasi GPS" aria-label="Gunakan lokasi GPS">{locating ? <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #a1a1aa', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin .7s linear infinite' } as any} /> : <PfIcon name="location" size={16} />}</button>
                  </div>
                </div>
                {cityOpen ? (
                  <div className="pf-pop" role="listbox" aria-label="Pilih kota" style={{ left: 0, right: 'auto', minWidth: 220 }}>
                    <button type="button" onClick={() => requestGpsCity(false)} disabled={locating} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid #06b6d4', background: '#ecfeff', color: '#0e7490', fontSize: 12, fontWeight: 700, cursor: locating ? 'wait' : 'pointer', marginBottom: 6 }}>{locating ? 'Mendeteksi lokasi…' : 'Gunakan lokasi saya'}<PfIcon name="location" size={16} /></button>
                    <button type="button" role="option" aria-selected={!city} className={`pf-pop-item${!city ? ' is-active' : ''}`} onClick={() => pickCity('')}>Semua Kota{!city ? <PfIcon name="check" size={16} /> : null}</button>
                    {cities.map((c) => (
                      <button key={c.CITYCODE} type="button" role="option" aria-selected={city === c.CITYCODE} className={`pf-pop-item${city === c.CITYCODE ? ' is-active' : ''}`} onClick={() => pickCity(c.CITYCODE)}><span>{c.CITYNAME}</span>{city === c.CITYCODE ? <PfIcon name="check" size={16} /> : null}</button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="v-search-field" style={{ borderRight: 0 }}>
                <PfIcon name="calendar" size={16} />
                <label><small>WAKTU</small><Link href="/events" style={{ fontSize: 12, color: '#18181b', fontWeight: 600, textDecoration: 'none' }}>Kapan Saja</Link></label>
              </div>
              <button type="submit" className="v-search-go" aria-label="Cari"><PfIcon name="arrowRight" size={20} /></button>
            </form>
            {cats.length ? (
              <div className="v-hero-chips">
                {cats.slice(0, 6).map((c) => (
                  <Link key={c.CATCODE} href={`/events?cat=${encodeURIComponent(c.CATCODE)}`} className="v-hero-chip">{c.CATNAME}</Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="v-section">
          <div className="pf-wrap-inner">
            <div className="v-section-head"><h2>Kategori Populer</h2><Link href="/events">Lihat Semua &gt;</Link></div>
            {cats.length ? (
              <div className="v-cat-grid">
                {cats.slice(0, 6).map((c) => (
                  <Link key={c.CATCODE} href={`/events?cat=${encodeURIComponent(c.CATCODE)}`} className="v-cat">
                    <span className="v-cat-ico"><PfIcon name={catIcon(c.CATNAME) as any} size={20} /></span>
                    <span>{c.CATNAME}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="pf-hint">Belum ada kategori</div>
            )}
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
            <div className="v-section-head"><div><div className="v-kicker">EVENT TERDEKAT</div><h2>Populer Di Sekitarmu</h2>{city ? <span style={{ fontSize: 11, color: '#64748b' }}>di {cityName}</span> : null}</div><Link href="/events">Lihat semua</Link></div>
            {loading && !src ? <PfLoadingGrid count={3} /> : cityEvents.length === 0 ? (
              city
                ? <div className="v-card" style={{ padding: 24 }}><PfEmpty icon="calendar" title="Yah, tidak ada event populer di sekitar kamu" hint={`Belum ada event di ${cityName} saat ini — coba pilih Semua Kota atau cari di kota lain.`} /></div>
                : <div className="v-card" style={{ padding: 24 }}><PfEmpty icon="calendar" title="Belum ada event" hint="Event yang dipublikasikan akan muncul di sini." /></div>
            ) : (
              <div className="v-grid-3">
                {cityEvents.slice(0, 3).map((e, i) => (
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
