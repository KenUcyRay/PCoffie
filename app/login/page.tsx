'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { APP_SLUG } from '@/lib/app-config';

function saveToken(token: string) {
  try {
    const slug = APP_SLUG;
    localStorage.setItem(`${slug}::auth::token`, token);
  } catch {}
}

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '';
  const [login, setLogin] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!login.trim()) bad.login = 'Email wajib diisi.';
    if (!pw) bad.password = 'Password wajib diisi.';
    setFieldErr(bad);
    if (Object.keys(bad).length) return;
    setBusy(true);
    setErr('');
    try {
      const res: any = await portalPost('auth/login', { method: 'login', userlogin: login, userpassword: pw }, { auth: false });
      if (!isOk(res) || !res?.token) {
        setErr(res?.message || 'Email atau password salah.');
        setBusy(false);
        return;
      }
      saveToken(String(res.token));
      const me: any = await portalPost('auth/me', { method: 'me' });
      const profile = (typeof me?.profile === 'string' ? JSON.parse(me.profile) : me?.profile) || {};
      const group = String(profile.USERGROUP || '').toUpperCase();
      if (group === 'GROUP_USER') router.push(next || '/');
      else router.push('/control/');
    } catch (e: any) {
      setErr(e?.message || 'Gagal masuk. Coba lagi.');
      setBusy(false);
    }
  };

  return (
    <div className="pc-dark" style={{ minHeight: '100vh', background: '#020617' }}>
      <div className="pc-login">
        <div className="pc-login-left">
          <div style={{ position: 'absolute', inset: 0, opacity: .35, background: `repeating-linear-gradient(90deg,transparent 0 40px,rgba(59,130,246,.08) 40px 41px,transparent 41px 80px),radial-gradient(600px 500px at 40% 30%,rgba(6,182,214,.12),transparent)` }} aria-hidden="true" />
          <div className="pc-login-logo" style={{ zIndex: 1 }}><span className="pc-login-logo-mark">🎮</span>PCoffie</div>
          <div className="pc-login-hero" style={{ zIndex: 1 }}>
            <h1>Booking PC Jadi<br /><em>Lebih Mudah</em></h1>
          </div>
          <div style={{ display: 'grid', gap: 12, zIndex: 1 }}>
            {[
              { i: '⚡', t: 'Booking Online', d: 'Pesan tempat favoritmu kapan saja dan di mana saja.' },
              { i: '🛡', t: 'Tanpa Antri', d: 'Langsung main tanpa harus menunggu giliran di kasir.' },
              { i: '⭐', t: 'Harga Transparan', d: 'Biaya jelas tanpa ada biaya tambahan tersembunyi.' },
            ].map(c => (
              <div key={c.t} className="pc-login-card">
                <span className="pc-login-card-ico">{c.i}</span>
                <div><b>{c.t}</b><p>{c.d}</p></div>
              </div>
            ))}
          </div>
          <div className="pc-login-avatars" style={{ zIndex: 1 }}>
            <span className="pc-login-avatars-stack"><i>U</i><i>U</i><i>U</i><i>U</i></span>
            <span>Bergabung dengan <b>2.500+</b> gamer aktif lainnya.</span>
          </div>
        </div>

        <div className="pc-login-right">
          <form onSubmit={submit} noValidate className="pc-login-box">
            <h2>Selamat Datang Kembali</h2>
            <p className="pc-login-sub">Masuk untuk mulai booking PC pilihanmu.</p>
            {err ? <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>{err}</div> : null}

            <div className="pc-field">
              <label htmlFor="pc-email">Email</label>
              <div className="pc-input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" /><path d="M4 8l8 6 8-6" /></svg>
                <input id="pc-email" className="pc-input" value={login} onChange={e => setLogin(e.target.value)} placeholder="nama@email.com" autoComplete="username" autoCapitalize="none" spellCheck={false} required style={fieldErr.login ? { borderColor: '#ef4444' } : undefined} />
              </div>
              {fieldErr.login ? <span style={{ fontSize: 11, color: '#fca5a5' }}>{fieldErr.login}</span> : null}
            </div>

            <div className="pc-field">
              <label htmlFor="pc-pw">Password <Link href="#">Lupa password?</Link></label>
              <div className="pc-input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <input id="pc-pw" className="pc-input" type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" required style={{ paddingRight: 40, borderColor: fieldErr.password ? '#ef4444' : undefined }} />
                <button type="button" className="pc-eye" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Sembunyi' : 'Lihat'}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>
              {fieldErr.password ? <span style={{ fontSize: 11, color: '#fca5a5' }}>{fieldErr.password}</span> : null}
            </div>

            <label className="pc-check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Ingat saya di perangkat ini</label>

            <button type="submit" disabled={busy} className="pc-btn-primary" style={{ width: '100%', height: 42, borderRadius: 6, justifyContent: 'center' }}>
              {busy ? 'Memproses…' : 'Masuk'} <span aria-hidden="true">→</span>
            </button>

            <div className="pc-divider">ATAU</div>

            <button type="button" className="pc-btn-ghost" style={{ width: '100%', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 16, height: 16, background: '#fff', borderRadius: 2, display: 'inline-block' }} />
              Masuk dengan Google
            </button>

            <p className="pc-login-foot">Belum punya akun? <Link href="#">Daftar</Link></p>
            <p style={{ textAlign: 'center', fontSize: 10, color: '#475569' }}><Link href="/" style={{ color: '#475569' }}>← Kembali ke Beranda</Link> · <Link href="/control" style={{ color: '#3b82f6' }}>Console</Link></p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="pc-dark" style={{ minHeight: '100vh', background: '#020617', display: 'grid', placeItems: 'center', color: '#64748b' }}>Memuat…</div>}>
      <LoginForm />
    </Suspense>
  );
}
