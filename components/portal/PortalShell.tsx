'use client';

// =============================================================================
// SHELL PORTAL PEMBELI
// -----------------------------------------------------------------------------
// Navbar (desktop) + tabbar bawah (ponsel) + menu selengkapnya di ponsel.
// Menu sidebar milik Console TIDAK dipakai di sini.
//
//.href di dalam app TIDAK memakai basePath (Next menambahkannya sendiri).
// =============================================================================

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { portalPost, isOk } from '@/lib/portal/api';
import '@/app/portal.css';
import PfIcon, { type PfIconName } from './PfIcon';
import { PfButton, PfSheet } from './ui';

type Props = {
  children: React.ReactNode;
  appName?: string;
  cities?: { CITYCODE: string; CITYNAME: string; CITYPROV?: string }[];
};

const TABS: { href: string; label: string; icon: PfIconName }[] = [
  { href: '/', label: 'Beranda', icon: 'home' },
  { href: '/events', label: 'Event', icon: 'calendar' },
  { href: '/merch', label: 'Merch', icon: 'merch' },
  { href: '/tickets', label: 'Tiket', icon: 'ticket' },
  { href: '/account', label: 'Akun', icon: 'user' },
];

const MORE: { href: string; label: string; icon: PfIconName }[] = [
  { href: '/orders', label: 'Pesanan tiket', icon: 'receipt' },
  { href: '/purchases', label: 'My Purchase', icon: 'package' },
  { href: '/payments', label: 'Riwayat pembayaran', icon: 'card' },
  { href: '/invoices', label: 'Invoice', icon: 'receipt' },
  { href: '/refunds', label: 'Refund', icon: 'refresh' },
  { href: '/cart', label: 'Keranjang', icon: 'cart' },
  { href: '/news', label: 'Berita', icon: 'news' },
  { href: '/promos', label: 'Promo', icon: 'discount' },
];

const CITY_KEY = `${BASE_PATH.replace(/\//g, '')}::city`;

export default function PortalShell({ children, appName = 'Tiket APP', cities = [] }: Props) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [q, setQ] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [city, setCity] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const cityBox = useRef<HTMLDivElement>(null);

  // Nama aplikasi + kota pilihan disimpan per perangkat.
  useEffect(() => {
    try { setCity(localStorage.getItem(CITY_KEY) || ''); } catch { /* ignore */ }
  }, []);

  // Navbar beri bayangan setelah halaman digulir.
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cek login quietly (hanya untuk tombol Masuk / menu akun).
  useEffect(() => {
    let stop = false;
    portalPost('portal/whoami', {}, { auth: true })
      .then((r) => { if (!stop && isOk(r)) setLogin(String(r?.profile?.USERLOGIN || '')); })
      .catch(() => { /* belum login */ });
    return () => { stop = true; };
  }, [pathname]);

  // Tutup dropdown kota saat klik di luar atau tekan Escape.
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

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/events${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  const pickCity = (c: string) => {
    setCity(c);
    setCityOpen(false);
    try { localStorage.setItem(CITY_KEY, c); } catch { /* ignore */ }
    router.push(`/events${c ? `?city=${encodeURIComponent(c)}` : ''}`);
  };

  // Di beranda, pencarian besar & pemilih kota sudah ada di hero.
  const isHome = pathname === '/';

  const isActive = (href: string) => {
    const p = href || '/';
    return p === '/' ? pathname === '/' : pathname.startsWith(p);
  };

  const cityName = (code: string) => cities.find((c) => c.CITYCODE === code)?.CITYNAME || code || 'Semua kota';

  return (
    <div className="pf-root">
      <header className={`pf-nav${stuck ? ' is-stuck' : ''}`}>
        <div className="pf-wrap pf-nav-inner">
          <Link href={`/`} className="pf-logo">
            <span className="pf-logo-mark" aria-hidden="true">T</span>
            <span className="pf-logo-text">
              {appName}
              <small>Tiket &amp; merchandise</small>
            </span>
          </Link>

          <form className={`pf-nav-search${isHome ? ' is-hero' : ''}`} onSubmit={submitSearch} role="search">
            <PfIcon name="search" size={20} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari event, berita, promo…"
              aria-label="Cari event, berita, promo"
            />
            <button type="submit" className="pf-btn pf-btn-sm" aria-label="Cari">Cari</button>
          </form>

          <div ref={cityBox} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`pf-city${cityOpen ? ' is-open' : ''}${isHome ? ' is-hero' : ''}`}
              onClick={() => setCityOpen((v) => !v)}
              aria-expanded={cityOpen}
              aria-haspopup="listbox"
            >
              <PfIcon name="location" size={20} />
              <span>{cityName(city)}</span>
              <PfIcon name="chevronDown" size={16} />
            </button>
            {cityOpen ? (
              <div className="pf-pop" role="listbox" aria-label="Pilih kota">
                <button type="button" className={`pf-pop-item${!city ? ' is-active' : ''}`}
                  onClick={() => pickCity('')} role="option" aria-selected={!city}>
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
                {cities.length === 0 ? <span className="pf-hint" style={{ padding: '8px 12px', display: 'block' }}>Kota belum tersedia</span> : null}
              </div>
            ) : null}
          </div>

          <div className="pf-row pf-gap-sm" style={{ marginLeft: 'auto' }}>
            <Link href={`/cart`} className="pf-iconbtn pf-only-mobile" aria-label="Keranjang">
              <PfIcon name="cart" size={20} />
            </Link>
            {login ? (
              <Link href={`/account`} className="pf-btn pf-btn-soft pf-btn-sm pf-only-mobile">Akun</Link>
            ) : (
              <Link href={`/login`} className="pf-btn pf-btn-sm pf-only-mobile">Masuk</Link>
            )}
            <button
              type="button"
              className="pf-iconbtn pf-only-mobile"
              onClick={() => setMenuOpen(true)}
              aria-label="Buka menu"
              aria-haspopup="dialog"
            >
              <PfIcon name="menu" size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className={`pf-main${isHome ? ' pf-main--home' : ''}`}>
        {isHome ? children : <div className="pf-wrap">{children}</div>}
      </main>

      <footer className="pf-foot">
        <div className="pf-wrap">
          <div className="pf-foot-grid">
            <div className="pf-col pf-gap-sm">
              <span className="pf-row pf-gap-sm">
                <span className="pf-logo-mark" aria-hidden="true" style={{ width: 30, height: 30, fontSize: 14, borderRadius: 9 }}>T</span>
                <strong style={{ fontSize: 16, letterSpacing: '-.02em' }}>{appName}</strong>
              </span>
              <p className="pf-foot-note">
                Beli tiket event dan merchandise dengan pembayaran yang tercatat rapi.
                Tiket dan QR langsung tersimpan di akun Anda.
              </p>
            </div>
            <div>
              <div className="pf-foot-title">Jelajahi</div>
              <div className="pf-foot-list">
                <Link href="/events">Event</Link>
                <Link href="/merch">Merchandise</Link>
                <Link href="/news">Berita</Link>
                <Link href="/promos">Promo</Link>
              </div>
            </div>
            <div>
              <div className="pf-foot-title">Akun</div>
              <div className="pf-foot-list">
                <Link href="/tickets">Tiket saya</Link>
                <Link href="/orders">Pesanan</Link>
                <Link href="/purchases">My Purchase</Link>
                <Link href="/cart">Keranjang</Link>
                <Link href="/account">Profil</Link>
              </div>
            </div>
          </div>
          <div className="pf-foot-bottom">
            <span>{appName}. Semua harga dalam Rupiah.</span>
            <Link href="/console" className="pf-row pf-gap-xs" style={{ fontWeight: 700 }}>
              <PfIcon name="lock" size={16} />
              Masuk Console
            </Link>
          </div>
        </div>
      </footer>

      <nav className="pf-tabbar" aria-label="Menu utama">
        <div className="pf-tabbar-inner">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href}
              className={`pf-tab${isActive(t.href) ? ' is-active' : ''}`}
              aria-current={isActive(t.href) ? 'page' : undefined}>
              <PfIcon name={t.icon} size={24} />
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <PfSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <form className="pf-searchbar" onSubmit={submitSearch} role="search">
          <PfIcon name="search" size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Cari event, berita, promo…" aria-label="Cari event, berita, promo" />
          <button type="submit" className="pf-btn pf-btn-sm">Cari</button>
        </form>
        {login ? (
          <Link href="/account" className={`pf-menu-item${isActive('/account') ? ' is-active' : ''}`}
            onClick={() => setMenuOpen(false)}>
            <PfIcon name="user" size={20} />
            Akun saya
            <PfIcon name="chevronRight" size={16} />
          </Link>
        ) : (
          <PfButton block icon="user" onClick={() => { setMenuOpen(false); router.push('/login'); }}>
            Masuk ke akun
          </PfButton>
        )}
        <div className="pf-col pf-gap-xs">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href}
              className={`pf-menu-item${isActive(m.href) ? ' is-active' : ''}`}
              onClick={() => setMenuOpen(false)}>
              <PfIcon name={m.icon} size={20} />
              {m.label}
            </Link>
          ))}
        </div>
      </PfSheet>
    </div>
  );
}