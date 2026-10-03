'use client';

// Akun pembeli: data diri, ganti password, sesi aktif milik sendiri, inbox,
// riwayat pembayaran/invoice/refund, dan logout.
//
// Menu ini tidak punya kunci menu di CPMENU (module Account belum dibuat),
// jadi tidak perlu CPMENUACCESS. Backend tetap memverifikasi kepemilikan data
// dari token.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

const TABS = [
  { k: 'profil', l: 'Profil' },
  { k: 'sesi', l: 'Sesi' },
  { k: 'inbox', l: 'Pesan' },
  { k: 'bayar', l: 'Pembayaran' },
  { k: 'invoice', l: 'Invoice' },
  { k: 'refund', l: 'Refund' },
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
  const [lists, setLists] = useState<Record<string, any[]>>({});

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

  useEffect(() => {
    if (tab === 'bayar') portalPost('portal/payment/list', {}).then((r) => isOk(r) && setLists((s) => ({ ...s, bayar: r.rows || [] }))).catch(() => {});
    if (tab === 'invoice') portalPost('portal/invoice/list', {}).then((r) => isOk(r) && setLists((s) => ({ ...s, invoice: r.rows || [] }))).catch(() => {});
    if (tab === 'refund') portalPost('portal/refund/list', {}).then((r) => isOk(r) && setLists((s) => ({ ...s, refund: r.rows || [] }))).catch(() => {});
  }, [tab]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(''); setError('');
    const r: any = await portalPost('portal/profile', { action: 'update', ...form });
    setBusy(false);
    if (!isOk(r)) { setError(String(r?.message || 'Gagal menyimpan.')); return; }
    setMsg('Profil diperbarui.');
    load();
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newpassword !== pw.confirm) { setError('Konfirmasi password tidak sama.'); return; }
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
      const slug = (process.env.NEXT_PUBLIC_BASE_PATH || '/tiket-app').replace(/^\/|\/+$/g, '');
      localStorage.removeItem(`${slug}::auth::token`);
    } catch { /* ignore */ }
    router.push(`/`);
  };

  return (
    <PortalShell>
      <div className="pf-col" style={{ gap: 14 }}>
        <div className="pf-row-between">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Akun saya</h1>
          <div className="pf-row pf-gap-sm">
            <Link href={`/console/`} className="pf-btn pf-btn-ghost pf-btn-sm">Console</Link>
            <button className="pf-btn pf-btn-sm" type="button" onClick={logout}>Keluar</button>
          </div>
        </div>

        <div className="pf-tabs">
          {TABS.map((t) => <button key={t.k} type="button" className={`pf-tab-pill${tab === t.k ? ' is-active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>)}
        </div>

        {msg ? <div className="pf-alert pf-alert-ok">{msg}</div> : null}
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}

        {!loading && tab === 'profil' && data && (
          <div className="pf-grid pf-grid-2" style={{ alignItems: 'start' }}>
            <form className="pf-card" onSubmit={saveProfile}>
              <div className="pf-card-head"><span className="pf-card-title">Data diri</span><PfBadge>{data.profile?.USERGROUP}</PfBadge></div>
              <div className="pf-card-pad pf-col" style={{ gap: 12 }}>
                <span className="pf-dim">Username: <strong>{data.profile?.USERLOGIN}</strong></span>
                <label className="pf-field"><span className="pf-label">Nama</span>
                  <input className="pf-input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required /></label>
                <label className="pf-field"><span className="pf-label">Email</span>
                  <input className="pf-input" type="email" value={form.useremail} onChange={(e) => setForm((f) => ({ ...f, useremail: e.target.value }))} required /></label>
                <label className="pf-field"><span className="pf-label">Nomor HP</span>
                  <input className="pf-input" value={form.userphone} onChange={(e) => setForm((f) => ({ ...f, userphone: e.target.value }))} /></label>
                <button className="pf-btn" type="submit" disabled={busy}>Simpan profil</button>
              </div>
            </form>

            <form className="pf-card" onSubmit={savePassword}>
              <div className="pf-card-head"><span className="pf-card-title">Ganti password</span></div>
              <div className="pf-card-pad pf-col" style={{ gap: 12 }}>
                <label className="pf-field"><span className="pf-label">Password lama</span>
                  <input className="pf-input" type="password" value={pw.oldpassword} onChange={(e) => setPw((s) => ({ ...s, oldpassword: e.target.value }))} required /></label>
                <label className="pf-field"><span className="pf-label">Password baru</span>
                  <input className="pf-input" type="password" value={pw.newpassword} onChange={(e) => setPw((s) => ({ ...s, newpassword: e.target.value }))} required />
                  <span className="pf-tiny">Ikuti aturan Security Setting yang sama dengan Console.</span></label>
                <label className="pf-field"><span className="pf-label">Ulangi password baru</span>
                  <input className="pf-input" type="password" value={pw.confirm} onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))} required /></label>
                <button className="pf-btn" type="submit" disabled={busy}>Ganti password</button>
              </div>
            </form>
          </div>
        )}

        {!loading && tab === 'sesi' && data && (
          <div className="pf-card">
            <div className="pf-card-head"><span className="pf-card-title">Sesi aktif</span></div>
            <div className="pf-card-pad pf-col" style={{ gap: 8 }}>
              {(data.sessions || []).length === 0 ? <PfEmpty title="Tidak ada sesi lain" /> : null}
              {(data.sessions || []).map((s: any, i: number) => (
                <div key={i} className="pf-row-between" style={{ fontSize: 13.5 }}>
                  <div className="pf-col" style={{ gap: 2 }}>
                    <span>{s.BROWSER || 'Browser'} · {s.DEVICE || '-'}</span>
                    <span className="pf-tiny">{s.USERIP || '-'} · masuk {tanggalJam(s.LOGINTIME)}</span>
                  </div>
                  <PfBadge tone={s.STATUS === 'AKTIF' ? 'ok' : undefined}>{s.STATUS}</PfBadge>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && tab === 'inbox' && data && (
          <div className="pf-col" style={{ gap: 10 }}>
            {(data.inbox || []).length === 0 ? <PfEmpty title="Belum ada pesan" /> : null}
            {(data.inbox || []).map((m: any) => (
              <div key={m.MSGID} className="pf-card">
                <div className="pf-card-pad pf-col" style={{ gap: 6 }}>
                  <div className="pf-row-between">
                    <strong>{m.TITLE}</strong>
                    <PfBadge tone={m.PRIORITY === 'URGENT' ? 'danger' : undefined}>{m.SENTAT ? tanggalJam(m.SENTAT) : ''}</PfBadge>
                  </div>
                  <span className="pf-dim">{m.BODY}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'bayar' && (
          <div className="pf-col" style={{ gap: 8 }}>
            {(lists.bayar || []).length === 0 ? <PfEmpty title="Belum ada pembayaran" /> : null}
            {(lists.bayar || []).map((p: any) => (
              <div key={p.PAYMENTID} className="pf-card"><div className="pf-card-pad pf-row-between">
                <span className="pf-ticket-code">{p.PAYNO}</span>
                <span className="pf-row pf-gap-sm"><PfBadge>{p.STATUS}</PfBadge><span className="pf-price">{rp(p.TOTALPAID)}</span></span>
              </div></div>
            ))}
          </div>
        )}

        {!loading && tab === 'invoice' && (
          <div className="pf-col" style={{ gap: 8 }}>
            {(lists.invoice || []).length === 0 ? <PfEmpty title="Belum ada invoice" /> : null}
            {(lists.invoice || []).map((p: any) => (
              <div key={p.INVOICEID} className="pf-card"><div className="pf-card-pad pf-row-between">
                <span className="pf-ticket-code">{p.INVNO}</span>
                <span className="pf-price">{rp(p.TOTAL)}</span>
              </div></div>
            ))}
          </div>
        )}

        {!loading && tab === 'refund' && (
          <div className="pf-col" style={{ gap: 8 }}>
            {(lists.refund || []).length === 0 ? <PfEmpty title="Belum ada pengajuan refund" /> : null}
            {(lists.refund || []).map((p: any) => (
              <div key={p.REFUNDID} className="pf-card"><div className="pf-card-pad pf-row-between">
                <div className="pf-col" style={{ gap: 2 }}>
                  <span className="pf-ticket-code">{p.REFUNDNO}</span>
                  <span className="pf-tiny">{p.EVENTTITLE}</span>
                </div>
                <span className="pf-row pf-gap-sm"><PfBadge tone="warn">{p.STATUS}</PfBadge><span className="pf-price">{rp(p.NOMINAL)}</span></span>
              </div></div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}