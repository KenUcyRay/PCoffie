'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isOk, portalPost } from '@/lib/portal/api';
import { rpShort, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

type Promo = { PROMOID: number; CODE: string; DESCR?: string; DISCOUNT: number; DISCTYPE?: string; ENDDATE?: string; LEFT?: number | null; QUOTA?: number };

export default function PromosPage() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    portalPost('portal/public/promos', { limit: 40 }, { auth: false })
      .then((r) => { if (isOk(r)) setRows((r.rows as Promo[]) || []); else setError(String(r?.message || 'Gagal memuat promo.')); })
      .catch((e) => setError(e?.message || 'Gagal terhubung.'))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1600); } catch { /* ignore */ }
  };

  return (
    <PortalShell>
      <div className="pf-col" style={{ gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Promo</h1>
        {error ? <PfError message={error} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && rows.length === 0 ? <PfEmpty title="Belum ada promo aktif" /> : null}

        <div className="pf-grid pf-grid-3">
          {rows.map((p) => (
            <div key={p.PROMOID} className="pf-card">
              <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
                <div className="pf-row-between">
                  <strong style={{ fontSize: 15 }} className="pf-ticket-code">{p.CODE}</strong>
                  <PfBadge tone="accent">
                    {String(p.DISCTYPE).toUpperCase() === 'PERSEN' ? `${Number(p.DISCOUNT)}%` : rpShort(p.DISCOUNT)}
                  </PfBadge>
                </div>
                {p.DESCR ? <span className="pf-dim">{p.DESCR}</span> : null}
                <span className="pf-tiny">Berlaku sampai {tanggalPendek(p.ENDDATE)}{p.LEFT !== null && p.LEFT !== undefined ? ` · sisa ${p.LEFT}` : ''}</span>
                <button className="pf-btn pf-btn-soft pf-btn-sm pf-btn-block" type="button" onClick={() => copy(p.CODE)}>
                  {copied === p.CODE ? 'Kode disalin ✓' : 'Salin Kode'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <span className="pf-tiny">Kode promo dipakai di halaman checkout tiket.</span>
        <Link href={`/tiket-app/events`} className="pf-tiny">Lihat event yang bisa memakai promo →</Link>
      </div>
    </PortalShell>
  );
}
