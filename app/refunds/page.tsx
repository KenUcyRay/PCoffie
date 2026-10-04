'use client';

// =============================================================================
// RIWAYAT REFUND PEMBELI
// -----------------------------------------------------------------------------
// Status + catatan keputusan operator. Endpoint tidak berubah.
// Tampilan: daftar kartu di ponsel, tabel di layar lebar, badge status seragam.
// =============================================================================

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfBadge, PfButton, PfCrumbs, PfEmpty, PfError, PfLoadingGrid,
} from '@/components/portal/ui';

type Row = {
  REFUNDID: number; REFUNDNO: string; TICKETCODE: string; EVENTTITLE: string;
  NOMINAL: number; REASON: string; STATUS: string; DECISIONNOTE?: string; REQUESTTIME: string;
};

function tone(s: string): 'ok' | 'warn' | 'danger' | 'info' | undefined {
  const u = s.toUpperCase();
  if (u === 'DISETUJUI' || u === 'SELESAI') return 'ok';
  if (u === 'DIAJUKAN') return 'warn';
  if (u === 'DITOLAK') return 'danger';
  return 'info';
}

export default function RefundsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/refund/list', {});
      if (isOk(r)) setRows((r.rows as Row[]) || []);
      else setError(String(r?.message || 'Gagal memuat refund.'));
    } catch (e: any) {
      setError(e?.message || 'Silakan masuk terlebih dahulu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Refund' }]} />

        <div className="pf-row-between pf-wrapx pf-gap-sm">
          <h1 className="pf-h1">Refund</h1>
          <Link href={`/tickets`} className="pf-btn pf-btn-soft pf-btn-sm">
            <PfIcon name="ticket" size={16} /> Tiket saya
          </Link>
        </div>

        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoadingGrid count={3} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="refresh" title="Belum ada pengajuan refund"
              hint="Ajukan refund dari halaman Tiket Saya."
              action={<Link href="/tickets" className="pf-btn pf-btn-sm">Buka Tiket Saya</Link>} />
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <>
            <div className="pf-rows pf-only-mobile">
              {rows.map((r) => (
                <article key={r.REFUNDID} className="pf-rowcard">
                  <div className="pf-rowcard-head">
                    <div className="pf-col pf-gap-xs" style={{ minWidth: 0 }}>
                      <span className="pf-rowcard-title pf-clamp-2">{r.EVENTTITLE}</span>
                      <span className="pf-mono pf-xs">{r.REFUNDNO} · {r.TICKETCODE}</span>
                    </div>
                    <PfBadge tone={tone(r.STATUS)}>{r.STATUS}</PfBadge>
                  </div>
                  <div className="pf-rowcard-meta">
                    <span className="pf-rowcard-meta-row">
                      <PfIcon name="calendar" size={16} /><span>Diajukan {tanggalJam(r.REQUESTTIME)}</span>
                    </span>
                  </div>
                  {r.REASON ? <p className="pf-art-text pf-clamp-2">Alasan: {r.REASON}</p> : null}
                  {r.DECISIONNOTE ? (
                    <p className="pf-art-text pf-clamp-3">Catatan operator: {r.DECISIONNOTE}</p>
                  ) : null}
                  <div className="pf-rowcard-foot">
                    <span className="pf-tiny">Nominal</span>
                    <span className="pf-price">{rp(r.NOMINAL)}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="pf-tablewrap pf-hide-mobile">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th scope="col">No. Refund</th>
                    <th scope="col">Event</th>
                    <th scope="col">Tiket</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="pf-num">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.REFUNDID}>
                      <td>
                        <span className="pf-mono">{r.REFUNDNO}</span>
                        <div className="pf-tiny">{tanggalJam(r.REQUESTTIME)}</div>
                      </td>
                      <td>
                        <div className="pf-clamp-2" style={{ maxWidth: 260 }}>{r.EVENTTITLE}</div>
                        {r.REASON ? <div className="pf-tiny pf-clamp-2">Alasan: {r.REASON}</div> : null}
                        {r.DECISIONNOTE ? <div className="pf-tiny pf-clamp-2">Catatan: {r.DECISIONNOTE}</div> : null}
                      </td>
                      <td><span className="pf-mono">{r.TICKETCODE}</span></td>
                      <td><PfBadge tone={tone(r.STATUS)}>{r.STATUS}</PfBadge></td>
                      <td className="pf-num pf-strong">{rp(r.NOMINAL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}