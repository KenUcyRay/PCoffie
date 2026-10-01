'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useLastLoginPrefill } from '@/lib/auth';
import { Btn, Icon } from './Icon';

// Tiruan LoginExpired.js: dialog di atas shell (bukan pindah halaman),
// dengan prefill user login terakhir dan resume bila user sama.
export default function ExpiredDialog() {
  const { status, login, profile, logout } = useAuth();
  const router = useRouter();
  const prefill = useLastLoginPrefill();
  const [userlogin, setUserlogin] = useState('');
  const [userpassword, setUserpassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefill && !userlogin) setUserlogin(prefill);
  }, [prefill, userlogin]);

  if (status !== 'expired') return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    // Tiruan handleLoginSuccess langit_v2: user sama -> resume di halaman ini,
    // user beda -> muat ulang aplikasi supaya konteks & hak akses ikut segar.
    const prevUser = String(profile?.USERLOGIN || '').toLowerCase();
    const nextUser = userlogin.trim().toLowerCase();
    try {
      await login(userlogin, userpassword);
      if (prevUser && nextUser && prevUser !== nextUser) window.location.reload();
    } catch (e: any) {
      setErr(e.message || 'Login gagal.');
    } finally {
      setBusy(false);
    }
  };

  const submitLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="modal-wrap">
      <form onSubmit={submit} className="modal">
        <div className="modal-head"><Icon name="lock" size={17} /> Login Kembali</div>
        <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>Sesi login sudah habis. Silakan login kembali.</span></div>
        {err && <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{err}</span></div>}
        <label>User Login</label>
        <input className="input" value={userlogin || profile?.USERLOGIN || ''} onChange={(e) => setUserlogin(e.target.value)} autoFocus />
        <label>Password</label>
        <input className="input" type="password" value={userpassword} onChange={(e) => setUserpassword(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn className="primary" type="submit" icon="login" disabled={busy}>{busy ? 'Memproses...' : 'Login'}</Btn>
          <Btn icon="logout" onClick={submitLogout}>Logout</Btn>
        </div>
      </form>
    </div>
  );
}