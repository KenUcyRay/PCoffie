'use client';

// Checkout tiket. Semua biaya dihitung backend (portal/order/preview),
// tidak percaya nilai dari frontend. Buyers wajib login dulu.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam, sisaWaktu } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfError, PfLoading } from '@/components/portal/ui';

type Calc = {
  eventtitle: string; tickettypename: string; qty: number; price: number;
  subtotal: number; discount: number; service: number; total: number;
  promocode: string; paydeadline: string; timeoutmin: number;
};

function CheckoutInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const eventid = Number(sp.get('eventid') || 0);
  const typeid = Number(sp.get('typeid') || 0);
  const qty0 = Math.max(1, Number(sp.get('qty') || '1'));

  const [qty, setQty] = useState(qty0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [owners, setOwners] = useState('');
  const [code, setCode] = useState('');
  const [calc, setCalc] = useState<Calc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Muat data pemesan dari akun yang login.
  useEffect(() => {
    portalPost('portal/profile', { action: 'read' })
      .then((r) => {
        if (isOk(r)) {
          setName(String(r?.profile?.USERNAME || ''));
          setEmail(String(r?.profile?.USEREMAIL || ''));
        }
      })
      .catch(() => {});
  }, []);

  // Hitung ulang setiap qty/promo berubah.
  useEffect(() => {
    if (!eventid || !typeid) { setErr('Event atau tiket tidak valid.'); setLoading(false); return; }
    let stop = false;
    setLoading(true);
    setErr('');
    portalPost('portal/order/preview', { eventid, tickettypeid: typeid, qty, promocode: code.trim() })
      .then((r) => {
        if (stop) return;
        if (isOk(r)) setCalc(r.calc as Calc);
        else { setCalc(null); setErr(String(r?.message || 'Gagal menghitung biaya.')); }
      })
      .catch((e) => { if (!stop) { setCalc(null); setErr(e?.message || 'Gagal terhubung.'); } })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [eventid, typeid, qty, code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res: any = await portalPost('portal/order/create', {
        eventid,
        tickettypeid: typeid,
        qty,
        promocode: code.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        ticketowners: owners.trim(),
        idempotencykey: (() => {
          // Kunci idempotensi per attempts: klik ganda tidak membuat pesanan ganda.
          if (typeof window === 'undefined') return '';
          const k = `pf-order-${eventid}-${typeid}-${qty}`;
          const prev = sessionStorage.getItem(k);
          if (prev && Date.now() - Number(prev.split('|')[1] || 0) < 10 * 60 * 1000) return prev.split('|')[0];
          const nk = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          sessionStorage.setItem(k, `${nk}|${Date.now()}`);
          return nk;
        })(),
      });
      if (!isOk(res)) {
        setErr(String(res?.message || 'Pesanan gagal dibuat.'));
        setBusy(false);
        return;
      }
      sessionStorage.removeItem(`pf-order-${eventid}-${typeid}-${qty}`);
      router.push(`/orders/?code=${encodeURIComponent(String(res?.order?.ORDERCODE || ''))}`);
    } catch (e: any) {
      setErr(e?.message || 'Pesanan gagal dibuat.');
      setBusy(false);
    }
  };

  return (
    <div className="pf-col" style={{ gap: 14 }}>
      <div className="pf-row-between">
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Checkout tiket</h1>
        <Link href={`/events/${eventid}`} className="pf-dim">Kembali ke event</Link>
      </div>

      <form className="pf-col" style={{ gap: 14 }} onSubmit={submit}>
        <div className="pf-card">
          <div className="pf-card-head"><span className="pf-card-title">Data pemesan</span></div>
          <div className="pf-card-pad pf-col" style={{ gap: 12 }}>
            <label className="pf-field"><span className="pf-label">Nama pemesan *</span>
              <input className="pf-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className="pf-field"><span className="pf-label">Email *</span>
              <input className="pf-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <span className="pf-tiny">Tiket & notifikasi dikirim ke email ini.</span></label>
            <label className="pf-field"><span className="pf-label">Nomor HP</span>
              <input className="pf-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label className="pf-field">
              <span className="pf-label">Nama pemilik tiket (opsional)</span>
              <textarea className="pf-textarea" rows={qty} value={owners} onChange={(e) => setOwners(e.target.value)}
                placeholder={`Satu nama per baris. Kosongkan untuk memakai nama pemesan.\nContoh:\nBudi\nSari`} />
              <span className="pf-tiny">Isi {qty} baris bila ingin nama berbeda per tiket.</span>
            </label>
          </div>
        </div>

        <div className="pf-card">
          <div className="pf-card-head"><span className="pf-card-title">Tiket & promo</span></div>
          <div className="pf-card-pad pf-col" style={{ gap: 12 }}>
            <div className="pf-row pf-gap-sm">
              <span className="pf-dim">Jumlah tiket</span>
              <div className="pf-qty">
                <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((n) => Math.min(10, n + 1))}>+</button>
              </div>
            </div>
            <label className="pf-field"><span className="pf-label">Kode promo</span>
              <input className="pf-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="HEMAT10" /></label>
          </div>
        </div>

        <div className="pf-card">
          <div className="pf-card-head"><span className="pf-card-title">Ringkasan biaya</span></div>
          <div className="pf-card-pad pf-col" style={{ gap: 8 }}>
            {loading ? <PfLoading label="Menghitung…" /> : null}
            {calc ? (
              <>
                <div className="pf-row-between"><span className="pf-dim">{calc.tickettypename} × {calc.qty}</span><span>{rp(calc.subtotal)}</span></div>
                {calc.discount > 0 ? (
                  <div className="pf-row-between">
                    <span className="pf-dim">Diskon {calc.promocode ? `(${calc.promocode})` : ''}</span>
                    <span style={{ color: 'var(--pf-ok)', fontWeight: 700 }}>−{rp(calc.discount)}</span>
                  </div>
                ) : null}
                <div className="pf-row-between"><span className="pf-dim">Biaya layanan</span><span>{rp(calc.service)}</span></div>
                <div className="pf-row-between" style={{ borderTop: '1px solid var(--pf-border)', paddingTop: 8 }}>
                  <strong>Total</strong><strong className="pf-price" style={{ fontSize: 18 }}>{rp(calc.total)}</strong>
                </div>
                <span className="pf-tiny">Bayar sebelum {tanggalJam(calc.paydeadline)} ({sisaWaktu(calc.paydeadline)} lagi)</span>
              </>
            ) : null}
            {err ? <div className="pf-alert pf-alert-error">{err}</div> : null}
            <button className="pf-btn pf-btn-block" type="submit" disabled={busy || !calc || loading}>
              {busy ? 'Membuat pesanan…' : 'Buat pesanan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <PortalShell>
      <Suspense fallback={<PfLoading />}><CheckoutInner /></Suspense>
    </PortalShell>
  );
}