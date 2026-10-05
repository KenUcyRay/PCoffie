'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { portalPost, isOk } from '@/lib/portal/api';
import '@/app/portal.css';
import PfIcon, { type PfIconName } from './PfIcon';
import { PfButton, PfSheet } from './ui';

type Props = { children: React.ReactNode; appName?: string };

const TABS: { href: string; label: string; icon: PfIconName }[] = [
  { href: '/', label: 'Beranda', icon: 'home' },
  { href: '/account', label: 'Akun', icon: 'user' },
];

const MORE: { href: string; label: string; icon: PfIconName }[] = [];

export default function PortalShell({ children, appName = 'PCOFFIE' }: Props) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [q, setQ] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    let stop = false;
    portalPost('portal/whoami', {}, { auth: true })
      .then((r) => { if (!stop && isOk(r)) setLogin(String(r?.profile?.USERLOGIN || '')); })
      .catch(() => {});
    return () => { stop = true; };
  }, [pathname]);
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); router.push(`/?q=${encodeURIComponent(q.trim())}`); };
  const isHome = pathname === '/';
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <div className="pf-root">
      <header className={`pf-nav${stuck ? ' is-stuck' : ''}`}>
        <div className="pf-wrap pf-nav-inner">
          <Link href={`/`} className="pf-logo">
            <span className="pf-logo-mark" aria-hidden="true">P</span>
            <span className="pf-logo-text">{appName}<small>Warnet</small></span>
          </Link>
          <form className={`pf-nav-search${isHome ? ' is-hero' : ''}`} onSubmit={submitSearch} role="search">
            <PfIcon name="search" size={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label="Cari" />
            <button type="submit" className="pf-btn pf-btn-sm">Cari</button>
          </form>
          <div className="pf-row pf-gap-sm" style={{ marginLeft: 'auto' }}>
            {login ? <Link href={`/account`} className="pf-btn pf-btn-soft pf-btn-sm pf-only-mobile">Akun</Link> : <Link href={`/login`} className="pf-btn pf-btn-sm pf-only-mobile">Masuk</Link>}
            <button type="button" className="pf-iconbtn pf-only-mobile" onClick={() => setMenuOpen(true)} aria-label="Buka menu"><PfIcon name="menu" size={20} /></button>
          </div>
        </div>
      </header>
      <main className={`pf-main${isHome ? ' pf-main--home' : ''}`}>{isHome ? children : <div className="pf-wrap">{children}</div>}</main>
      <footer className="pf-foot">
        <div className="pf-wrap">
          <div className="pf-foot-grid">
            <div className="pf-col pf-gap-sm">
              <span className="pf-row pf-gap-sm"><span className="pf-logo-mark" aria-hidden="true" style={{ width: 30, height: 30, fontSize: 14, borderRadius: 9 }}>P</span><strong style={{ fontSize: 16 }}>{appName}</strong></span>
              <p className="pf-foot-note">Sistem warnet PCOFFIE — kelola PC, paket, sesi, dan billing.</p>
            </div>
            <div><div className="pf-foot-title">Akun</div><div className="pf-foot-list"><Link href="/account">Profil</Link><Link href="/console">Console</Link></div></div>
          </div>
          <div className="pf-foot-bottom"><span>{appName}. Warnet system.</span><Link href="/console" className="pf-row pf-gap-xs" style={{ fontWeight: 700 }}><PfIcon name="lock" size={16} />Masuk Console</Link></div>
        </div>
      </footer>
      <nav className="pf-tabbar" aria-label="Menu utama">
        <div className="pf-tabbar-inner">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`pf-tab${isActive(t.href) ? ' is-active' : ''}`} aria-current={isActive(t.href) ? 'page' : undefined}><PfIcon name={t.icon} size={24} /><span>{t.label}</span></Link>
          ))}
        </div>
      </nav>
      <PfSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <form className="pf-searchbar" onSubmit={submitSearch} role="search"><PfIcon name="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label="Cari" /><button type="submit" className="pf-btn pf-btn-sm">Cari</button></form>
        {login ? <Link href="/account" className={`pf-menu-item${isActive('/account') ? ' is-active' : ''}`} onClick={() => setMenuOpen(false)}><PfIcon name="user" size={20} />Akun saya<PfIcon name="chevronRight" size={16} /></Link> : <PfButton block icon="user" onClick={() => { setMenuOpen(false); router.push('/login'); }}>Masuk ke akun</PfButton>}
        {MORE.length ? <div className="pf-col pf-gap-xs">{MORE.map((m) => (<Link key={m.href} href={m.href} className={`pf-menu-item${isActive(m.href) ? ' is-active' : ''}`} onClick={() => setMenuOpen(false)}><PfIcon name={m.icon} size={20} />{m.label}</Link>))}</div> : null}
      </PfSheet>
    </div>
  );
}
