'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/route';
import { Btn, Icon } from './Icon';
import { Window, FrmRow } from './Window';

// Tiruan LoginExpired.js: dialog di atas shell (bukan pindah halaman),
// dengan resume bila user yang login kembali sama.
export default function ExpiredDialog() {
  const { status, login, profile, logout } = useAuth();
  const { navigate } = useRoute();
  const [userlogin, setUserlogin] = useState('');
  const [userpassword, setUserpassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
    navigate('/login');
  };

  return (
    <Window
      title="Login Kembali"
      icon="lock"
      width="420px"
      footer={
        <>
          <Btn className="primary" type="submit" form="expired-login-form" icon="login" disabled={busy}>
            {busy ? 'Memproses...' : 'Login'}
          </Btn>
          <Btn icon="logout" onClick={submitLogout}>Logout</Btn>
        </>
      }
    >
      <form id="expired-login-form" onSubmit={submit} className="frm">
        <div className="toast-err alert-inline"><Icon name="alertCircle" size={16} /><span>Sesi login sudah habis. Silakan login kembali.</span></div>
        {err && <div className="toast-err alert-inline"><Icon name="alertCircle" size={16} /><span>{err}</span></div>}
        <FrmRow label="User Login">
          <input className="input" value={userlogin || profile?.USERLOGIN || ''} onChange={(e) => setUserlogin(e.target.value)} autoFocus autoComplete="username" />
        </FrmRow>
        <FrmRow label="Password">
          <input className="input" type="password" value={userpassword} onChange={(e) => setUserpassword(e.target.value)} />
        </FrmRow>
      </form>
    </Window>
  );
}