'use client';

// My Purchase: pesanan merchandise milik pembeli + detail, batalkan,
// tandai diterima (saat DIKIRIM), dan laporkan masalah.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

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

function tone(s: string): 'ok' | 'warn' | 'danger' | undefined {
  const u = s.toUpperCase();
  if (u === 'DITERIMA' || u === 'SELESAI') return 'ok';
  if (u === 'DIPESAN' || u === 'DIPROSES' || u === 'DIKIRIM') return 'warn';
  if (u === 'DIBATAL') return 'danger';
  return undefined;
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
    if (isOk(r)) setDetail(r);
    else setError(String(r?.message || 'Detail gagal dimuat.'));
  };

  const act = async (path: string, body: Record<string, unknown>, okMsg: string) => {
    const r: any = await portalPost(path, body);
    if (!isOk(r)) { setMsg(String(r?.message || 'Gagal.')); return; }
    setMsg(okMsg);
    setDetail(null);
    setComplaint(null);
    load(status);
  };

  return (
    <PortalShell>
      <div className="pf-col" style={{ gap: 14 }}>
        <div className="pf-row-between">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Pembelian merchandise</h1>
          <Link href={`/merch`} className="pf-btn pf-btn-sm">Belanja lagi</Link>
        </div>

        <div className="pf-tabs">
          {STATUS.map((s) => (
            <button key={s.v} type="button" className={`pf-tab-pill${status === s.v ? ' is-active' : ''}`} onClick={() => setStatus(s.v)}>{s.l}</button>
          ))}
        </div>

        {msg ? <div className="pf-alert pf-alert-ok">{msg}</div> : null}
        {error ? <PfError message={error} onRetry={() => load(status)} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && rows.length === 0 ? <PfEmpty title="Belum ada pesanan merchandise" /> : null}

        <div className="pf-col" style={{ gap: 10 }}>
          {rows.map((o) => (
            <div key={o.ORDERID} className="pf-card">
              <div className="pf-card-pad pf-col" style={{ gap: 8 }}>
                <div className="pf-row-between">
                  <div className="pf-col" style={{ gap: 3 }}>
                    <strong>{o.ORDERNO}</strong>
                    <span className="pf-tiny">{o.SELLERNAME} · {o.ITEMCOUNT} item · {tanggalJam(o.CREATED)}</span>
                  </div>
                  <PfBadge tone={tone(o.ORDERSTATUS)}>{o.ORDERSTATUS}</PfBadge>
                </div>
                <div className="pf-row-between">
                  <span className="pf-price">{rp(o.TOTAL)}</span>
                  <button className="pf-btn pf-btn-sm" type="button" onClick={() => open(o.ORDERID)}>Detail</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {detail && (
          <div className="pf-card">
            <div className="pf-card-head">
              <span className="pf-card-title">{detail.order.ORDERNO}</span>
              <PfBadge tone={tone(detail.order.ORDERSTATUS)}>{detail.order.ORDERSTATUS}</PfBadge>
            </div>
            <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
              {(detail.items || []).map((i: any) => (
                <div key={i.PRODUCTID} className="pf-row-between" style={{ fontSize: 13.5 }}>
                  <span>{i.PRODUCTNAME} × {i.QTY}</span><span>{rp(i.SUBTOTAL)}</span>
                </div>
              ))}
              <div className="pf-row-between" style={{ borderTop: '1px solid var(--pf-border)', paddingTop: 8 }}>
                <span className="pf-dim">Ongkir ({detail.order.COURIER})</span><span>{rp(detail.order.SHIPPING)}</span>
              </div>
              <div className="pf-row-between"><strong>Total</strong><strong className="pf-price">{rp(detail.order.TOTAL)}</strong></div>
              <div className="pf-dim">
                <div>Alamat: {detail.order.ADDRESS}</div>
                {detail.order.TRACKINGNO ? <div>Resi: {detail.order.TRACKINGNO}</div> : null}
              </div>

              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>Riwayat status</summary>
                <div className="pf-col" style={{ gap: 4, marginTop: 8 }}>
                  {(detail.history || []).map((h: any, i: number) => (
                    <div key={i} className="pf-tiny">{tanggalJam(h.ACTTIME)} · {h.OLDSTATUS || '-'} → {h.NEWSTATUS}{h.NOTE ? ` (${h.NOTE})` : ''}</div>
                  ))}
                </div>
              </details>

              <div className="pf-row pf-gap-sm pf-wrapx">
                <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => setDetail(null)}>Tutup</button>
                {detail.order.ORDERSTATUS === 'DIPESAN' && (
                  <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => act('portal/purchase/cancel', { orderid: detail.order.ORDERID }, 'Pesanan dibatalkan.')}>
                    Batalkan
                  </button>
                )}
                {detail.order.ORDERSTATUS === 'DIKIRIM' && (
                  <>
                    <button className="pf-btn pf-btn-sm" type="button" onClick={() => act('portal/purchase/receive', { orderid: detail.order.ORDERID }, 'Pesanan ditandai diterima.')}>
                      Tandai diterima
                    </button>
                    <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => setComplaint(detail.order.ORDERID)}>Laporkan masalah</button>
                  </>
                )}
              </div>

              {complaint === detail.order.ORDERID && (
                <div className="pf-col" style={{ gap: 8, borderTop: '1px solid var(--pf-border)', paddingTop: 10 }}>
                  <select className="pf-select" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                  <textarea className="pf-textarea" rows={2} value={descr} onChange={(e) => setDescr(e.target.value)} placeholder="Keterangan (opsional)" />
                  <button className="pf-btn pf-btn-sm" type="button" onClick={() => act('portal/purchase/complaint', { orderid: detail.order.ORDERID, reason, descr }, 'Laporan terkirim.')}>
                    Kirim laporan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}