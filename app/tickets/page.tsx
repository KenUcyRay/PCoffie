'use client';

// =============================================================================
// TIKET SAYA
// -----------------------------------------------------------------------------
// Tab Aktif / Menunggu Pembayaran / Sudah Dipakai / Refund.
// QR memakai token bertanda tangan dari backend (TicketQr::issue) - sama
// dengan yang dipakai Scan Ticket di Console. QR dimatikan untuk tiket yang
// sudah dipakai, dibatalkan, atau refund.
//
// Tampilan: kartu bergaya dompet digital (bagian atas info event, bagian bawah
// QR dengan garis sobekan dekoratif), badge status konsisten, dan QR besar
// dalam modal saat diklik.
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfEmpty, PfError, PfField,
  PfLoadingGrid, PfModal, useToast,
} from '@/components/portal/ui';

type Ticket = {
  ATTENDEEID: number; TICKETCODE: string; HOLDER: string; EVENTTITLE: string; EVENTID: number;
  TYPENAME?: string; PRICE: number; STARTAT?: string; VENUE?: string; CITYNAME?: string;
  ORDERCODE?: string; PAYSTATUS: string; ATTENDSTATUS: string; TIKETSTATUS: string;
  REFUNDSTATUS?: string; REGDATE?: string; QRACTIVE: boolean; QRTOKEN: string; CANREFUND: boolean;
};

const TABS = [
  { k: 'aktif', l: 'Aktif' },
  { k: 'menunggu', l: 'Menunggu Bayar' },
  { k: 'dipakai', l: 'Sudah Dipakai' },
  { k: 'refund', l: 'Refund/Batal' },
];

function TicketCard({ t, onRefund, onZoom }: {
  t: Ticket; onRefund: (t: Ticket) => void; onZoom: (t: Ticket, qr: string) => void;
}) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    let stop = false;
    if (!t.QRACTIVE || !t.QRTOKEN) { setQr(''); return; }
    QRCode.toDataURL(t.QRTOKEN, { width: 512, margin: 1 })
      .then((u) => { if (!stop) setQr(u); })
      .catch(() => {});
    return () => { stop = true; };
  }, [t.QRTOKEN, t.QRACTIVE]);

  const off = !t.QRACTIVE || !qr;
  const offText = t.ATTENDSTATUS === 'HADIR' ? 'Sudah dipakai'
    : t.REFUNDSTATUS ? 'Refund diajukan'
    : t.PAYSTATUS !== 'LUNAS' ? 'Belum dibayar'
    : 'QR tidak aktif';

  return (
    <article className="pf-ticket">
      <div className="pf-ticket-head">
        <div className="pf-grow pf-col pf-gap-sm">
          <div className="pf-row pf-wrapx pf-gap-xs">
            {t.PAYSTATUS === 'LUNAS'
              ? <PfBadge tone="ok" icon="checkCircle">Lunas</PfBadge>
              : <PfBadge tone="warn" icon="clock">{t.PAYSTATUS}</PfBadge>}
            {t.ATTENDSTATUS === 'HADIR' ? <PfBadge tone="accent" icon="ticket">Sudah dipakai</PfBadge> : null}
            {t.REFUNDSTATUS ? <PfBadge tone="warn" icon="refresh">Refund {t.REFUNDSTATUS}</PfBadge> : null}
            {t.TIKETSTATUS === 'BATAL' ? <PfBadge tone="danger" icon="close">Dibatalkan</PfBadge> : null}
          </div>

          <h3 className="pf-ticket-title pf-clamp-2">{t.EVENTTITLE}</h3>

          <span className="pf-ticket-code">
            <PfIcon name="qr" size={16} />
            {t.TICKETCODE}
          </span>

          <div className="pf-ticket-meta">
            {t.TYPENAME ? (
              <span className="pf-ticket-meta-row">
                <PfIcon name="ticket" size={16} /><span>{t.TYPENAME}</span>
              </span>
            ) : null}
            {t.STARTAT ? (
              <span className="pf-ticket-meta-row">
                <PfIcon name="calendar" size={16} /><span>{tanggalJam(t.STARTAT)}</span>
              </span>
            ) : null}
            {(t.VENUE || t.CITYNAME) ? (
              <span className="pf-ticket-meta-row">
                <PfIcon name="location" size={16} />
                <span>{[t.VENUE, t.CITYNAME].filter(Boolean).join(' · ')}</span>
              </span>
            ) : null}
            {t.HOLDER ? (
              <span className="pf-ticket-meta-row">
                <PfIcon name="user" size={16} /><span>{t.HOLDER}</span>
              </span>
            ) : null}
          </div>

          <div className="pf-ticket-foot" style={{ padding: 0, border: 0, background: 'transparent' }}>
            <span className="pf-price">{rp(t.PRICE)}</span>
            <div className="pf-row pf-wrapx pf-gap-sm">
              {t.CANREFUND ? (
                <PfButton variant="ghost" size="sm" icon="refresh" onClick={() => onRefund(t)}>
                  Ajukan refund
                </PfButton>
              ) : null}
              {t.ORDERCODE && t.PAYSTATUS !== 'LUNAS' ? (
                <Link href={`/orders/?code=${encodeURIComponent(t.ORDERCODE)}`} className="pf-btn pf-btn-sm">
                  Bayar
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* QR mini di sisi kanan (desktop) — dihapus di ponsel, ada di stub. */}
        <button type="button"
          className={`pf-ticket-qr${off ? ' is-off' : ''} pf-hide-mobile`}
          onClick={() => (off ? undefined : onZoom(t, qr))}
          aria-label={off ? `QR tidak aktif: ${offText}` : `Perbesar QR tiket ${t.TICKETCODE}`}
          disabled={off}>
          {qr ? <img src={qr} alt={`QR tiket ${t.TICKETCODE}`} /> : <PfIcon name="qr" size={24} />}
        </button>
      </div>

      {/* Stub: garis sobekan dekoratif + QR. */}
      <div className="pf-ticket-stub">
        <div className="pf-ticket-stub-info">
          <span className="pf-tiny">Tunjukkan QR ini di pintu masuk</span>
          <span className="pf-mono pf-xs">{t.TICKETCODE}</span>
        </div>
        <button type="button"
          className={`pf-ticket-stub-qr${off ? ' is-off' : ''}`}
          onClick={() => (off ? undefined : onZoom(t, qr))}
          aria-label={off ? `QR tidak aktif: ${offText}` : `Perbesar QR tiket ${t.TICKETCODE}`}
          disabled={off}
          style={{ border: 0, cursor: off ? 'default' : 'pointer', background: '#fff' }}>
          {qr ? <img src={qr} alt={`QR tiket ${t.TICKETCODE}`} /> : <PfIcon name="qr" size={24} />}
        </button>
      </div>
    </article>
  );
}

export default function MyTicketsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('aktif');
  const [lists, setLists] = useState<Record<string, Ticket[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refund, setRefund] = useState<Ticket | null>(null);
  const [refundInfo, setRefundInfo] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<{ t: Ticket; qr: string } | null>(null);
  const { toast, toastNode } = useToast();

  const load = useCallback(async (which: string) => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/ticket/list', { tab: which });
      if (!isOk(r)) {
        setError(String(r?.message || 'Gagal memuat tiket.'));
        return;
      }
      setLists((s) => ({ ...s, [which]: (r[which] as Ticket[]) || [] }));
      setCounts((r.counts as any) || {});
      if (!isOk(await portalPost('portal/whoami', {}))) {
        router.push(`/login/?next=${encodeURIComponent('/tickets/')}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Silakan masuk terlebih dahulu.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(tab); }, [tab, load]);

  const openRefund = async (t: Ticket) => {
    setRefund(t);
    setReason('');
    setReasonErr('');
    setRefundInfo(null);
    const r: any = await portalPost('portal/refund/check', { attendeeid: t.ATTENDEEID });
    if (isOk(r)) setRefundInfo(r);
  };

  const sendRefund = async () => {
    if (!refund) return;
    if (!reason.trim()) { setReasonErr('Alasan refund wajib diisi.'); return; }
    setBusy(true);
    const r: any = await portalPost('portal/refund/apply', { attendeeid: refund.ATTENDEEID, reason: reason.trim() });
    setBusy(false);
    if (!isOk(r)) { setError(String(r?.message || 'Pengajuan gagal.')); return; }
    setRefund(null);
    toast('Pengajuan refund terkirim', 'ok');
    load(tab);
  };

  const list = lists[tab] || [];

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Tiket saya' }]} />

        <div className="pf-row-between pf-wrapx pf-gap-sm">
          <h1 className="pf-h1">Tiket saya</h1>
          <Link href={`/events`} className="pf-btn pf-btn-soft pf-btn-sm">
            <PfIcon name="search" size={16} /> Cari event
          </Link>
        </div>

        <div className="pf-tabs" role="tablist" aria-label="Status tiket">
          {TABS.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
              className={`pf-tab-pill${tab === t.k ? ' is-active' : ''}`} onClick={() => setTab(t.k)}>
              {t.l}{counts[t.k] ? ` (${counts[t.k]})` : ''}
            </button>
          ))}
        </div>

        {error ? <PfError message={error} onRetry={() => load(tab)} /> : null}
        {loading ? <PfLoadingGrid count={2} /> : null}

        {!loading && !error && list.length === 0 ? (
          <div className="pf-card">
            <PfEmpty
              icon="ticket"
              title="Belum ada tiket di tab ini"
              hint="Tiket akan muncul setelah pesanan dibayar operator."
              action={<Link href="/events" className="pf-btn pf-btn-sm">Cari event</Link>}
            />
          </div>
        ) : null}

        <div className="pf-col pf-gap-md">
          {list.map((t) => (
            <TicketCard key={t.ATTENDEEID} t={t} onRefund={openRefund}
              onZoom={(tk, qr) => setZoom({ t: tk, qr })} />
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ QR besar dalam modal */}
      <PfModal open={!!zoom} onClose={() => setZoom(null)}
        title={zoom ? `Tiket ${zoom.t.TICKETCODE}` : 'Tiket'}>
        {zoom ? (
          <div className="pf-qrbig">
            <div className="pf-qrbig-frame">
              <img src={zoom.qr} alt={`QR tiket ${zoom.t.TICKETCODE}`} width={280} height={280} />
            </div>
            <div className="pf-col pf-gap-xs" style={{ width: '100%' }}>
              <strong className="pf-h3">{zoom.t.EVENTTITLE}</strong>
              <span className="pf-dim">{[zoom.t.TYPENAME, tanggalJam(zoom.t.STARTAT), zoom.t.VENUE, zoom.t.CITYNAME]
                .filter(Boolean).join(' · ')}</span>
              <span className="pf-mono pf-xs">{zoom.t.TICKETCODE}</span>
            </div>
            <p className="pf-brightness">
              <PfIcon name="brightness" size={16} />
              <span>Naikkan kecerahan layar supaya QR mudah dipindai di pintu masuk.</span>
            </p>
          </div>
        ) : null}
      </PfModal>

      {/* ------------------------------------------------------ form pengajuan */}
      <PfModal
        open={!!refund}
        onClose={() => setRefund(null)}
        title="Ajukan refund"
        footer={
          <>
            <PfButton variant="ghost" onClick={() => setRefund(null)}>Batal</PfButton>
            <PfButton busy={busy} busyLabel="Mengirim…" disabled={!refundInfo?.ok || !reason.trim()}
              onClick={sendRefund}>Kirim pengajuan</PfButton>
          </>
        }
      >
        {refund ? (
          <div className="pf-col pf-gap-md">
            <div className="pf-panel">
              <span className="pf-sm pf-strong">{refund.EVENTTITLE}</span>
              <span className="pf-mono pf-xs">{refund.TICKETCODE}</span>
            </div>

            {refundInfo ? (
              refundInfo.ok ? (
                <PfAlert tone="ok">
                  Syarat refund terpenuhi. Nominal yang akan direfund: {rp(refundInfo.price)}
                  {refundInfo.deadline ? `. Batas pengajuan: ${tanggalJam(refundInfo.deadline)}` : ''}
                </PfAlert>
              ) : (
                <PfAlert tone="error">
                  Syarat belum terpenuhi: {(refundInfo.reasons || []).join('; ')}
                </PfAlert>
              )
            ) : <PfLoadingGrid count={1} />}

            {refundInfo?.ok ? (
              <PfField label="Alasan refund" required htmlFor="pf-reason" error={reasonErr}
                hint="Maksimal 200 karakter.">
                <textarea id="pf-reason" className="pf-textarea" rows={4} value={reason} maxLength={200}
                  onChange={(e) => { setReason(e.target.value); if (reasonErr) setReasonErr(''); }}
                  placeholder="Ceritakan singkat alasan pengajuan refund." />
              </PfField>
            ) : null}

            <span className="pf-tiny">Keputusan tetap dilakukan operator di Console.</span>
          </div>
        ) : null}
      </PfModal>

      {toastNode}
    </PortalShell>
  );
}