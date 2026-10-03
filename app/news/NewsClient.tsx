'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

type News = { NEWSID: number; TITLE: string; SUMMARY?: string; MAINIMAGE?: string; PUBLISHEDAT?: string };

function NewsInner({ initial, cities }: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  const sp = useSearchParams();
  const open = Number(sp.get('open') || 0);
  const [rows, setRows] = useState<News[]>((initial?.rows as News[]) || []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    if (initial) return;
    portalPost('portal/public/news', { limit: 30 }, { auth: false })
      .then((r) => { if (isOk(r)) setRows((r.rows as News[]) || []); else setError(String(r?.message || 'Gagal memuat berita.')); })
      .catch((e) => setError(e?.message || 'Gagal terhubung.'))
      .finally(() => setLoading(false));
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    portalPost('portal/public/news/detail', { newsid: open }, { auth: false })
      .then((r) => { if (isOk(r)) setDetail(r.news); })
      .catch(() => {});
  }, [open]);

  return (
    <PortalShell cities={cities}>
      <div className="pf-col" style={{ gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Berita</h1>
        {error ? <PfError message={error} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && rows.length === 0 ? <PfEmpty title="Belum ada berita" /> : null}

        <div className="pf-grid pf-grid-3">
          {rows.map((n) => (
            <a key={n.NEWSID} href={`/tiket-app/news?open=${n.NEWSID}`} className="pf-card">
              {n.MAINIMAGE ? <img className="pf-ev-img" src={assetUrl(n.MAINIMAGE)} alt="" loading="lazy" /> : null}
              <div className="pf-card-pad pf-col" style={{ gap: 6 }}>
                <span className="pf-tiny">{tanggalPendek(n.PUBLISHEDAT)}</span>
                <strong style={{ fontSize: 14.5, lineHeight: 1.35 }}>{n.TITLE}</strong>
                {n.SUMMARY ? <span className="pf-dim">{n.SUMMARY}</span> : null}
              </div>
            </a>
          ))}
        </div>

        {detail && (
          <div className="pf-card">
            <div className="pf-card-head">
              <span className="pf-card-title">{detail.TITLE}</span>
              <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => setDetail(null)}>Tutup</button>
            </div>
            <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
              <span className="pf-tiny">{tanggalPendek(detail.PUBLISHEDAT)}</span>
              {detail.MAINIMAGE ? <img src={assetUrl(detail.MAINIMAGE)} alt="" style={{ width: '100%', borderRadius: 12 }} /> : null}
              <div className="pf-dim" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: String(detail.BODY || '') }} />
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default function NewsClient(props: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  return (
    <Suspense fallback={<PfLoading />}>
      <NewsInner {...props} />
    </Suspense>
  );
}
