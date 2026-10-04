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

  return (
    <div className="pf-auth">
      <div className="pf-auth-card">
        <div className="pf-auth-head">
          <div className="pf-auth-mark"><PfIcon name="user" size={24} /></div>
          <h1 className="pf-h1">Masuk</h1>
          <p className="pf-dim" style={{ marginTop: 6 }}>
            Gunakan akun yang sudah terdaftar untuk melihat tiket dan pesanan Anda.
          </p>
        </div>

        <div className="pf-card">
          <div className="pf-card-pad pf-col pf-gap-md">
            {err ? <PfAlert tone="error">{err}</PfAlert> : null}
            {info ? <PfAlert tone="ok">{info}</PfAlert> : null}

            <form className="pf-col pf-gap-md" onSubmit={submit} noValidate>
              <PfField label="Username" required htmlFor="pf-login" error={fieldErr.login}>
                <input id="pf-login" className="pf-input" value={login} autoComplete="username"
                  autoCapitalize="none" spellCheck={false}
                  onChange={(e) => setLogin(e.target.value)} required />
              </PfField>

              <PfField label="Password" required htmlFor="pf-password" error={fieldErr.password}>
                <input id="pf-password" className="pf-input" type="password" value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} required />
              </PfField>

              <PfButton type="submit" size="lg" block icon="logout"
                busy={busy} busyLabel="Memproses…">
                Masuk
              </PfButton>
            </form>

            <div className="pf-auth-foot">
              <span className="pf-dim">Belum punya akun?</span>
              <Link href={`/register`} className="pf-auth-link">Daftar</Link>
              <Link href={`/console/`} className="pf-auth-link pf-row pf-gap-xs">
                <PfIcon name="shield" size={16} /> Operator / Console
              </Link>
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