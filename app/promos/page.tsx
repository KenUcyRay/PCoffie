'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isOk, portalPost } from '@/lib/portal/api';
import { rpShort, tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfBadge, PfButton, PfCrumbs, PfEmpty, PfError, PfLoadingGrid, PfReveal,
} from '@/components/portal/ui';

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
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Promo' }]} />
        <h1 className="pf-h1">Promo</h1>

        {error ? <PfError message={error} /> : null}
        {loading ? <PfLoadingGrid count={3} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="discount" title="Belum ada promo aktif"
              hint="Promo yang sedang berjalan akan tampil di sini." />
          </div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="pf-grid pf-grid-3">
            {rows.map((p, i) => (
              <PfReveal key={p.PROMOID} delay={Math.min(i, 6) * 55} className="pf-col">
                <article className="pf-card pf-col pf-grow">
                  <div className="pf-card-head">
                    <span className="pf-card-title">
                      <PfIcon name="discount" size={20} />
                      <span className="pf-mono">{p.CODE}</span>
                    </span>
                    <PfBadge tone="accent">
                      {String(p.DISCTYPE).toUpperCase() === 'PERSEN' ? `${Number(p.DISCOUNT)}%` : rpShort(p.DISCOUNT)}
                    </PfBadge>
                  </div>
                  <div className="pf-card-pad pf-col pf-gap-sm pf-grow">
                    {p.DESCR ? <p className="pf-art-text pf-clamp-3">{p.DESCR}</p> : <span />}
                    <span className="pf-tiny">
                      Berlaku sampai {tanggalPendek(p.ENDDATE)}
                      {p.LEFT !== null && p.LEFT !== undefined ? ` · sisa ${p.LEFT}` : ''}
                    </span>
                    <PfButton
                      variant={copied === p.CODE ? 'soft' : 'primary'}
                      icon={copied === p.CODE ? 'check' : 'copy'}
                      block
                      onClick={() => copy(p.CODE)}
                    >
                      {copied === p.CODE ? 'Kode disalin' : 'Salin Kode'}
                    </PfButton>
                  </div>
                </article>
              </PfReveal>
            ))}
          </div>
        ) : null}

        <span className="pf-tiny">Kode promo dipakai di halaman checkout tiket.</span>
      </div>
    </PortalShell>
  );
}
