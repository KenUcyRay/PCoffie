'use client';

// =============================================================================
// CHECKOUT TIKET
// -----------------------------------------------------------------------------
// Semua biaya dihitung backend (portal/order/preview) dan tidak dipercaya dari
// frontend. Buyers wajib login dulu.
//
// Yang berubah hanya tampilan: langkah yang jelas, ringkasan biaya yang menempel
// di samping pada desktop dan di bawah pada ponsel, hitung mundur yang menonjol,
// serta komponen form seragam. Endpoint, idempotensi, dan alur tetap sama.
// =============================================================================

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam, sisaWaktu } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfField, PfLoading, PfQty, PfReveal,
} from '@/components/portal/ui';

type Calc = {
  eventtitle: string; tickettypename: string; qty: number; price: number;
  subtotal: number; discount: number; service: number; total: number;
  promocode: string; paydeadline: string; timeoutmin: number;
};

function Steps({ step }: { step: number }) {
  const items = [
    { n: 1, l: 'Data pemesan' },
    { n: 2, l: 'Tiket & promo' },
    { n: 3, l: 'Ringkasan & bayar' },
  ];
  return (
    <ol className="pf-steps" aria-label="Langkah checkout">
      {items.map((s, i) => (
        <li key={s.n} className="pf-row pf-gap-sm">
          <span className={`pf-step${step === s.n ? ' is-active' : step > s.n ? ' is-done' : ''}`}>
            <span className="pf-step-num">{step > s.n ? '✓' : s.n}</span>
            <span className="pf-step-label">{s.l}</span>
          </span>
          {i < items.length - 1 ? <span className="pf-step-line" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

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
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

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
    // Validasi tampilan: tandai isian wajib kosong lalu fokuskan yang pertama.
    const bad: Record<string, string> = {};
    if (!name.trim()) bad.name = 'Nama pemesan wajib diisi.';
    if (!email.trim()) bad.email = 'Email wajib diisi.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) bad.email = 'Format email belum benar.';
    setFieldErr(bad);
    if (Object.keys(bad).length) {
      document.getElementById(`pf-${Object.keys(bad)[0]}`)?.focus();
      return;
    }

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

  const urgency = (() => {
    if (!calc?.paydeadline) return '';
    const left = new Date(calc.paydeadline).getTime() - Date.now();
    const min = Math.floor(left / 60000);
    if (min <= 15) return 'is-urgent';
    if (min <= 60) return 'is-soon';
    return '';
  })();

  const summary = calc ? (
    <div className="pf-sum">
      <div className="pf-sum-row"><dt>{calc.tickettypename} × {calc.qty}</dt><dd>{rp(calc.subtotal)}</dd></div>
      {calc.discount > 0 ? (
        <div className="pf-sum-row is-discount">
          <dt>Diskon {calc.promocode ? `(${calc.promocode})` : ''}</dt><dd>−{rp(calc.discount)}</dd>
        </div>
      ) : null}
      <div className="pf-sum-row"><dt>Biaya layanan</dt><dd>{rp(calc.service)}</dd></div>
      <div className="pf-sum-total">
        <dt>Total</dt>
        <dd className="pf-price pf-price-lg">{rp(calc.total)}</dd>
      </div>
    </div>
  ) : null;

  return (
    <div className="pf-col pf-gap-md">
      <PfCrumbs items={[
        { label: 'Beranda', href: '/' },
        { label: 'Event', href: '/events' },
        { label: calc?.eventtitle || `Event #${eventid}`, href: `/events/${eventid}` },
        { label: 'Checkout' },
      ]} />

      <div className="pf-row-between pf-wrapx pf-gap-sm">
        <h1 className="pf-h1">Checkout tiket</h1>
        <Link href={`/events/${eventid}`} className="pf-section-link">
          <PfIcon name="arrowLeft" size={16} /> Kembali ke event
        </Link>
      </div>

      <Steps step={3} />

      <form id="pf-checkout" className="pf-columns" onSubmit={submit} noValidate>
        <div className="pf-col pf-gap-md">
          {/* --------------------------------------------- 1. data pemesan */}
          <PfReveal as="section">
            <div className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="user" size={20} /> Data pemesen</span>
                <PfBadge tone="accent">Langkah 1</PfBadge>
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                <PfField label="Nama pemesan" required htmlFor="pf-name" error={fieldErr.name}>
                  <input id="pf-name" className="pf-input" value={name} autoComplete="name"
                    onChange={(e) => setName(e.target.value)} required />
                </PfField>

                <PfField label="Email" required htmlFor="pf-email" error={fieldErr.email}
                  hint="Tiket & notifikasi dikirim ke email ini.">
                  <input id="pf-email" className="pf-input" type="email" inputMode="email" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </PfField>

                <PfField label="Nomor HP" htmlFor="pf-phone" hint="Boleh dikosongkan bila tidak ada.">
                  <input id="pf-phone" className="pf-input" type="tel" inputMode="tel" autoComplete="tel"
                    placeholder="08xxxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </PfField>

                <PfField label="Nama pemilik tiket (opsional)" htmlFor="pf-owners"
                  hint={`Isi ${qty} baris bila ingin nama berbeda per tiket. Kosongkan untuk memakai nama pemesan.`}>
                  <textarea id="pf-owners" className="pf-textarea" rows={Math.max(3, qty)} value={owners}
                    onChange={(e) => setOwners(e.target.value)}
                    placeholder={`Satu nama per baris.\nContoh:\nBudi\nSari`} />
                </PfField>
              </div>
            </div>
          </PfReveal>

          {/* ------------------------------------------- 2. tiket & promo */}
          <PfReveal as="section" delay={70}>
            <div className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="ticket" size={20} /> Tiket &amp; promo</span>
                <PfBadge tone="accent">Langkah 2</PfBadge>
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                <div className="pf-row-between pf-wrapx pf-gap-sm">
                  <span className="pf-sm pf-strong">Jumlah tiket</span>
                  <PfQty value={qty} max={10} onChange={setQty} label="Jumlah tiket" />
                </div>
                <PfField label="Kode promo" htmlFor="pf-promo" hint="Pisahkan dengan spasi bila punya lebih dari satu kode.">
                  <input id="pf-promo" className="pf-input" value={code} autoCapitalize="characters"
                    onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="HEMAT10" />
                </PfField>
              </div>
            </div>
          </PfReveal>

          {/* -------------------------------- 3. ringkasan (desktop sticky) */}
          <PfReveal as="section" delay={140} className="pf-hide-mobile">
            <div className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="receipt" size={20} /> Ringkasan biaya</span>
                <PfBadge tone="accent">Langkah 3</PfBadge>
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                {loading ? <PfLoading label="Menghitung…" /> : summary}
                {err ? <PfAlert tone="error">{err}</PfAlert> : null}
                <PfButton type="submit" size="lg" block icon="check"
                  busy={busy} busyLabel="Membuat pesanan…" disabled={!calc || loading}>
                  Buat pesanan
                </PfButton>
                <span className="pf-tiny">Dengan membuat pesanan Anda menyetujui syarat &amp; ketentuan event.</span>
              </div>
            </div>
          </PfReveal>
        </div>

        {/* ------------------------------------------ ringkasan sampingan (desktop) */}
        <aside className="pf-columns-aside pf-hide-mobile">
          <div className="pf-card">
            <div className="pf-card-head">
              <span className="pf-card-title"><PfIcon name="receipt" size={20} /> Ringkasan</span>
            </div>
            <div className="pf-card-pad pf-col pf-gap-md">
              {calc ? <span className="pf-sm pf-strong pf-clamp-2">{calc.eventtitle}</span> : null}
              {loading ? <PfLoading label="Menghitung…" /> : summary}
              {calc?.paydeadline ? (
                <div className={`pf-countdown ${urgency}`}>
                  <PfIcon name="clock" size={20} />
                  <span>Sisa waktu bayar {sisaWaktu(calc.paydeadline)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </form>

      {/* ------------------------------------------- bilah bawah (ponsel) */}
      <div className="pf-actionbar pf-only-mobile">
        <div className="pf-actionbar-total">
          <span className="pf-tiny">Total</span>
          <strong>{calc ? rp(calc.total) : '—'}</strong>
        </div>
        {/* form= menautkan tombol ini ke form di atas (tetap bisa kirim dengan Enter). */}
        <PfButton type="submit" form="pf-checkout" size="lg" icon="check"
          busy={busy} busyLabel="Membuat…" disabled={!calc || loading}>
          Buat pesanan
        </PfButton>
      </div>

      {calc?.paydeadline ? (
        <div className={`pf-countdown ${urgency} pf-only-mobile`} style={{ marginTop: 'var(--pf-s3)' }}>
          <PfIcon name="clock" size={20} />
          <span>Bayar sebelum {tanggalJam(calc.paydeadline)} · sisa {sisaWaktu(calc.paydeadline)}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <PortalShell>
      <Suspense fallback={<PfLoading />}>
        <CheckoutInner />
      </Suspense>
    </PortalShell>
  );
}