'use client';

// Katalog event. Semua filter disimpan di URL (search params) supaya bisa
// dibagikan/di-refresh tanpa kehilangan state. Query & harga dihitung backend.

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalShell from '@/components/portal/PortalShell';
import { PfEmpty, PfError, PfEventCard, PfLoading, type PortalEvent } from '@/components/portal/ui';

const SORTS = [
  { v: 'nearest', l: 'Terdekat' },
  { v: 'newest', l: 'Terbaru' },
  { v: 'popular', l: 'Populer' },
  { v: 'price_asc', l: 'Harga termurah' },
  { v: 'price_desc', l: 'Harga termahal' },
];

function CatalogInner({ cities }: { cities: { CITYCODE: string; CITYNAME: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  const q = sp.get('q') || '';
  const cat = sp.get('cat') || '';
  const city = sp.get('city') || '';
  const sort = sp.get('sort') || 'nearest';
  const page = Math.max(1, Number(sp.get('page') || '1'));
  const minp = sp.get('minprice') || '';
  const maxp = sp.get('maxprice') || '';

  const [rows, setRows] = useState<PortalEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cats, setCats] = useState<{ CATCODE: string; CATNAME: string }[]>([]);
  const [search, setSearch] = useState(q);

  useEffect(() => { setSearch(q); }, [q]);

  useEffect(() => {
    portalPost('portal/public/categories', {}, { auth: false })
      .then((r) => { if (isOk(r)) setCats((r.rows as any[]) || []); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res: any = await portalPost('portal/public/events', {
        q, cat, city, sort,
        minprice: minp ? Number(minp) : 0,
        maxprice: maxp ? Number(maxp) : 0,
        limit: 12,
        offset: (page - 1) * 12,
      }, { auth: false });
      if (isOk(res)) {
        setRows((res.rows as PortalEvent[]) || []);
        setTotal(Number(res.TotalRows || 0));
      } else {
        setError(String(res?.message || 'Gagal memuat event.'));
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [q, cat, city, sort, minp, maxp, page]);

  useEffect(() => { load(); }, [load]);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    if (!('page' in patch)) next.delete('page');
    router.push(`/tiket-app/events?${next.toString()}`, { scroll: false });
  };

  const maxPage = Math.max(1, Math.ceil(total / 12));

  return (
    <PortalShell cities={cities}>
      <div className="pf-section" style={{ marginTop: 0 }}>
        <form
          className="pf-row pf-gap-sm"
          onSubmit={(e) => { e.preventDefault(); setParam({ q: search }); }}
        >
          <input
            className="pf-input"
            placeholder="Cari judul event, promoters, atau venue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="pf-btn pf-btn-sm" type="submit">Cari</button>
        </form>
      </div>

      <div className="pf-card pf-card-pad pf-col" style={{ gap: 10, marginBottom: 16 }}>
        <div className="pf-row pf-wrapx pf-gap-sm">
          <select className="pf-select" style={{ maxWidth: 190 }} value={cat} onChange={(e) => setParam({ cat: e.target.value })}>
            <option value="">Semua kategori</option>
            {cats.map((c) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME}</option>)}
          </select>
          <select className="pf-select" style={{ maxWidth: 190 }} value={city} onChange={(e) => setParam({ city: e.target.value })}>
            <option value="">Semua kota</option>
            {cities.map((c) => <option key={c.CITYCODE} value={c.CITYCODE}>{c.CITYNAME}</option>)}
          </select>
          <select className="pf-select" style={{ maxWidth: 190 }} value={sort} onChange={(e) => setParam({ sort: e.target.value })}>
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <input className="pf-input" style={{ maxWidth: 120 }} inputMode="numeric" placeholder="Min" value={minp} onChange={(e) => setParam({ minprice: e.target.value.replace(/\D/g, '') })} />
          <input className="pf-input" style={{ maxWidth: 120 }} inputMode="numeric" placeholder="Maks" value={maxp} onChange={(e) => setParam({ maxprice: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="pf-tiny">
          {loading ? 'Memuat…' : `${total} event ditemukan`}
          {(q || cat || city || minp || maxp) && (
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" style={{ marginLeft: 10 }} onClick={() => router.push('/tiket-app/events', { scroll: false })}>
              Reset filter
            </button>
          )}
        </div>
      </div>

      {error ? <PfError message={error} onRetry={load} /> : null}
      {loading ? <PfLoading label="Memuat event…" /> : null}

      {!loading && !error && rows.length === 0 ? (
        <PfEmpty title="Event tidak ditemukan" hint="Coba ubah kata kunci atau kosongkan filter." />
      ) : null}

      {!loading && rows.length > 0 && (
        <div className="pf-grid pf-grid-auto">
          {rows.map((e) => <PfEventCard key={e.EVENTID} ev={e} />)}
        </div>
      )}

      {maxPage > 1 && (
        <div className="pf-row pf-gap-sm" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button className="pf-btn pf-btn-ghost pf-btn-sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Sebelumnya</button>
          <span className="pf-dim">Halaman {page} / {maxPage}</span>
          <button className="pf-btn pf-btn-ghost pf-btn-sm" disabled={page >= maxPage} onClick={() => setParam({ page: String(page + 1) })}>Berikutnya</button>
        </div>
      )}
    </PortalShell>
  );
}

export default function EventsClient({ cities }: { cities: { CITYCODE: string; CITYNAME: string }[] }) {
  return (
    <Suspense fallback={<div className="pf-wrap"><PfLoading /></div>}>
      <CatalogInner cities={cities} />
    </Suspense>
  );
}