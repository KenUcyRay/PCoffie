'use client';

// Komponen kecil yang dipakai bersama oleh semua halaman portal:
// kartu event, state (loading/kosong/error), tombol, badge, danqusai.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp, rpShort, tanggalPendek, tanggalJam } from '@/lib/portal/format';

/* --------------------------------------------------------------- status UI */

export function PfLoading({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="pf-card" aria-busy="true">
      <div className="pf-card-pad pf-col">
        <div className="pf-row pf-gap-sm" style={{ color: 'var(--pf-muted)', fontSize: 13.5 }}>
          <svg className="pf-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          </svg>
          {label}
        </div>
        <div className="pf-skel" style={{ height: 168, borderRadius: 12 }} />
        <div className="pf-skel" style={{ height: 14, width: '80%' }} />
        <div className="pf-skel" style={{ height: 12, width: '55%' }} />
      </div>
    </div>
  );
}

export function PfEmpty({ title = 'Belum ada data', hint, action }: { title?: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="pf-card">
      <div className="pf-state">
        <div className="pf-state-title">{title}</div>
        {hint && <div className="pf-dim">{hint}</div>}
        {action && <div style={{ marginTop: 14 }}>{action}</div>}
      </div>
    </div>
  );
}

export function PfError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="pf-card">
      <div className="pf-state">
        <div className="pf-state-title" style={{ color: 'var(--pf-danger)' }}>Gagal memuat</div>
        <div className="pf-dim">{message || 'Terjadi kesalahan. Silakan coba lagi.'}</div>
        {onRetry && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={onRetry}>Coba lagi</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- kartu */

export type PortalEvent = {
  EVENTID: number; TITLE: string; SUMMARY?: string; SLUG?: string;
  CATCODE?: string; CITYCODE?: string; VENUE?: string; ADDRESS?: string;
  STARTAT?: string; ENDAT?: string; POSTER?: string; ORGNAME?: string;
  MINPRICE?: number; MAXPRICE?: number;
};

export function PfEventCard({ ev }: { ev: PortalEvent }) {
  return (
    <Link href={`/events/${ev.EVENTID}`} className="pf-card">
      {ev.POSTER
        ? <img className="pf-ev-img" src={assetUrl(ev.POSTER)} alt="" loading="lazy" />
        : <div className="pf-ev-img" />}
      <div className="pf-ev-body">
        <h3 className="pf-ev-title">{ev.TITLE}</h3>
        <div className="pf-ev-meta">
          <span>{tanggalPendek(ev.STARTAT)}</span>
          {ev.VENUE ? <span>{ev.VENUE}</span> : null}
        </div>
        <div className="pf-ev-foot">
          <span className="pf-price">{rpShort(ev.MINPRICE)}</span>
          {ev.ORGNAME ? <span className="pf-tiny">{ev.ORGNAME}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function PfBadge({ children, tone }: { children: React.ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'danger' }) {
  const cls = tone ? ` pf-badge-${tone}` : '';
  return <span className={`pf-badge${cls}`}>{children}</span>;
}

/* ------------------------------------------------------------ hook data */

// Pemanggil data sisi klien dengan loading/kosong/error otomatis + tombol coba lagi.
export function usePortalData<T = any>(
  path: string,
  body: Record<string, unknown>,
  deps: React.DependencyList = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setError('');
    portalPost(path, body, { auth: body.__auth !== false })
      .then((r) => {
        if (stop) return;
        if (isOk(r)) setData(r as T);
        else setError(String(r?.message || 'Permintaan ditolak.'));
      })
      .catch((e) => { if (!stop) setError(e?.message || 'Gagal terhubung ke server.'); })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload: () => setTick((n) => n + 1) };
}