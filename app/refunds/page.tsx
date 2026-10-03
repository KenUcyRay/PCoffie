'use client';

// Riwayat refund milik pembeli (status + catatan keputusan operator).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

type Row = {
  REFUNDID: number; REFUNDNO: string; TICKETCODE: string; EVENTTITLE: string;
  NOMINAL: number; REASON: string; STATUS: string; DECISIONNOTE?: string; REQUESTTIME: string;
};

function tone(s: string): 'ok' | 'warn' | 'danger' | undefined {
  const u = s.toUpperCase();
  if (u === 'DISETUJUI' || u === 'SELESAI') return 'ok';
  if (u === 'DIAJUKAN') return 'warn';
  if (u === 'DITOLAK') return 'danger';
  return undefined;
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
      <div className="pf-col" style={{ gap: 14 }}>
        <div className="pf-row-between">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Refund</h1>
          <Link href={`/tickets`} className="pf-btn pf-btn-sm">Tiket saya</Link>
        </div>

        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && rows.length === 0 ? (
          <PfEmpty title="Belum ada pengajuan refund" hint="Ajukan refund dari halaman Tiket Saya." />
        ) : null}

        <div className="pf-col" style={{ gap: 10 }}>
          {rows.map((r) => (
            <div key={r.REFUNDID} className="pf-card">
              <div className="pf-card-pad pf-col" style={{ gap: 6 }}>
                <div className="pf-row-between">
                  <div className="pf-col" style={{ gap: 3 }}>
                    <strong>{r.EVENTTITLE}</strong>
                    <span className="pf-tiny pf-ticket-code">{r.REFUNDNO} · {r.TICKETCODE}</span>
                  </div>
                  <PfBadge tone={tone(r.STATUS)}>{r.STATUS}</PfBadge>
                </div>
                <div className="pf-row-between">
                  <span className="pf-price">{rp(r.NOMINAL)}</span>
                  <span className="pf-tiny">diajukan {tanggalJam(r.REQUESTTIME)}</span>
                </div>
                {r.REASON ? <div className="pf-dim">Alasan: {r.REASON}</div> : null}
                {r.DECISIONNOTE ? <div className="pf-dim">Catatan operator: {r.DECISIONNOTE}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}