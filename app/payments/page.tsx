'use client';

// Riwayat pembayaran milik pembeli (read-only, data sama dengan Console).

import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

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
      <div className="pf-col" style={{ gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Riwayat pembayaran</h1>
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && rows.length === 0 ? <PfEmpty title="Belum ada pembayaran" /> : null}
        {rows.map((r) => (
          <div key={r.PAYMENTID} className="pf-card">
            <div className="pf-card-pad pf-row-between">
              <div className="pf-col" style={{ gap: 3 }}>
                <strong className="pf-ticket-code">{r.PAYNO}</strong>
                <span className="pf-tiny">{r.REFTYPE} #{r.REFID} · {tanggalJam(r.PAIDAT)}</span>
              </div>
              <div className="pf-row pf-gap-sm">
                <PfBadge tone={r.STATUS === 'BERHASIL' ? 'ok' : 'warn'}>{r.STATUS}</PfBadge>
                <span className="pf-price">{rp(r.TOTALPAID)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PortalShell>
  );
}
