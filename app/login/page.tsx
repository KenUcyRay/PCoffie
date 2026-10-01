'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';

function LoginCard({ expired }: { expired: boolean }) {
  const { login } = useAuth();
  const router = useRouter();
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
      router.replace('/');
    } catch (e: any) {
      setErr(e.message || 'Login gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="login-form">
      <h2 className="login-title">
        {expired ? <Icon name="lock" size={22} /> : <Icon name="login" size={22} />}
        {expired ? 'Sesi Habis' : 'Login'}
      </h2>
      {expired && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>Sesi login sudah habis. Silakan login kembali.</span>
        </div>
      )}
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
  );
}

function LoginForm() {
  const params = useSearchParams();
  return <LoginCard expired={params.get('expired') === '1'} />;
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-brand">
        <h1><Icon name="layout" size={34} /> App Core</h1>
      </div>
      <div className="login-form-wrap">
        <Suspense fallback={<div>Memuat…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}