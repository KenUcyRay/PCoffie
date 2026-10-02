'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/route';
import { Btn, Icon } from './Icon';

// Halaman login sekarang jadi komponen biasa, bukan route /login terpisah
// (URL harus selalu /app-core). Di-mount dari app/page.tsx saat status 'guest'.
//
// Catatan: varian "Sesi Habis" yang dulu ada di sini sudah tidak pernah
// terpicu (tidak ada yang menuju /login?expired=1). Kasus sesi habis ditangani
// ExpiredDialog di atas shell, sesuai LoginExpired.js langit_v2.
export default function LoginPage() {
  const { login } = useAuth();
  const { navigate } = useRoute();
  const [userlogin, setUserlogin] = useState('');
  const [userpassword, setUserpassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(userlogin, userpassword);
      navigate('/');
    } catch (e: any) {
      setErr(e.message || 'Login gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <h1><Icon name="layout" size={34} /> App Core</h1>
      </div>
      <div className="login-form-wrap">
        <form onSubmit={submit} className="login-form">
          <h2 className="login-title">
            <Icon name="login" size={22} />
            Login
          </h2>
          {err && (
            <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{err}</span></div>
          )}
          <label>User Login</label>
          <input className="input" value={userlogin} onChange={(e) => setUserlogin(e.target.value)} required autoFocus autoComplete="username" />
          <div style={{ height: 8 }} />
          <label>Password</label>
          <input className="input" type="password" value={userpassword} onChange={(e) => setUserpassword(e.target.value)} required autoComplete="current-password" />
          <div style={{ height: 12 }} />
          <Btn className="primary" icon="login" style={{ width: '100%' }} type="submit" disabled={busy}>
            {busy ? 'Memproses...' : 'Login'}
          </Btn>
        </form>
      </div>
    </div>
  );
}