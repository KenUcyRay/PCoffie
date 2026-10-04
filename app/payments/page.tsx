'use client';

// =============================================================================
// RIWAYAT PEMBAYARAN PEMBELI (read-only)
// -----------------------------------------------------------------------------
// Di ponsel daftar kartu, di layar lebar tabel. Endpoint tidak berubah.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfBadge, PfCrumbs, PfEmpty, PfError, PfLoadingGrid,
} from '@/components/portal/ui';

type Row = { PAYMENTID: number; PAYNO: string; REFTYPE: string; REFID: number; TOTALPAID: number; STATUS: string; PAIDAT: string };

export default function PaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/payment/list', {});
      if (isOk(r)) setRows((r.rows as Row[]) || []);
      else setError(String(r?.message || 'Gagal memuat pembayaran.'));
    } catch (e: any) {
      setError(e?.message || 'Silakan masuk terlebih dahulu.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Riwayat pembayaran' }]} />
        <h1 className="pf-h1">Riwayat pembayaran</h1>

        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoadingGrid count={3} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="card" title="Belum ada pembayaran"
              hint="Pembayaran tercatat di sini setelah dicatat operator." />
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <>
            <div className="pf-rows pf-only-mobile">
              {rows.map((r) => (
                <article key={r.PAYMENTID} className="pf-rowcard">
                  <div className="pf-rowcard-head">
                    <span className="pf-mono pf-sm pf-strong">{r.PAYNO}</span>
                    <PfBadge tone={r.STATUS === 'BERHASIL' ? 'ok' : 'warn'}>{r.STATUS}</PfBadge>
                  </div>
                  <div className="pf-rowcard-meta">
                    <span className="pf-rowcard-meta-row">
                      <PfIcon name="card" size={16} />
                      <span>{r.REFTYPE} #{r.REFID}</span>
                    </span>
                    <span className="pf-rowcard-meta-row">
                      <PfIcon name="calendar" size={16} /><span>{tanggalJam(r.PAIDAT)}</span>
                    </span>
                  </div>
                  <div className="pf-rowcard-foot">
                    <span className="pf-tiny">Total dibayar</span>
                    <span className="pf-price">{rp(r.TOTALPAID)}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="pf-tablewrap pf-hide-mobile">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th scope="col">No. Pembayaran</th>
                    <th scope="col">Referensi</th>
                    <th scope="col">Waktu</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="pf-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.PAYMENTID}>
                      <td><span className="pf-mono">{r.PAYNO}</span></td>
                      <td>{r.REFTYPE} #{r.REFID}</td>
                      <td>{tanggalJam(r.PAIDAT)}</td>
                      <td><PfBadge tone={r.STATUS === 'BERHASIL' ? 'ok' : 'warn'}>{r.STATUS}</PfBadge></td>
                      <td className="pf-num pf-strong">{rp(r.TOTALPAID)}</td>
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