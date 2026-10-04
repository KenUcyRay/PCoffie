'use client';

// =============================================================================
// PESANAN TIKET
// -----------------------------------------------------------------------------
// Daftar pesanan + detail + instruksi pembayaran. Endpoint tidak berubah.
// Tampilan: daftar kartu (bukan tabel), badge status konsisten, hitung mundur
// yang menonjol, dan detail dibuka lewat panel.
// =============================================================================

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam, sisaWaktu } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfEmpty, PfError, PfField,
  PfLoadingGrid, PfModal, PfQty, useToast,
} from '@/components/portal/ui';

type Order = {
  ORDERCODE: string; STATUS: string; EVENTTITLE: string; QTY: number; TOTAL: number;
  PAYDEADLINE: string; CREATED: string;
};

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | undefined {
  const u = s.toUpperCase();
  if (u === 'LUNAS') return 'ok';
  if (u === 'MENUNGGU') return 'warn';
  if (u === 'BATAL' || u === 'KEDALUWARSA') return 'danger';
  return 'info';
}

function OrdersInner() {
  const sp = useSearchParams();
  const focus = sp.get('code') || '';
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [busy, setBusy] = useState('');
  const { toast, toastNode } = useToast();

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
    toast('Pesanan dibatalkan', 'ok');
    load();
  };

  return (
    <div className="pf-col pf-gap-md">
      <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Pesanan tiket' }]} />

      <div className="pf-row-between pf-wrapx pf-gap-sm">
        <h1 className="pf-h1">Pesanan tiket</h1>
        <Link href={`/events`} className="pf-btn pf-btn-soft pf-btn-sm">
          <PfIcon name="search" size={16} /> Cari event
        </Link>
      </div>

      {error ? <PfError message={error} onRetry={load} /> : null}
      {loading ? <PfLoadingGrid count={3} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="pf-card">
          <PfEmpty icon="receipt" title="Belum ada pesanan"
            hint="Pesanan tiket yang Anda buat akan muncul di sini."
            action={<Link href={`/events`} className="pf-btn pf-btn-sm">Lihat event</Link>} />
        </div>
      ) : null}

      <div className="pf-col pf-gap-sm">
        {rows.map((o) => (
          <article key={o.ORDERCODE} className="pf-rowcard">
            <div className="pf-rowcard-head">
              <div className="pf-col pf-gap-xs" style={{ minWidth: 0 }}>
                <span className="pf-rowcard-title pf-clamp-2">{o.EVENTTITLE}</span>
                <span className="pf-ticket-code">{o.ORDERCODE}</span>
              </div>
              <PfBadge tone={statusTone(o.STATUS)}>{o.STATUS}</PfBadge>
            </div>

            <div className="pf-rowcard-meta">
              <span className="pf-rowcard-meta-row">
                <PfIcon name="ticket" size={16} /><span>{o.QTY} tiket</span>
              </span>
              <span className="pf-rowcard-meta-row">
                <PfIcon name="calendar" size={16} /><span>Dibuat {tanggalJam(o.CREATED)}</span>
              </span>
            </div>

            {o.STATUS === 'MENUNGGU' ? (
              <div className="pf-countdown is-soon">
                <PfIcon name="clock" size={20} />
                <span>Batas bayar {sisaWaktu(o.PAYDEADLINE)} lagi</span>
              </div>
            ) : null}

            <div className="pf-rowcard-foot">
              <span className="pf-price">{rp(o.TOTAL)}</span>
              <PfButton size="sm" variant="ghost" iconRight="chevronRight"
                busy={busy === o.ORDERCODE} busyLabel="Memuat…"
                onClick={() => open(o.ORDERCODE)}>
                Detail
              </PfButton>
            </div>
          </article>
        ))}
      </div>

      {/* ------------------------------------------------------------- DETAIL */}
      <PfModal open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `Pesanan ${detail.ORDERCODE}` : 'Detail pesanan'}
        footer={
          <>
            <PfButton variant="ghost" onClick={() => setDetail(null)}>Tutup</PfButton>
            {detail?.STATUS === 'MENUNGGU' ? (
              <PfButton variant="dangerGhost" busy={busy === detail.ORDERCODE} busyLabel="Membatalkan…"
                onClick={() => cancel(detail.ORDERCODE)}>
                Batalkan pesanan
              </PfButton>
            ) : null}
            {detail?.STATUS === 'LUNAS' ? (
              <Link href={`/tickets/`} className="pf-btn">Lihat tiket saya</Link>
            ) : null}
          </>
        }>
        {detail ? (
          <div className="pf-col pf-gap-md">
            <div className="pf-row-between pf-wrapx pf-gap-sm">
              <span className="pf-sm pf-strong">{detail.EVENTTITLE}</span>
              <PfBadge tone={statusTone(detail.STATUS)}>{detail.STATUS}</PfBadge>
            </div>

            <dl className="pf-sum">
              <div className="pf-sum-row"><dt>Subtotal</dt><dd>{rp(detail.SUBTOTAL)}</dd></div>
              {Number(detail.DISCOUNT) > 0 ? (
                <div className="pf-sum-row is-discount">
                  <dt>Diskon {detail.PROMOCODE ? `(${detail.PROMOCODE})` : ''}</dt><dd>−{rp(detail.DISCOUNT)}</dd>
                </div>
              ) : null}
              <div className="pf-sum-row"><dt>Biaya layanan</dt><dd>{rp(detail.SERVICEFEE)}</dd></div>
              <div className="pf-sum-total">
                <dt>Total</dt><dd className="pf-price pf-price-lg">{rp(detail.TOTAL)}</dd>
              </div>
            </dl>

            {detail.STATUS === 'MENUNGGU' ? (
              <>
                <div className="pf-countdown">
                  <PfIcon name="clock" size={20} />
                  <span>Bayar sebelum {tanggalJam(detail.PAYDEADLINE)} · {sisaWaktu(detail.PAYDEADLINE)} lagi</span>
                </div>
                <PfAlert tone="info">
                  <span className="pf-col pf-gap-xs">
                    <strong>Instruksi pembayaran</strong>
                    <span>
                      Transfer <strong>{rp(detail.TOTAL)}</strong> sebelum <strong>{tanggalJam(detail.PAYDEADLINE)}</strong>,
                      lalu sebutkan nomor pesanan <span className="pf-mono">{detail.ORDERCODE}</span> kepada panitia.
                    </span>
                    {detail.ORGCONTACT ? <span>Kontak panitia: {detail.ORGCONTACT}</span> : null}
                    {detail.CONTACT?.PHONE ? <span>WhatsApp: {detail.CONTACT.PHONE}</span> : null}
                    <span className="pf-tiny">
                      Pembayaran dicatat operator di Payment History Console. Setelah dicatat, tiket aktif dan QR muncul di Tiket Saya.
                    </span>
                  </span>
                </PfAlert>
              </>
            ) : null}

            <div className="pf-col pf-gap-sm">
              <span className="pf-label">Tiket dalam pesanan</span>
              {(detail.TICKETS || []).map((t: any) => (
                <div key={t.ATTENDEEID} className="pf-row-between pf-gap-sm">
                  <span className="pf-sm" style={{ minWidth: 0 }}>
                    {t.NAME} <span className="pf-mono pf-xs">{t.TICKETCODE}</span>
                  </span>
                  <PfBadge tone={t.PAYSTATUS === 'LUNAS' ? 'ok' : 'warn'}>{t.PAYSTATUS}</PfBadge>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PfModal>

      {toastNode}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <PortalShell>
      <Suspense fallback={<PfLoadingGrid count={3} />}><OrdersInner /></Suspense>
    </PortalShell>
  );
}