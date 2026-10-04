'use client';

// =============================================================================
// INVOICE PEMBELI (read-only)
// -----------------------------------------------------------------------------
// Di ponsel ditampilkan sebagai daftar kartu, di layar lebar sebagai tabel rapi.
// Endpoint: portal/invoice/list (tidak berubah).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfBadge, PfCrumbs, PfEmpty, PfError, PfLoadingGrid,
} from '@/components/portal/ui';

type Row = { INVOICEID: number; INVNO: string; ISSUEDATE: string; TOTAL: number; STATUS: string; RECIPIENT?: string };

export default function InvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/invoice/list', {});
      if (isOk(r)) setRows((r.rows as Row[]) || []);
      else setError(String(r?.message || 'Gagal memuat invoice.'));
    } catch (e: any) {
      setError(e?.message || 'Silakan masuk terlebih dahulu.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Invoice' }]} />
        <h1 className="pf-h1">Invoice</h1>

        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoadingGrid count={3} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="receipt" title="Belum ada invoice"
              hint="Invoice muncul setelah pembayaran dicatat operator." />
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <>
            {/* daftar kartu untuk ponsel */}
            <div className="pf-rows pf-only-mobile">
              {rows.map((r) => (
                <article key={r.INVOICEID} className="pf-rowcard">
                  <div className="pf-rowcard-head">
                    <span className="pf-mono pf-sm pf-strong">{r.INVNO}</span>
                    <PfBadge tone="info">{r.STATUS}</PfBadge>
                  </div>
                  <div className="pf-rowcard-meta">
                    <span className="pf-rowcard-meta-row">
                      <PfIcon name="calendar" size={16} /><span>{tanggalPendek(r.ISSUEDATE)}</span>
                    </span>
                    {r.RECIPIENT ? (
                      <span className="pf-rowcard-meta-row">
                        <PfIcon name="user" size={16} /><span>{r.RECIPIENT}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="pf-rowcard-foot">
                    <span className="pf-tiny">Total</span>
                    <span className="pf-price">{rp(r.TOTAL)}</span>
                  </div>
                </article>
              ))}
            </div>

            {/* tabel untuk layar lebar */}
            <div className="pf-tablewrap pf-hide-mobile">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th scope="col">No. Invoice</th>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Penerima</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="pf-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.INVOICEID}>
                      <td><span className="pf-mono">{r.INVNO}</span></td>
                      <td>{tanggalPendek(r.ISSUEDATE)}</td>
                      <td>{r.RECIPIENT || '—'}</td>
                      <td><PfBadge tone="info">{r.STATUS}</PfBadge></td>
                      <td className="pf-num pf-strong">{rp(r.TOTAL)}</td>
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