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
import PfIcon from '@/components/portal/PfIcon';
import { PfAlert, PfButton, PfField } from '@/components/portal/ui';

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
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Tampilan saja: tandai isian kosong lalu fokuskan yang pertama salah.
    const bad: Record<string, string> = {};
    if (!login.trim()) bad.login = 'Username wajib diisi.';
    if (!password) bad.password = 'Password wajib diisi.';
    setFieldErr(bad);
    if (Object.keys(bad).length) {
      document.getElementById(`pf-${Object.keys(bad)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const res: any = await portalPost('auth/login', { method: 'login', userlogin: login, userpassword: password }, { auth: false });
      if (!isOk(res) || !res?.token) {
        // Pesan sengaja umum: tidak membedakan username salah vs password salah.
        setErr(res?.message || 'Username atau password salah.');
        setFieldErr({ password: 'Periksa kembali username dan password Anda.' });
        document.getElementById('pf-login')?.focus();
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

  const [showPw, setShowPw] = useState(false);
  return (
    <div className="pf-auth">
      <div className="pf-auth-card">
        <div className="pf-auth-form">
          <Link href={`/`} className="pf-auth-back">← Back to Homepage</Link>
          <div className="pf-auth-brand">
            <span className="pf-auth-brand-mark">T</span>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.02em' }}>Tiket APP</span>
          </div>
          <h1 className="pf-auth-title">Sign In</h1>
          <p className="pf-auth-sub">Sign in to manage the application. Accounts are created by admin.</p>
          {err ? <div style={{ marginTop: 16 }}><PfAlert tone="error">{err}</PfAlert></div> : null}
          {info ? <div style={{ marginTop: 16 }}><PfAlert tone="ok">{info}</PfAlert></div> : null}
          <form className="pf-col pf-gap-md" onSubmit={submit} noValidate style={{ marginTop: 16 }}>
            <PfField label="Username" required htmlFor="pf-login" error={fieldErr.login}>
              <input id="pf-login" className="pf-input" value={login} autoComplete="username"
                autoCapitalize="none" spellCheck={false} placeholder="username"
                onChange={(e) => setLogin(e.target.value)} required />
            </PfField>
            <PfField label="Password" required htmlFor="pf-password" error={fieldErr.password}>
              <div style={{ position: 'relative' }}>
                <input id="pf-password" className="pf-input" type={showPw ? 'text' : 'password'} value={password}
                  autoComplete="current-password" placeholder="••••••••" style={{ paddingRight: 44 }}
                  onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 0, color: '#71717a', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 6 }}>
                  <PfIcon name={showPw ? 'close' : 'shield'} size={16} />
                </button>
              </div>
            </PfField>
            <PfButton type="submit" size="lg" block busy={busy} busyLabel="Checking…" style={{ borderRadius: 9999, background: '#6b5cff', borderColor: '#6b5cff', boxShadow: '0 10px 20px rgba(107,92,255,.18)' } as any}>
              {busy ? 'Checking…' : 'Sign In'}
            </PfButton>
          </form>
          <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#71717a' }}>
            Don&apos;t have an account? <Link href={`/register`} style={{ fontWeight: 600, color: '#3f3f46' }}>Daftar</Link> · <Link href={`/console/`} style={{ fontWeight: 600, color: '#6b5cff' }}>Operator / Console</Link>
          </p>
        </div>
        <div className="pf-auth-side" aria-hidden="true">
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(140deg,#6b5cff,#312e81)', opacity: .98 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.9)', padding: 24, textAlign: 'center' }}>
            <div>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', margin: '0 auto 16px', border: '1px solid rgba(255,255,255,.2)' }}><PfIcon name="ticket" size={24} /></div>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Tiket APP</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.82)', marginTop: 6, maxWidth: 260, lineHeight: 1.5 }}>Platform tiket terbesar — cari event, beli tiket, QR langsung di akun.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PortalShell>
      <Suspense fallback={<div className="pf-auth"><div className="pf-auth-card"><div className="pf-skel" style={{ height: 340, borderRadius: 18 }} /></div></div>}>
        <LoginForm />
      </Suspense>
    </PortalShell>
  );
}