'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from './Icon';
import { Window, FrmRow } from './Window';

// Dialog sesi habis: HANYA form login ulang (tanpa tombol Logout), sesuai
// halaman login biasa. User sama -> lanjut di halaman ini; user beda -> muat
// ulang aplikasi supaya konteks & hak akses ikut segar.
export default function ExpiredDialog() {
  const { status, login, profile } = useAuth();
  const [userlogin, setUserlogin] = useState('');
  const [userpassword, setUserpassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (status !== 'expired') return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const u = userlogin.trim();
    if (!u) { setErr('Masukkan user login.'); return; }
    if (!userpassword) { setErr('Masukkan password.'); return; }
    setBusy(true);
    const prevUser = String(profile?.USERLOGIN || '').toLowerCase();
    const nextUser = u.toLowerCase();
    try {
      await login(u, userpassword);
      if (prevUser && nextUser && prevUser !== nextUser) window.location.reload();
    } catch (e: any) {
      setErr(e.message || 'Login gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Login Kembali"
      icon="lock"
      width="420px"
      footer={
        <Btn className="primary" type="submit" form="expired-login-form" icon="login" disabled={busy}>
          {busy ? 'Memproses...' : 'Login'}
        </Btn>
      }
    >
      <form id="expired-login-form" onSubmit={submit} className="frm">
        <div className="toast-err alert-inline"><Icon name="alertCircle" size={16} /><span>Sesi login sudah habis. Silakan login kembali.</span></div>
        {err && <div className="toast-err alert-inline"><Icon name="alertCircle" size={16} /><span>{err}</span></div>}
        <FrmRow label="User Login">
          <input className="input" value={userlogin} placeholder={profile?.USERLOGIN || 'Masukkan akun'}
            onChange={(e) => setUserlogin(e.target.value)} autoFocus autoComplete="username" />
        </FrmRow>
        <FrmRow label="Password">
          <input className="input" type="password" value={userpassword} onChange={(e) => setUserpassword(e.target.value)} autoComplete="current-password" />
        </FrmRow>
      </form>
    </Window>
  );
}