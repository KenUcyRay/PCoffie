'use client';

// Login portal. Memakai endpoint auth/login yang SAMA dengan Console
// (Mlogin -> SP_USERLOGIN -> JWT + T_USER_SESSION + LoginTrail).
// Tidak ada pendaftaran mandiri di backend yang berbeda; daftar akun memakai
// endpoint portal/public/auth/register (GROUP_USER).

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalShell from '@/components/portal/PortalShell';

function saveToken(token: string) {
  try {
    const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/tiket-app').replace(/^\/|\/+$/g, '');
    localStorage.setItem(`${slug}::auth::token`, token);
  } catch { /* ignore */ }
}

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '';
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const res: any = await portalPost('auth/login', { method: 'login', userlogin: login, userpassword: password }, { auth: false });
      if (!isOk(res) || !res?.token) {
        // Pesan sengaja umum: tidak membedakan username salah vs password salah.
        setErr(res?.message || 'Username atau password salah.');
        setBusy(false);
        return;
      }
      saveToken(String(res.token));
      const me: any = await portalPost('auth/me', { method: 'me' });
      const profile = (typeof me?.profile === 'string' ? JSON.parse(me.profile) : me?.profile) || {};
      const group = String(profile.USERGROUP || '').toUpperCase();
      if (group === 'GROUP_USER') {
        router.push(next || '/');
      } else {
        // Akun operator diarahkan ke Console.
        router.push(`/console/`);
      }
    } catch (e: any) {
      setErr(e?.message || 'Gagal masuk. Coba lagi.');
      setBusy(false);
    }
  };

  return (
    <div className="pf-wrap" style={{ maxWidth: 460, paddingTop: 24 }}>
      <div className="pf-card">
        <div className="pf-card-pad pf-col" style={{ gap: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 850, letterSpacing: '-.02em' }}>Masuk</div>
            <div className="pf-dim">Gunakan akun yang sudah terdaftar untuk melihat tiket dan pesanan Anda.</div>
          </div>

          {err ? <div className="pf-alert pf-alert-error">{err}</div> : null}
          {info ? <div className="pf-alert pf-alert-ok">{info}</div> : null}

          <form className="pf-col" style={{ gap: 12 }} onSubmit={submit}>
            <label className="pf-field">
              <span className="pf-label">Username</span>
              <input className="pf-input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
            </label>
            <label className="pf-field">
              <span className="pf-label">Password</span>
              <input className="pf-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button className="pf-btn pf-btn-block" type="submit" disabled={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
          </form>

          <div className="pf-row pf-gap-sm" style={{ justifyContent: 'space-between' }}>
            <Link href={`/register`} className="pf-dim" style={{ fontWeight: 700, color: 'var(--pf-accent)' }}>Belum punya akun? Daftar</Link>
            <Link href={`/console/`} className="pf-tiny">Operator / Console</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PortalShell>
      <Suspense fallback={<div className="pf-wrap" style={{ paddingTop: 24 }}><div className="pf-skel" style={{ height: 320, borderRadius: 16 }} /></div>}>
        <LoginForm />
      </Suspense>
    </PortalShell>
  );
}