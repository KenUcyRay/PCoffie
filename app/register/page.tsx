'use client';

// Daftar akun pembeli. Memakai endpoint portal/public/auth/register yang
// membuat CPUSER dengan USERGROUP = GROUP_USER (tanpa akses menu Console).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import { PfAlert, PfButton, PfField } from '@/components/portal/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ userlogin: '', username: '', useremail: '', userphone: '', userpassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

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
      <div className="pf-auth">
        <div className="pf-auth-card" style={{ maxWidth: 520 }}>
          <div className="pf-auth-head">
            <div className="pf-auth-mark"><PfIcon name="user" size={24} /></div>
            <h1 className="pf-h1">Daftar akun</h1>
            <p className="pf-dim" style={{ marginTop: 6 }}>
              Akun ini khusus untuk portal pembeli, terpisah dari akun operator Console.
            </p>
          </div>

          <div className="pf-card">
            <div className="pf-card-pad pf-col pf-gap-md">
              {err ? <PfAlert tone="error">{err}</PfAlert> : null}

              <form className="pf-col pf-gap-md" onSubmit={submit} noValidate>
                <PfField label="Username" required htmlFor="pf-userlogin" error={fieldErr.userlogin}
                  hint="3-30 karakter: huruf kecil, angka, titik, garis.">
                  <input id="pf-userlogin" className="pf-input" value={f.userlogin} onChange={set('userlogin')}
                    placeholder="mis. budi" autoCapitalize="none" spellCheck={false} required />
                </PfField>

                <PfField label="Nama lengkap" required htmlFor="pf-username" error={fieldErr.username}>
                  <input id="pf-username" className="pf-input" value={f.username} onChange={set('username')} required />
                </PfField>

                <PfField label="Email" required htmlFor="pf-useremail" error={fieldErr.useremail}
                  hint="Dipakai untuk menerima tiket dan notifikasi pesanan.">
                  <input id="pf-useremail" className="pf-input" type="email" inputMode="email"
                    value={f.useremail} onChange={set('useremail')} required />
                </PfField>

                <PfField label="Nomor HP (opsional)" htmlFor="pf-userphone">
                  <input id="pf-userphone" className="pf-input" type="tel" inputMode="tel"
                    placeholder="08xxxxxxxxxx" value={f.userphone} onChange={set('userphone')} />
                </PfField>

                <PfField label="Password" required htmlFor="pf-userpassword" error={fieldErr.userpassword}>
                  <input id="pf-userpassword" className="pf-input" type="password" autoComplete="new-password"
                    value={f.userpassword} onChange={set('userpassword')} required />
                </PfField>

                <PfField label="Ulangi password" required htmlFor="pf-confirm" error={fieldErr.confirm}>
                  <input id="pf-confirm" className="pf-input" type="password" autoComplete="new-password"
                    value={f.confirm} onChange={set('confirm')} required />
                </PfField>

                <PfButton type="submit" size="lg" block icon="check"
                  busy={busy} busyLabel="Membuat akun…">
                  Daftar sekarang
                </PfButton>
              </form>

              <div className="pf-auth-foot">
                <span className="pf-dim">Sudah punya akun?</span>
                <Link href={`/login`} className="pf-auth-link">Masuk</Link>
                <Link href={`/`} className="pf-auth-link">Lanjut tanpa akun</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
