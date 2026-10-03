'use client';

// Invoice milik pembeli (read-only).

import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

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
      <div className="pf-col" style={{ gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Invoice</h1>
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && rows.length === 0 ? <PfEmpty title="Belum ada invoice" /> : null}
        {rows.map((r) => (
          <div key={r.INVOICEID} className="pf-card">
            <div className="pf-card-pad pf-row-between">
              <div className="pf-col" style={{ gap: 3 }}>
                <strong className="pf-ticket-code">{r.INVNO}</strong>
                <span className="pf-tiny">{tanggalPendek(r.ISSUEDATE)}{r.RECIPIENT ? ` · ${r.RECIPIENT}` : ''}</span>
              </div>
              <div className="pf-row pf-gap-sm">
                <PfBadge>{r.STATUS}</PfBadge>
                <span className="pf-price">{rp(r.TOTAL)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PortalShell>
  );
}
