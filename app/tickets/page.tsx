'use client';

// Tiket Saya: tab Aktif / Menunggu Pembayaran / Sudah Dipakai / Refund.
// QR memakai token bertanda tangan dari backend (TicketQr::issue) - sama
// dengan yang dipakai Scan Ticket di Console. QR dimatikan untuk tiket yang
// sudah dipakai, dibatalkan, atau refund.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

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

function TicketCard({ t, onRefund }: { t: Ticket; onRefund: (t: Ticket) => void }) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    let stop = false;
    if (!t.QRACTIVE || !t.QRTOKEN) { setQr(''); return; }
    QRCode.toDataURL(t.QRTOKEN, { width: 256, margin: 1 })
      .then((u) => { if (!stop) setQr(u); })
      .catch(() => {});
    return () => { stop = true; };
  }, [t.QRTOKEN, t.QRACTIVE]);

  return (
    <div className="pf-ticket">
      <div className="pf-ticket-top">
        <div className="pf-ticket-qr" style={{ flex: '0 0 auto' }}>
          {qr
            ? <img src={qr} alt={`QR tiket ${t.TICKETCODE}`} />
            : <div style={{ width: 128, height: 128, display: 'grid', placeItems: 'center', color: 'var(--pf-muted)', fontSize: 11, textAlign: 'center', padding: 8 }}>
                {t.ATTENDSTATUS === 'HADIR' ? 'Sudah dipakai' : t.REFUNDSTATUS ? 'Refund diajukan' : t.PAYSTATUS !== 'LUNAS' ? 'Belum dibayar' : 'QR tidak aktif'}
              </div>}
          <span className="pf-ticket-perf" />
        </div>

        <div className="pf-grow pf-col" style={{ gap: 6 }}>
          <strong style={{ fontSize: 15 }}>{t.EVENTTITLE}</strong>
          <span className="pf-ticket-code">{t.TICKETCODE}</span>
          <div className="pf-dim">{t.TYPENAME ? `${t.TYPENAME} · ` : ''}{t.VENUE || ''}{t.CITYNAME ? ` · ${t.CITYNAME}` : ''}</div>
          <div className="pf-dim">{tanggalJam(t.STARTAT)}</div>
          <div className="pf-row pf-wrapx pf-gap-sm">
            {t.PAYSTATUS === 'LUNAS'
              ? <PfBadge tone="ok">Lunas</PfBadge>
              : <PfBadge tone="warn">{t.PAYSTATUS}</PfBadge>}
            {t.ATTENDSTATUS === 'HADIR' ? <PfBadge tone="accent">Sudah dipakai</PfBadge> : null}
            {t.REFUNDSTATUS ? <PfBadge tone="warn">Refund {t.REFUNDSTATUS}</PfBadge> : null}
            {t.TIKETSTATUS === 'BATAL' ? <PfBadge tone="danger">Dibatalkan</PfBadge> : null}
          </div>
          <div className="pf-row-between">
            <span className="pf-price">{rp(t.PRICE)}</span>
            <div className="pf-row pf-gap-sm">
              {t.CANREFUND && (
                <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => onRefund(t)}>Ajukan refund</button>
              )}
              {t.ORDERCODE && t.PAYSTATUS !== 'LUNAS' ? (
                <Link href={`/orders/?code=${encodeURIComponent(t.ORDERCODE)}`} className="pf-btn pf-btn-sm">Bayar</Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
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
  const [busy, setBusy] = useState(false);

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
    setRefundInfo(null);
    const r: any = await portalPost('portal/refund/check', { attendeeid: t.ATTENDEEID });
    if (isOk(r)) setRefundInfo(r);
  };

  const sendRefund = async () => {
    if (!refund) return;
    setBusy(true);
    const r: any = await portalPost('portal/refund/apply', { attendeeid: refund.ATTENDEEID, reason: reason.trim() });
    setBusy(false);
    if (!isOk(r)) { setError(String(r?.message || 'Pengajuan gagal.')); return; }
    setRefund(null);
    load(tab);
  };

  const list = lists[tab] || [];

  return (
    <PortalShell>
      <div className="pf-col" style={{ gap: 14 }}>
        <div className="pf-row-between">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Tiket saya</h1>
          <Link href={`/events`} className="pf-btn pf-btn-sm">Cari event</Link>
        </div>

        <div className="pf-tabs">
          {TABS.map((t) => (
            <button key={t.k} type="button" className={`pf-tab-pill${tab === t.k ? ' is-active' : ''}`} onClick={() => setTab(t.k)}>
              {t.l}{counts[t.k] ? ` (${counts[t.k]})` : ''}
            </button>
          ))}
        </div>

        {error ? <PfError message={error} onRetry={() => load(tab)} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && list.length === 0 ? (
          <PfEmpty title="Belum ada tiket di tab ini" hint="Tiket akan muncul setelah pesanan dibayar operator." />
        ) : null}

        <div className="pf-col" style={{ gap: 12 }}>
          {list.map((t) => <TicketCard key={t.ATTENDEEID} t={t} onRefund={openRefund} />)}
        </div>
      </div>

      {refund && (
        <div className="pf-card" style={{ marginTop: 16 }}>
          <div className="pf-card-head">
            <span className="pf-card-title">Ajukan refund</span>
            <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => setRefund(null)}>Tutup</button>
          </div>
          <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
            <span className="pf-dim">{refund.EVENTTITLE} · <span className="pf-ticket-code">{refund.TICKETCODE}</span></span>

            {refundInfo ? (
              <div className={`pf-alert ${refundInfo.ok ? 'pf-alert-ok' : 'pf-alert-error'}`}>
                {refundInfo.ok
                  ? `Syarat refund terpenuhi. Nominal yang akan direfund: ${rp(refundInfo.price)}${refundInfo.deadline ? `. Batas pengajuan: ${tanggalJam(refundInfo.deadline)}` : ''}`
                  : `Syarat belum terpenuhi: ${(refundInfo.reasons || []).join('; ')}`}
              </div>
            ) : null}

            {refundInfo?.ok ? (
              <>
                <label className="pf-field">
                  <span className="pf-label">Alasan refund *</span>
                  <textarea className="pf-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                </label>
                <button className="pf-btn" type="button" disabled={busy || !reason.trim()} onClick={sendRefund}>
                  {busy ? 'Mengirim…' : 'Kirim pengajuan'}
                </button>
                <span className="pf-tiny">Keputusan tetap dilakukan operator di Console.</span>
              </>
            ) : null}
          </div>
        </div>
      )}
    </PortalShell>
  );
}