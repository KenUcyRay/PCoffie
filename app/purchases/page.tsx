'use client';

// =============================================================================
// MY PURCHASE - pesanan merchandise milik pembeli
// -----------------------------------------------------------------------------
// Endpoint tidak berubah: list, detail, cancel, receive, complaint.
// Tampilan: tab status, daftar kartu, detail dalam modal, dan form laporan
// masalah yang memakai komponen form seragam.
// =============================================================================

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfEmpty, PfError, PfField,
  PfLoadingGrid, PfModal, PfSelectWrap, useToast,
} from '@/components/portal/ui';

const STATUS = [
  { v: '', l: 'Semua' }, { v: 'DIPESAN', l: 'Dipesan' }, { v: 'DIPROSES', l: 'Diproses' },
  { v: 'DIKIRIM', l: 'Dikirim' }, { v: 'DITERIMA', l: 'Diterima' }, { v: 'DIBATAL', l: 'Dibatal' },
];
const REASONS = ['BARANG_RUSAK', 'TIDAK_SESUAI', 'TIDAK_DITERIMA', 'LAINNYA'];

type Row = {
  ORDERID: number; ORDERNO: string; ORDERSTATUS: string; PAYSTATUS: string; SELLERNAME?: string;
  ITEMCOUNT: number; SUBTOTAL: number; SHIPPING: number; TOTAL: number; COURIER?: string;
  TRACKINGNO?: string; CREATED: string; PAYDEADLINE?: string;
};

function tone(s: string): 'ok' | 'warn' | 'danger' | 'info' | undefined {
  const u = s.toUpperCase();
  if (u === 'DITERIMA' || u === 'SELESAI') return 'ok';
  if (u === 'DIPESAN' || u === 'DIPROSES' || u === 'DIKIRIM') return 'warn';
  if (u === 'DIBATAL') return 'danger';
  return 'info';
}

export default function PurchasesPage() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [complaint, setComplaint] = useState<number | null>(null);
  const [reason, setReason] = useState('TIDAK_SESUAI');
  const [descr, setDescr] = useState('');
  const [descrErr, setDescrErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast, toastNode } = useToast();

  const load = useCallback(async (st: string) => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/purchase/list', { status: st });
      if (isOk(r)) setRows((r.rows as Row[]) || []);
      else setError(String(r?.message || 'Gagal memuat pesanan.'));
    } catch (e: any) {
      setError(e?.message || 'Silakan masuk terlebih dahulu.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(status); }, [status, load]);

  const open = async (id: number) => {
    const r: any = await portalPost('portal/purchase/detail', { orderid: id });
    if (isOk(r)) { setDetail(r); setComplaint(null); setDescr(''); setDescrErr(''); }
    else setError(String(r?.message || 'Detail gagal dimuat.'));
  };

  const act = async (path: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    const r: any = await portalPost(path, body);
    setBusy(false);
    if (!isOk(r)) { setMsg(String(r?.message || 'Gagal.')); return; }
    setMsg('');
    toast(okMsg, 'ok');
    setDetail(null);
    setComplaint(null);
    load(status);
  };

  const order = detail?.order;

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Merchandise', href: '/merch' }, { label: 'My Purchase' }]} />

        <div className="pf-row-between pf-wrapx pf-gap-sm">
          <h1 className="pf-h1">Pembelian merchandise</h1>
          <Link href={`/merch`} className="pf-btn pf-btn-soft pf-btn-sm">
            <PfIcon name="cart" size={16} /> Belanja lagi
          </Link>
        </div>

        <div className="pf-tabs" role="tablist" aria-label="Status pesanan">
          {STATUS.map((s) => (
            <button key={s.v} type="button" role="tab" aria-selected={status === s.v}
              className={`pf-tab-pill${status === s.v ? ' is-active' : ''}`} onClick={() => setStatus(s.v)}>
              {s.l}
            </button>
          ))}
        </div>

        {msg ? <PfAlert tone="error">{msg}</PfAlert> : null}
        {error ? <PfError message={error} onRetry={() => load(status)} /> : null}
        {loading ? <PfLoadingGrid count={3} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="package" title="Belum ada pesanan merchandise"
              hint="Pesanan yang Anda buat akan muncul di sini."
              action={<Link href="/merch" className="pf-btn pf-btn-sm">Belanja merchandise</Link>} />
          </div>
        ) : null}

        <div className="pf-col pf-gap-sm">
          {rows.map((o) => (
            <article key={o.ORDERID} className="pf-rowcard">
              <div className="pf-rowcard-head">
                <div className="pf-col pf-gap-xs" style={{ minWidth: 0 }}>
                  <span className="pf-mono pf-sm pf-strong">{o.ORDERNO}</span>
                  <span className="pf-tiny">{o.SELLERNAME} · {o.ITEMCOUNT} item · {tanggalJam(o.CREATED)}</span>
                </div>
                <PfBadge tone={tone(o.ORDERSTATUS)}>{o.ORDERSTATUS}</PfBadge>
              </div>
              {o.TRACKINGNO ? (
                <div className="pf-rowcard-meta">
                  <span className="pf-rowcard-meta-row">
                    <PfIcon name="package" size={16} /><span>Resi {o.TRACKINGNO}</span>
                  </span>
                </div>
              ) : null}
              <div className="pf-rowcard-foot">
                <span className="pf-price">{rp(o.TOTAL)}</span>
                <PfButton size="sm" variant="ghost" iconRight="chevronRight" onClick={() => open(o.ORDERID)}>
                  Detail
                </PfButton>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- DETAIL */}
      <PfModal
        open={!!order}
        onClose={() => { setDetail(null); setComplaint(null); }}
        title={order ? `Pesanan ${order.ORDERNO}` : 'Detail pesanan'}
        footer={
          <>
            <PfButton variant="ghost" onClick={() => { setDetail(null); setComplaint(null); }}>Tutup</PfButton>
            {order?.ORDERSTATUS === 'DIPESAN' ? (
              <PfButton variant="dangerGhost" busy={busy} busyLabel="Membatalkan…"
                onClick={() => act('portal/purchase/cancel', { orderid: order.ORDERID }, 'Pesanan dibatalkan.')}>
                Batalkan
              </PfButton>
            ) : null}
            {order?.ORDERSTATUS === 'DIKIRIM' ? (
              <>
                <PfButton busy={busy} busyLabel="Menyimpan…"
                  onClick={() => act('portal/purchase/receive', { orderid: order.ORDERID }, 'Pesanan ditandai diterima.')}>
                  Tandai diterima
                </PfButton>
                <PfButton variant="ghost" onClick={() => setComplaint(complaint === order.ORDERID ? null : order.ORDERID)}>
                  Laporkan masalah
                </PfButton>
              </>
            ) : null}
          </>
        }>
        {order ? (
          <div className="pf-col pf-gap-md">
            <div className="pf-row-between pf-wrapx pf-gap-sm">
              <PfBadge tone={tone(order.ORDERSTATUS)} icon="package">{order.ORDERSTATUS}</PfBadge>
              <PfBadge tone={order.PAYSTATUS === 'LUNAS' ? 'ok' : 'warn'}>{order.PAYSTATUS}</PfBadge>
            </div>

            <div className="pf-col pf-gap-xs">
              {(detail.items || []).map((i: any) => (
                <div key={i.PRODUCTID} className="pf-row-between pf-gap-sm">
                  <span className="pf-sm" style={{ minWidth: 0 }}>{i.PRODUCTNAME} × {i.QTY}</span>
                  <strong className="pf-sm pf-nowrap">{rp(i.SUBTOTAL)}</strong>
                </div>
              ))}
            </div>

            <dl className="pf-sum">
              <div className="pf-sum-row"><dt>Ongkir ({order.COURIER})</dt><dd>{rp(order.SHIPPING)}</dd></div>
              <div className="pf-sum-total">
                <dt>Total</dt><dd className="pf-price pf-price-lg">{rp(order.TOTAL)}</dd>
              </div>
            </dl>

            <div className="pf-panel pf-col pf-gap-xs">
              <span className="pf-tiny">Alamat pengiriman</span>
              <span className="pf-sm">{order.ADDRESS}</span>
              {order.TRACKINGNO ? (
                <span className="pf-sm">Resi: <span className="pf-mono">{order.TRACKINGNO}</span></span>
              ) : null}
            </div>

            <details className="pf-panel">
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 'var(--pf-fs-sm)' }}>
                Riwayat status
              </summary>
              <div className="pf-col pf-gap-xs" style={{ marginTop: 8 }}>
                {(detail.history || []).map((h: any, i: number) => (
                  <span key={i} className="pf-tiny">
                    {tanggalJam(h.ACTTIME)} · {h.OLDSTATUS || '-'} → {h.NEWSTATUS}{h.NOTE ? ` (${h.NOTE})` : ''}
                  </span>
                ))}
              </div>
            </details>

            {complaint === order.ORDERID ? (
              <div className="pf-panel pf-col pf-gap-md" style={{ borderColor: 'var(--pf-accent-line)' }}>
                <PfField label="Alasan masalah" htmlFor="pf-reason">
                  <PfSelectWrap id="pf-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </PfSelectWrap>
                </PfField>
                <PfField label="Keterangan" htmlFor="pf-descr" error={descrErr} hint="Boleh dikosongkan.">
                  <textarea id="pf-descr" className="pf-textarea" rows={3} value={descr}
                    onChange={(e) => { setDescr(e.target.value); if (descrErr) setDescrErr(''); }}
                    placeholder="Ceritakan singkat masalah yang Anda temukan." />
                </PfField>
                <PfButton icon="check" busy={busy} busyLabel="Mengirim…"
                  onClick={() => act('portal/purchase/complaint', { orderid: order.ORDERID, reason, descr }, 'Laporan terkirim.')}>
                  Kirim laporan
                </PfButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </PfModal>

      {toastNode}
    </PortalShell>
  );
}