'use client';

// Halaman pesanan pembeli: daftar pesanan tiket + detail + instruksi pembayaran.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam, sisaWaktu } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

type Order = {
  ORDERCODE: string; STATUS: string; EVENTTITLE: string; QTY: number; TOTAL: number;
  PAYDEADLINE: string; CREATED: string;
};

function statusTone(s: string): 'ok' | 'warn' | 'danger' | undefined {
  const u = s.toUpperCase();
  if (u === 'LUNAS') return 'ok';
  if (u === 'MENUNGGU') return 'warn';
  if (u === 'BATAL' || u === 'KEDALUWARSA') return 'danger';
  return undefined;
}

function OrdersInner() {
  const sp = useSearchParams();
  const focus = sp.get('code') || '';
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/order/list', {});
      if (isOk(r)) setRows((r.rows as Order[]) || []);
      else setError(String(r?.message || 'Gagal memuat pesanan.'));
    } catch (e: any) {
      setError(e?.message || 'Gagal terhubung.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (code: string) => {
    setBusy(code);
    const r: any = await portalPost('portal/order/detail', { ordercode: code });
    setBusy('');
    if (isOk(r)) setDetail(r.order);
    else setError(String(r?.message || 'Pesanan tidak ditemukan.'));
  };

  useEffect(() => { if (focus) open(focus); /* eslint-disable-next-line */ }, [focus]);

  const cancel = async (code: string) => {
    setBusy(code);
    const r: any = await portalPost('portal/order/cancel', { ordercode: code });
    setBusy('');
    if (!isOk(r)) { setError(String(r?.message || 'Gagal membatalkan.')); return; }
    setDetail(null);
    load();
  };

  return (
    <div className="pf-col" style={{ gap: 14 }}>
      <div className="pf-row-between">
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Pesanan tiket</h1>
        <Link href={`/events`} className="pf-btn pf-btn-sm">Cari event</Link>
      </div>

      {error ? <PfError message={error} onRetry={load} /> : null}
      {loading ? <PfLoading /> : null}
      {!loading && !error && rows.length === 0 ? (
        <PfEmpty title="Belum ada pesanan" hint="Pesanan tiket yang Anda buat akan muncul di sini."
          action={<Link href={`/events`} className="pf-btn pf-btn-sm">Lihat event</Link>} />
      ) : null}

      {rows.length > 0 && (
        <div className="pf-col" style={{ gap: 10 }}>
          {rows.map((o) => (
            <div key={o.ORDERCODE} className="pf-card">
              <div className="pf-card-pad pf-col" style={{ gap: 8 }}>
                <div className="pf-row-between">
                  <div className="pf-col" style={{ gap: 3 }}>
                    <strong>{o.EVENTTITLE}</strong>
                    <span className="pf-tiny pf-ticket-code">{o.ORDERCODE} · {o.QTY} tiket · {tanggalJam(o.CREATED)}</span>
                  </div>
                  <PfBadge tone={statusTone(o.STATUS)}>{o.STATUS}</PfBadge>
                </div>
                <div className="pf-row-between">
                  <span className="pf-price">{rp(o.TOTAL)}</span>
                  <div className="pf-row pf-gap-sm">
                    {o.STATUS === 'MENUNGGU' ? <span className="pf-tiny">batas {sisaWaktu(o.PAYDEADLINE)}</span> : null}
                    <button className="pf-btn pf-btn-sm" type="button" disabled={busy === o.ORDERCODE} onClick={() => open(o.ORDERCODE)}>
                      Detail
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="pf-card">
          <div className="pf-card-head">
            <span className="pf-card-title">Detail pesanan {detail.ORDERCODE}</span>
            <PfBadge tone={statusTone(detail.STATUS)}>{detail.STATUS}</PfBadge>
          </div>
          <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
            <div className="pf-row-between"><span className="pf-dim">{detail.EVENTTITLE}</span><span /></div>
            <div className="pf-row-between"><span className="pf-dim">Subtotal</span><span>{rp(detail.SUBTOTAL)}</span></div>
            {Number(detail.DISCOUNT) > 0 ? <div className="pf-row-between"><span className="pf-dim">Diskon {detail.PROMOCODE ? `(${detail.PROMOCODE})` : ''}</span><span style={{ color: 'var(--pf-ok)' }}>−{rp(detail.DISCOUNT)}</span></div> : null}
            <div className="pf-row-between"><span className="pf-dim">Biaya layanan</span><span>{rp(detail.SERVICEFEE)}</span></div>
            <div className="pf-row-between" style={{ borderTop: '1px solid var(--pf-border)', paddingTop: 8 }}>
              <strong>Total</strong><strong className="pf-price" style={{ fontSize: 18 }}>{rp(detail.TOTAL)}</strong>
            </div>

            {detail.STATUS === 'MENUNGGU' && (
              <div className="pf-alert pf-alert-info">
                <div><strong>Instruksi pembayaran</strong></div>
                <div style={{ marginTop: 4 }}>
                  Transfer <strong>{rp(detail.TOTAL)}</strong> sebelum <strong>{tanggalJam(detail.PAYDEADLINE)}</strong> ({sisaWaktu(detail.PAYDEADLINE)} lagi),
                  lalu sebutkan nomor pesanan <span className="pf-ticket-code">{detail.ORDERCODE}</span> kepada panitia.
                </div>
                {detail.ORGCONTACT ? <div style={{ marginTop: 4 }}>Kontak panitia: {detail.ORGCONTACT}</div> : null}
                {detail.CONTACT?.PHONE ? <div>WhatsApp: {detail.CONTACT.PHONE}</div> : null}
                <div className="pf-tiny" style={{ marginTop: 4 }}>
                  Pembayaran dicatat operator di Payment History Console. Setelah dicatat, tiket aktif dan QR muncul di Tiket Saya.
                </div>
              </div>
            )}

            {detail.STATUS === 'LUNAS' && (
              <Link href={`/tickets/`} className="pf-btn pf-btn-sm">Lihat tiket saya</Link>
            )}

            <div className="pf-col" style={{ gap: 6 }}>
              <span className="pf-label">Tiket dalam pesanan</span>
              {(detail.TICKETS || []).map((t: any) => (
                <div key={t.ATTENDEEID} className="pf-row-between" style={{ fontSize: 13.5 }}>
                  <span>{t.NAME} <span className="pf-ticket-code">{t.TICKETCODE}</span></span>
                  <PfBadge tone={t.PAYSTATUS === 'LUNAS' ? 'ok' : 'warn'}>{t.PAYSTATUS}</PfBadge>
                </div>
              ))}
            </div>

            <div className="pf-row pf-gap-sm">
              <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => setDetail(null)}>Tutup</button>
              {detail.STATUS === 'MENUNGGU' && (
                <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" disabled={busy === detail.ORDERCODE} onClick={() => cancel(detail.ORDERCODE)}>
                  Batalkan pesanan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <PortalShell>
      <Suspense fallback={<PfLoading />}><OrdersInner /></Suspense>
    </PortalShell>
  );
}