'use client';

// =============================================================================
// AKUN PEMBELI
// -----------------------------------------------------------------------------
// Data diri, ganti password, sesi aktif milik sendiri, inbox, riwayat
// pembayaran/invoice/refund, dan logout.
//
// Endpoint, validasi, dan alur TIDAK berubah. Yang diperbaiki: pada ponsel
// dua form ini tadinya tampil berdampingan (pf-grid-2) sehingga incredibly
// sempit; sekarang satu kolom di bawah 640px dan memakai komponen form
// seragam (label di atas, hint di bawah, tombol status memuat).
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfEmpty, PfError, PfField, PfLoading,
} from '@/components/portal/ui';

const TABS = [
  { k: 'profil', l: 'Profil' },
  { k: 'sesi', l: 'Sesi' },
  { k: 'inbox', l: 'Pesan' },
];

export default function AccountPage() {
  const router = useRouter();
  const [tab, setTab] = useState('profil');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({ username: '', useremail: '', userphone: '' });
  const [pw, setPw] = useState({ oldpassword: '', newpassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  // Pesan validasi di dekat input yang bermasalah (bukan alert di atas form).
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/profile', { action: 'read' });
      if (!isOk(r)) {
        setError(String(r?.message || 'Silakan masuk.'));
        router.push(`/login/?next=${encodeURIComponent('/account/')}`);
        return;
      }
      setData(r);
      setForm((f) => ({ ...f, username: String(r?.profile?.USERNAME || ''), useremail: String(r?.profile?.USEREMAIL || '') }));
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat profil.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);



  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validasi ringan di sisi tampilan; fokus pindah ke input pertama yang salah.
    const bad: Record<string, string> = {};
    if (!form.username.trim()) bad.username = 'Nama wajib diisi.';
    if (!form.useremail.trim()) bad.useremail = 'Email wajib diisi.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.useremail.trim())) bad.useremail = 'Format email belum benar.';
    setFieldErr(bad);
    if (Object.keys(bad).length) {
      const first = document.getElementById(`pf-${Object.keys(bad)[0]}`);
      first?.focus();
      return;
    }
    setBusy(true); setMsg(''); setError('');
    const r: any = await portalPost('portal/profile', { action: 'update', ...form });
    setBusy(false);
    if (!isOk(r)) { setError(String(r?.message || 'Gagal menyimpan.')); return; }
    setMsg('Profil diperbarui.');
    load();
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (pw.newpassword !== pw.confirm) bad.confirm = 'Konfirmasi password tidak sama.';
    setFieldErr(bad);
    if (Object.keys(bad).length) {
      document.getElementById(`pf-${Object.keys(bad)[0]}`)?.focus();
      return;
    }
    setBusy(true); setMsg(''); setError('');
    const r: any = await portalPost('portal/profile', { action: 'password', oldpassword: pw.oldpassword, newpassword: pw.newpassword });
    setBusy(false);
    if (!isOk(r)) { setError(String(r?.message || 'Gagal mengganti password.')); return; }
    setMsg('Password berhasil diganti.');
    setPw({ oldpassword: '', newpassword: '', confirm: '' });
  };

  const logout = async () => {
    await portalPost('auth/logout', { method: 'logout' }).catch(() => {});
    try {
      const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/pcoffie').replace(/^\/|\/+$/g, '');
      localStorage.removeItem(`${slug}::auth::token`);
    } catch { /* ignore */ }
    router.push(`/`);
  };

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <div className="pf-row-between pf-wrapx pf-gap-sm">
          <h1 className="pf-h1">Akun saya</h1>
          <div className="pf-row pf-gap-sm">
            <Link href={`/console/`} className="pf-btn pf-btn-ghost pf-btn-sm">
              <PfIcon name="shield" size={16} /> Console
            </Link>
            <PfButton size="sm" variant="ghost" icon="logout" onClick={logout}>Keluar</PfButton>
          </div>
        </div>

        <div className="pf-tabs" role="tablist" aria-label="Bagian akun">
          {TABS.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
              className={`pf-tab-pill${tab === t.k ? ' is-active' : ''}`} onClick={() => setTab(t.k)}>
              {t.l}
            </button>
          ))}
        </div>

        {msg ? <PfAlert tone="ok">{msg}</PfAlert> : null}
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}

        {/* ------------------------------------------------------------ PROFIL */}
        {!loading && tab === 'profil' && data ? (
          <div className="pf-col pf-gap-md">
            <form className="pf-card" onSubmit={saveProfile} noValidate>
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="user" size={20} /> Data diri</span>
                <PfBadge tone="accent">{data.profile?.USERGROUP}</PfBadge>
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                <div className="pf-panel">
                  <span className="pf-tiny">Username</span>
                  <div className="pf-row pf-gap-sm">
                    <PfIcon name="user" size={20} />
                    <strong>{data.profile?.USERLOGIN}</strong>
                  </div>
                </div>

                <PfField label="Nama" required htmlFor="pf-username" error={fieldErr.username}>
                  <input id="pf-username" className="pf-input" value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
                </PfField>

                <PfField label="Email" required htmlFor="pf-useremail" error={fieldErr.useremail}
                  hint="Notifikasi pesanan dan tiket dikirim ke email ini.">
                  <input id="pf-useremail" className="pf-input" type="email" inputMode="email"
                    value={form.useremail}
                    onChange={(e) => setForm((f) => ({ ...f, useremail: e.target.value }))} required />
                </PfField>

                <PfField label="Nomor HP" htmlFor="pf-userphone" hint="Dipakai untuk pemberitahuan lewat pesan singkat.">
                  <input id="pf-userphone" className="pf-input" type="tel" inputMode="tel"
                    placeholder="08xxxxxxxxxx" value={form.userphone}
                    onChange={(e) => setForm((f) => ({ ...f, userphone: e.target.value }))} />
                </PfField>

                <PfButton type="submit" icon="check" busy={busy} busyLabel="Menyimpan…">Simpan profil</PfButton>
              </div>
            </form>

            <form className="pf-card" onSubmit={savePassword} noValidate>
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="lock" size={20} /> Ganti password</span>
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                <PfField label="Password lama" required htmlFor="pf-oldpassword">
                  <input id="pf-oldpassword" className="pf-input" type="password" autoComplete="current-password"
                    value={pw.oldpassword} onChange={(e) => setPw((s) => ({ ...s, oldpassword: e.target.value }))} required />
                </PfField>

                <PfField label="Password baru" required htmlFor="pf-newpassword"
                  hint="Ikuti aturan Security Setting yang sama dengan Console.">
                  <input id="pf-newpassword" className="pf-input" type="password" autoComplete="new-password"
                    value={pw.newpassword} onChange={(e) => setPw((s) => ({ ...s, newpassword: e.target.value }))} required />
                </PfField>

                <PfField label="Ulangi password baru" required htmlFor="pf-confirm" error={fieldErr.confirm}>
                  <input id="pf-confirm" className="pf-input" type="password" autoComplete="new-password"
                    value={pw.confirm} onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))} required />
                </PfField>

                <PfButton type="submit" icon="shield" busy={busy} busyLabel="Menyimpan…">Ganti password</PfButton>
              </div>
            </form>
          </div>
        ) : null}

        {/* -------------------------------------------------------------- SESI */}
        {!loading && tab === 'sesi' && data ? (
          <div className="pf-card">
            <div className="pf-card-head">
              <span className="pf-card-title"><PfIcon name="shield" size={20} /> Sesi aktif</span>
            </div>
            <div className="pf-card-pad pf-col pf-gap-sm">
              {(data.sessions || []).length === 0
                ? <PfEmpty icon="shield" title="Tidak ada sesi lain" />
                : (data.sessions || []).map((s: any, i: number) => (
                  <div key={i} className="pf-rowcard">
                    <div className="pf-rowcard-head">
                      <div className="pf-col pf-gap-xs" style={{ minWidth: 0 }}>
                        <span className="pf-rowcard-title">{s.BROWSER || 'Browser'} · {s.DEVICE || '-'}</span>
                        <span className="pf-tiny">{s.USERIP || '-'} · masuk {tanggalJam(s.LOGINTIME)}</span>
                      </div>
                      <PfBadge tone={s.STATUS === 'AKTIF' ? 'ok' : undefined}>{s.STATUS}</PfBadge>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {/* ------------------------------------------------------------- INBOX */}
        {!loading && tab === 'inbox' && data ? (
          <div className="pf-col pf-gap-sm">
            {(data.inbox || []).length === 0
              ? <div className="pf-card"><PfEmpty icon="mail" title="Belum ada pesan" /></div>
              : (data.inbox || []).map((m: any) => (
                <article key={m.MSGID} className="pf-rowcard">
                  <div className="pf-rowcard-head">
                    <span className="pf-rowcard-title">{m.TITLE}</span>
                    <PfBadge tone={m.PRIORITY === 'URGENT' ? 'danger' : undefined}>
                      {m.SENTAT ? tanggalJam(m.SENTAT) : ''}
                    </PfBadge>
                  </div>
                  <p className="pf-art-text">{m.BODY}</p>
                </article>
              ))}
          </div>
        ) : null}


      </div>
    </PortalShell>
  );
}