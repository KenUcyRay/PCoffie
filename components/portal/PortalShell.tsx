'use client';

// Shell portal pembeli: navbar (desktop) + tabbar (ponsel).
// Menu sidebar milik Console TIDAK dipakai di sini.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { portalPost, isOk } from '@/lib/portal/api';
import '@/app/portal.css';

type Props = {
  children: React.ReactNode;
  appName?: string;
  cities?: { CITYCODE: string; CITYNAME: string; CITYPROV?: string }[];
};

const TABS = [
  { href: `/`, label: 'Beranda', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { href: `/events`, label: 'Event', icon: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4' },
  { href: `/merch`, label: 'Merch', icon: 'M6 7h12l1 13H5L6 7zM9 7a3 3 0 0 1 6 0' },
  { href: `/tickets`, label: 'Tiket', icon: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z' },
  { href: `/account`, label: 'Akun', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
];

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function PortalShell({ children, appName = 'Tiket APP', cities = [] }: Props) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [q, setQ] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [city, setCity] = useState<string>('');

  // Nama aplikasi + kota pilihan disimpan per perangkat.
  useEffect(() => {
    try {
      setCity(localStorage.getItem(`${BASE_PATH.replace(/\//g, '')}::city`) || '');
    } catch { /* ignore */ }
  }, []);

  // Cek login quietly (hanya untuk tombol Masuk / menu akun).
  useEffect(() => {
    let stop = false;
    portalPost('portal/whoami', {}, { auth: true })
      .then((r) => { if (!stop && isOk(r)) setLogin(String(r?.profile?.USERLOGIN || '')); })
      .catch(() => { /* belum login */ });
    return () => { stop = true; };
  }, [pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/events${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  const pickCity = (c: string) => {
    setCity(c);
    setCityOpen(false);
    try { localStorage.setItem(`${BASE_PATH.replace(/\//g, '')}::city`, c); } catch { /* ignore */ }
    router.push(`/events${c ? `?city=${encodeURIComponent(c)}` : ''}`);
  };

  // href di dalam app TIDAK memakai basePath (Next menambahkannya sendiri).
  const isActive = (href: string) => {
    const p = href || '/';
    return p === '/' ? pathname === '/' : pathname.startsWith(p);
  };

  const cityName = (code: string) => cities.find((c) => c.CITYCODE === code)?.CITYNAME || code || 'Semua kota';

  return (
    <div className="pf-root">
      <header className="pf-nav">
        <div className="pf-wrap pf-nav-inner">
          <Link href={`/`} className="pf-logo">
            <span className="pf-logo-mark">T</span>
            <span>{appName}</span>
          </Link>

          <form className="pf-nav-search" onSubmit={submitSearch}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari event, berita, promo…" aria-label="Cari" />
          </form>

          <div style={{ position: 'relative' }}>
            <button type="button" className="pf-city" onClick={() => setCityOpen((v) => !v)} aria-expanded={cityOpen}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
              {cityName(city)}
            </button>
            {cityOpen && (
              <div className="pf-card" style={{ position: 'absolute', right: 0, top: 46, width: 260, zIndex: 50 }}>
                <div className="pf-card-pad pf-col" style={{ gap: 2, maxHeight: 320, overflow: 'auto' }}>
                  <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => pickCity('')}>
                    Semua kota
                  </button>
                  {cities.map((c) => (
                    <button key={c.CITYCODE} type="button" className="pf-btn pf-btn-ghost pf-btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => pickCity(c.CITYCODE)}>
                      {c.CITYNAME}
                    </button>
                  ))}
                  {cities.length === 0 && <span className="pf-tiny">Kota belum tersedia</span>}
                </div>
              </div>
            )}
          </div>

          {login ? (
            <Link href={`/account`} className="pf-btn pf-btn-soft pf-btn-sm pf-only-mobile">Akun</Link>
          ) : (
            <Link href={`/login`} className="pf-btn pf-btn-sm pf-only-mobile">Masuk</Link>
          )}
        </div>
      </header>

      <main className="pf-main">
        <div className="pf-wrap">{children}</div>
      </main>

      <nav className="pf-tabbar" aria-label="Menu utama">
        <div className="pf-tabbar-inner">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`pf-tab${isActive(t.href) ? ' is-active' : ''}`}>
              <Icon d={t.icon} />
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}