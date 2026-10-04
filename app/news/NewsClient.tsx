'use client';

// =============================================================================
// BERITA
// -----------------------------------------------------------------------------
// Endpoint tidak berubah. Perbaikan tampilan: kartu berita dengan gambar
// berproporsi tetap, dan artikel dibuka dalam modal (bukan melayang di bawah).
// Tautan memakai next/link tanpa basePath (Next menambahkannya sendiri).
// =============================================================================

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { tanggalPendek } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfCrumbs, PfEmpty, PfError, PfLoadingGrid, PfModal, PfReveal,
} from '@/components/portal/ui';

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
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Berita' }]} />
        <h1 className="pf-h1">Berita</h1>

        {error ? <PfError message={error} /> : null}
        {loading ? <PfLoadingGrid count={3} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="news" title="Belum ada berita"
              hint="Kabar terbaru tentang event akan tampil di sini." />
          </div>
        ) : null}

        <div className="pf-grid pf-grid-3">
          {rows.map((n, i) => (
            <PfReveal key={n.NEWSID} delay={Math.min(i, 8) * 50} className="pf-col">
              <Link href={`/news?open=${n.NEWSID}`} className="pf-card pf-card-link pf-col pf-grow">
                <div className="pf-art">
                  <div className="pf-art-media">
                    {n.MAINIMAGE
                      ? <img src={assetUrl(n.MAINIMAGE)} alt="" loading="lazy" width={640} height={360} />
                      : <div className="pf-art-media-empty"><PfIcon name="news" size={24} /></div>}
                  </div>
                  <span className="pf-tiny">{tanggalPendek(n.PUBLISHEDAT)}</span>
                </div>
                <div className="pf-card-pad pf-col pf-gap-xs pf-grow">
                  <h3 className="pf-art-title pf-clamp-2">{n.TITLE}</h3>
                  {n.SUMMARY ? <p className="pf-art-text pf-clamp-3">{n.SUMMARY}</p> : null}
                </div>
              </Link>
            </PfReveal>
          ))}
        </div>
      </div>

      <PfModal open={!!detail} onClose={() => setDetail(null)} title={detail?.TITLE || 'Berita'}>
        {detail ? (
          <div className="pf-col pf-gap-md">
            <span className="pf-tiny">{tanggalPendek(detail.PUBLISHEDAT)}</span>
            {detail.MAINIMAGE ? (
              <div className="pf-art-media" style={{ borderRadius: 'var(--pf-r)' }}>
                <img src={assetUrl(detail.MAINIMAGE)} alt="" width={1200} height={675} />
              </div>
            ) : null}
            <div
              className="pf-body pf-dim"
              style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: String(detail.BODY || '') }}
            />
          </div>
        ) : null}
      </PfModal>
    </PortalShell>
  );
}

export default function NewsClient(props: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  return (
    <Suspense fallback={<PfLoadingGrid count={3} />}>
      <NewsInner {...props} />
    </Suspense>
  );
}