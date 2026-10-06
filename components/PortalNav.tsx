'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { portalPost } from '@/lib/portal/api';

export default function PortalNav({ appName }: { appName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isUser, setIsUser] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/pcoffie').replace(/^\/|\/+$/g, '');
      const tok = localStorage.getItem(`${slug}::auth::token`);
      setAuthed(!!tok);
      if (tok) {
        portalPost('auth/me', { method: 'me' }).then((me: any) => {
          const profile = typeof me?.profile === 'string' ? JSON.parse(me.profile) : me?.profile || me;
          const g = String(profile?.USERGROUP || me?.USERGROUP || '').toUpperCase();
          setIsUser(g === 'GROUP_USER');
        }).catch(() => {});
      }
    } catch {}
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);
  const logout = async () => {
    try { await portalPost('auth/logout', { method: 'logout' }).catch(() => {}); } catch {}
    try {
      const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/pcoffie').replace(/^\/|\/+$/g, '');
      localStorage.removeItem(`${slug}::auth::token`);
    } catch {}
    setAuthed(false); setOpen(false); router.push('/login');
  };
  return (
    <nav className="pc-nav">
      <Link href="/" className="pc-nav-logo"><span className="pc-nav-logo-mark">🎮</span>{appName || 'PCoffie'}</Link>
      <div className="pc-nav-links">
        <Link href="/#beranda">Beranda</Link>
        <Link href="/#fasilitas">Fasilitas</Link>
        <Link href="/#harga">Harga</Link>
        <Link href="/reservasi">Reservasi</Link>
        <Link href="/#kontak">Kontak</Link>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {authed ? (
          <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(v => !v)} className="pc-btn-ghost" style={{ gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 999, background: '#3b82f6', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 11 }}>U</span>
              Profil Kamu
              <span style={{ fontSize: 10, opacity: .7 }}>{open ? '▲' : '▼'}</span>
            </button>
            {open ? (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 180, background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 12, padding: 6, display: 'grid', gap: 2, zIndex: 40, boxShadow: '0 12px 32px rgba(2,6,23,.5)' }}>
                <Link href="/reservasi" onClick={() => setOpen(false)} style={{ padding: '9px 12px', borderRadius: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 700, background: 'transparent' }}>Reservasi</Link>
                <Link href="/akun?tab=riwayat" onClick={() => setOpen(false)} style={{ padding: '9px 12px', borderRadius: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>History</Link>
                <button onClick={logout} style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 8, color: '#f87171', fontSize: 12, fontWeight: 700, background: 'transparent', border: 0, cursor: 'pointer' }}>Logout</button>
              </div>
            ) : null}
          </div>
        ) : (
          <Link href="/login" className="pc-btn-primary">Masuk</Link>
        )}
      </div>
    </nav>
  );
}
