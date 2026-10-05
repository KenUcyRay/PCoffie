'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfBadge, PfButton, PfEmpty, PfError, PfEventCard, PfField, PfLoadingGrid,
  PfReveal, PfSelectWrap, PfSheet, type PortalEvent,
} from '@/components/portal/ui';

const SORTS = [
  { v: 'nearest', l: 'Terdekat' },
  { v: 'newest', l: 'Terbaru' },
  { v: 'popular', l: 'Populer' },
  { v: 'price_asc', l: 'Harga termurah' },
  { v: 'price_desc', l: 'Harga termahal' },
];

const PER_PAGE = 12;

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
  const [sheet, setSheet] = useState(false);
  const [filterOpen, setFilterOpen] = useState(true);

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
        limit: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
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
    const s = next.toString();
    router.push(`/events${s ? `?${s}` : ''}`, { scroll: false });
  };

  const maxPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilter = Boolean(q || cat || city || minp || maxp);
  const activeCount = [cat, city, minp, maxp].filter(Boolean).length;

  const controls = (
    <>
      <PfField label="Kategori">
        <PfSelectWrap value={cat} onChange={(e) => setParam({ cat: e.target.value })} aria-label="Kategori">
          <option value="">Semua kategori</option>
          {cats.map((c) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME}</option>)}
        </PfSelectWrap>
      </PfField>
      <PfField label="Kota">
        <PfSelectWrap value={city} onChange={(e) => setParam({ city: e.target.value })} aria-label="Kota">
          <option value="">Semua kota</option>
          {cities.map((c) => <option key={c.CITYCODE} value={c.CITYCODE}>{c.CITYNAME}</option>)}
        </PfSelectWrap>
      </PfField>
      <PfField label="Urutkan">
        <PfSelectWrap value={sort} onChange={(e) => setParam({ sort: e.target.value })} aria-label="Urutkan">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </PfSelectWrap>
      </PfField>
      <PfField label="Harga min">
        <input className="pf-input" inputMode="numeric" placeholder="0" aria-label="Harga minimum"
          value={minp} onChange={(e) => setParam({ minprice: e.target.value.replace(/\D/g, '') })} />
      </PfField>
      <PfField label="Harga maks">
        <input className="pf-input" inputMode="numeric" placeholder="—" aria-label="Harga maksimum"
          value={maxp} onChange={(e) => setParam({ maxprice: e.target.value.replace(/\D/g, '') })} />
      </PfField>
    </>
  );

  return (
    <PortalShell cities={cities}>
      <div className="pf-filterbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <form className="pf-searchbar"
            onSubmit={(e) => { e.preventDefault(); setParam({ q: search }); }} role="search">
            <PfIcon name="search" size={20} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul event, promoters, atau venue…"
              aria-label="Cari judul event, promoters, atau venue" />
            <button type="submit" className="pf-btn pf-btn-sm">Cari</button>
          </form>

          <div className="pf-filter-top">
            <span className="pf-filter-status pf-sm pf-muted" aria-live="polite">
              {loading ? 'Memuat…' : `${total} event ditemukan`}
              {hasFilter ? <PfBadge tone="accent" icon="filter">{activeCount + (q ? 1 : 0)} filter aktif</PfBadge> : null}
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm pf-hide-mobile"
                onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen} aria-controls="pf-filter-panel">
                <PfIcon name="filter" size={16} /> Filter
                {activeCount ? <PfBadge tone="accent">{activeCount}</PfBadge> : null}
              </button>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm pf-only-mobile"
                onClick={() => setSheet(true)} aria-haspopup="dialog">
                <PfIcon name="filter" size={16} /> Filter
                {activeCount ? <PfBadge tone="accent">{activeCount}</PfBadge> : null}
              </button>
              {hasFilter ? (
                <PfButton variant="quiet" size="sm" icon="refresh"
                  onClick={() => router.push('/events', { scroll: false })}>
                  Reset
                </PfButton>
              ) : null}
            </div>
          </div>

          <div id="pf-filter-panel" className={`pf-filter-card ${filterOpen ? '' : 'pf-hide-mobile'}`} style={filterOpen ? undefined : { display: 'none' } as any}>
            <div className="pf-filtergrid">{controls}</div>
          </div>
          <div className="pf-only-mobile" style={{ display: 'none' }} aria-hidden="true">
            <div className="pf-filtergrid">{controls}</div>
          </div>
        </div>
      </div>

      {error ? <PfError message={error} onRetry={load} /> : null}
      {loading ? <PfLoadingGrid count={PER_PAGE} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="pf-card">
          <PfEmpty
            icon="search"
            title="Event tidak ditemukan"
            hint="Coba ubah kata kunci atau kosongkan filter."
            action={hasFilter
              ? <PfButton variant="ghost" icon="refresh" onClick={() => router.push('/events', { scroll: false })}>Reset filter</PfButton>
              : undefined}
          />
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="pf-grid pf-grid-auto">
          {rows.map((e, i) => (
            <PfReveal key={e.EVENTID} delay={Math.min(i, 8) * 45}>
              <PfEventCard ev={e} />
            </PfReveal>
          ))}
        </div>
      ) : null}

      {maxPage > 1 ? (
        <nav className="pf-pager" aria-label="Navigasi halaman">
          <PfButton variant="ghost" icon="chevronLeft" disabled={page <= 1}
            onClick={() => setParam({ page: String(page - 1) })}>
            Sebelumnya
          </PfButton>
          <span className="pf-pager-info">Halaman {page} dari {maxPage}</span>
          <PfButton variant="ghost" iconRight="chevronRight" disabled={page >= maxPage}
            onClick={() => setParam({ page: String(page + 1) })}>
            Berikutnya
          </PfButton>
        </nav>
      ) : null}

      <PfSheet open={sheet} onClose={() => setSheet(false)} title="Filter event">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <PfField label="Kategori">
            <PfSelectWrap value={cat} onChange={(e) => setParam({ cat: e.target.value })} aria-label="Kategori">
              <option value="">Semua kategori</option>
              {cats.map((c) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME}</option>)}
            </PfSelectWrap>
          </PfField>
          <PfField label="Kota">
            <PfSelectWrap value={city} onChange={(e) => setParam({ city: e.target.value })} aria-label="Kota">
              <option value="">Semua kota</option>
              {cities.map((c) => <option key={c.CITYCODE} value={c.CITYCODE}>{c.CITYNAME}</option>)}
            </PfSelectWrap>
          </PfField>
          <div style={{ gridColumn: 'span 2' }}>
            <PfField label="Urutkan">
              <PfSelectWrap value={sort} onChange={(e) => setParam({ sort: e.target.value })} aria-label="Urutkan">
                {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </PfSelectWrap>
            </PfField>
          </div>
          <PfField label="Harga min">
            <input className="pf-input" inputMode="numeric" placeholder="0" aria-label="Harga minimum"
              value={minp} onChange={(e) => setParam({ minprice: e.target.value.replace(/\D/g, '') })} />
          </PfField>
          <PfField label="Harga maks">
            <input className="pf-input" inputMode="numeric" placeholder="—" aria-label="Harga maksimum"
              value={maxp} onChange={(e) => setParam({ maxprice: e.target.value.replace(/\D/g, '') })} />
          </PfField>
        </div>
        <PfButton block size="lg" icon="check" onClick={() => setSheet(false)}>
          Tampilkan {total} event
        </PfButton>
      </PfSheet>
    </PortalShell>
  );
}

export default function EventsClient({ cities }: { cities: { CITYCODE: string; CITYNAME: string }[] }) {
  return (
    <Suspense fallback={<PfLoadingGrid count={6} />}>
      <CatalogInner cities={cities} />
    </Suspense>
  );
}
