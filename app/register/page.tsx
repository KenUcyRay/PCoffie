'use client';

// Daftar akun pembeli. Memakai endpoint portal/public/auth/register yang
// membuat CPUSER dengan USERGROUP = GROUP_USER (tanpa akses menu Console).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalShell from '@/components/portal/PortalShell';

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ userlogin: '', username: '', useremail: '', userphone: '', userpassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (f.userpassword !== f.confirm) {
      setErr('Konfirmasi password tidak sama.');
      return;
    }
    setBusy(true);
    try {
      const res: any = await portalPost('portal/public/auth/register', {
        userlogin: f.userlogin.trim().toLowerCase(),
        username: f.username.trim(),
        useremail: f.useremail.trim().toLowerCase(),
        userphone: f.userphone.trim(),
        userpassword: f.userpassword,
      }, { auth: false });
      if (!isOk(res)) {
        setErr(String(res?.message || 'Pendaftaran gagal.'));
        setBusy(false);
        return;
      }
      // Langsung masuk supaya pembeli tidak perlu mengetik ulang.
      const login: any = await portalPost('auth/login', { method: 'login', userlogin: f.userlogin.trim().toLowerCase(), userpassword: f.userpassword }, { auth: false });
      if (isOk(login) && login?.token) {
        const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/tiket-app').replace(/^\/|\/+$/g, '');
        try { localStorage.setItem(`${slug}::auth::token`, String(login.token)); } catch { /* ignore */ }
        router.push(`/`);
        return;
      }
      router.push(`/login/`);
    } catch (e: any) {
      setErr(e?.message || 'Gagal mendaftar. Coba lagi.');
      setBusy(false);
    }
  };

  return (
    <PortalShell>
      <div className="pf-wrap" style={{ maxWidth: 520, paddingTop: 24 }}>
        <div className="pf-card">
          <div className="pf-card-pad pf-col" style={{ gap: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 850, letterSpacing: '-.02em' }}>Daftar akun</div>
              <div className="pf-dim">Akun ini khusus untuk portal pembeli, terpisah dari akun operator Console.</div>
            </div>

            {err ? <div className="pf-alert pf-alert-error">{err}</div> : null}

            <form className="pf-col" style={{ gap: 12 }} onSubmit={submit}>
              <label className="pf-field">
                <span className="pf-label">Username</span>
                <input className="pf-input" value={f.userlogin} onChange={set('userlogin')} placeholder="mis. budi" required />
                <span className="pf-tiny">3-30 karakter: huruf kecil, angka, titik, garis.</span>
              </label>
              <label className="pf-field">
                <span className="pf-label">Nama lengkap</span>
                <input className="pf-input" value={f.username} onChange={set('username')} required />
              </label>
              <label className="pf-field">
                <span className="pf-label">Email</span>
                <input className="pf-input" type="email" value={f.useremail} onChange={set('useremail')} required />
              </label>
              <label className="pf-field">
                <span className="pf-label">Nomor HP (opsional)</span>
                <input className="pf-input" value={f.userphone} onChange={set('userphone')} />
              </label>
              <label className="pf-field">
                <span className="pf-label">Password</span>
                <input className="pf-input" type="password" value={f.userpassword} onChange={set('userpassword')} required />
              </label>
              <label className="pf-field">
                <span className="pf-label">Ulangi password</span>
                <input className="pf-input" type="password" value={f.confirm} onChange={set('confirm')} required />
              </label>
              <button className="pf-btn pf-btn-block" type="submit" disabled={busy}>
                {busy ? 'Membuat akun…' : 'Daftar sekarang'}
              </button>
            </form>

            <div className="pf-row pf-gap-sm" style={{ justifyContent: 'space-between' }}>
              <Link href={`/login`} className="pf-dim" style={{ fontWeight: 700, color: 'var(--pf-accent)' }}>Sudah punya akun? Masuk</Link>
              <Link href={`/`} className="pf-tiny">Lanjut tanpa akun</Link>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}