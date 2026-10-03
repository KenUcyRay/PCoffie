// GRIDmproduct — etalase katalog hanya-baca: kartu/tabel + filter + detail.
// Klik kartu membuka detail (galeri, deskripsi, penjual) + tombol Buat Pesanan.
// Pakai komponen reusable components/DataTable.tsx untuk mode tabel.
//
// State: mode, rows, page, total, loading, err, barF, sellers
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { parseBoolean } from '@/lib/api';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { formatIDR } from './Cmproduct';
import * as proxy from './api';
import { imageUrl } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 24;

export type CatalogRow = {
  PRODUCTID?: number;
  PRODUCTCODE?: string;
  SELLERID?: number;
  SHOPNAME?: string;
  NAME?: string;
  DESCR?: string;
  CATEGORY?: string;
  PRICE?: number | string;
  STOCK?: number | string;
  CONDITION?: string;
  WEIGHT?: number | string;
  ISACTIVE?: string;
  SELLERACTIVE?: string;
  MAINIMAGE?: string;
};

export type GridApi = {
  refresh: () => void;
};

const CATEGORIES = ['Lightstick', 'Photocard', 'Figure', 'Apparel', 'Poster', 'Aksesori', 'Lainnya'];

// Modal detail produk (galeri + info + tombol Buat Pesanan).
function DetailModal({ productid, onOrder }: { productid: number; onOrder: (p: CatalogRow) => void }) {
  const { close } = useModal();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [imgIdx, setImgIdx] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(productid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [productid]);

  useEffect(() => { load(); }, [load]);

  const imgs = ((detail?.IMAGES || []) as any[]).map((im: any) => String(im.FILEPATH || '')).filter(Boolean);
  const canOrder = detail
    && String(detail.ISACTIVE || '').toUpperCase() === 'YES'
    && String(detail.SELLERACTIVE || '').toUpperCase() === 'YES'
    && (Number(detail.STOCK) || 0) > 0;

  const goOrder = () => {
    try {
      window.sessionStorage.setItem('tiket-app::order-pick', JSON.stringify({
        sellerid: detail.SELLERID, productid: detail.PRODUCTID,
      }));
    } catch { /* abaikan */ }
    openTab('/mmypurchase');
    navigate('/mmypurchase');
    close();
  };

  return (
    <Window
      title={detail?.NAME || 'Detail Produk'}
      icon="box"
      width="640px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
          <Btn
            className="primary" icon="add"
            disabled={!canOrder}
            title={canOrder ? 'Buat pesanan dengan produk ini' : 'Stok habis atau produk nonaktif'}
            onClick={() => { onOrder(detail); goOrder(); }}
          >
            Buat Pesanan
          </Btn>
        </>
      }
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load()}>Coba lagi</Btn>
        </div>
      ) : detail ? (
        <>
          {imgs.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <img
                src={imageUrl(imgs[imgIdx] || imgs[0])} alt={detail.NAME}
                style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {imgs.length > 1 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {imgs.map((p, i) => (
                    <button
                      key={`${p}-${i}`} type="button" onClick={() => setImgIdx(i)}
                      style={{ border: i === imgIdx ? '2px solid var(--brand)' : '1px solid var(--border)', borderRadius: 6, padding: 0, cursor: 'pointer', background: 'transparent' }}
                      aria-label={`Gambar ${i + 1}`}
                    >
                      <img src={imageUrl(p)} alt="" width={48} height={48} style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="empty-hint"><Icon name="box" size={16} /> Belum ada gambar.</p>
          )}
          <FrmSet legend="Produk" icon="box" columns={2}>
            <FrmRow label="Harga"><span><b>{formatIDR(detail.PRICE)}</b></span></FrmRow>
            <FrmRow label="Stok">
              <span>
                {detail.STOCK}{' '}
                {Number(detail.STOCK) === 0
                  ? <span className="badge err">Habis</span>
                  : Number(detail.STOCK) <= 5
                    ? <span className="badge">Menipis</span>
                    : null}
              </span>
            </FrmRow>
            <FrmRow label="Kondisi"><span>{detail.CONDITION}</span></FrmRow>
            <FrmRow label="Berat"><span>{detail.WEIGHT} gram</span></FrmRow>
            <FrmRow label="Penjual"><span>{detail.SHOPNAME || '-'}</span></FrmRow>
            <FrmRow label="Deskripsi"><span style={{ whiteSpace: 'pre-wrap' }}>{detail.DESCR || '-'}</span></FrmRow>
          </FrmSet>
        </>
      ) : null}
    </Window>
  );
}

function buildColumns(h: { onDetail: (r: CatalogRow) => void }): Column<CatalogRow>[] {
  return [
    noColumn,
    {
      key: 'MAINIMAGE', label: 'Gambar', width: 64, filter: false,
      render: (r) => {
        const src = imageUrl(r.MAINIMAGE);
        return src
          ? <img src={src} alt="" width={40} height={40} loading="lazy" style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center' }}><Icon name="box" size={18} /></span>;
      },
    },
    { key: 'NAME', label: 'Nama', width: 200 },
    { key: 'SHOPNAME', label: 'Penjual', width: 140, filter: false },
    { key: 'CATEGORY', label: 'Kategori', width: 100 },
    {
      key: 'PRICE', label: 'Harga', width: 110, align: 'right',
      render: (r) => formatIDR(r.PRICE),
    },
    {
      key: 'STOCK', label: 'Stok', width: 90, align: 'right',
      render: (r) => {
        const s = Number(r.STOCK) || 0;
        return (
          <span>
            {s}
            {s === 0 && <span className="badge err">Habis</span>}
            {s > 0 && s <= 5 && <span className="badge">Menipis</span>}
          </span>
        );
      },
    },
    { key: 'CONDITION', label: 'Kondisi', width: 80 },
  ];
}

const GRIDmproduct = forwardRef<GridApi>(function GRIDmproduct(_props, ref) {
  const { open } = useModal();
  const [mode, setMode] = useState<'card' | 'table'>('card');
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barCat, setBarCat] = useState('');
  const [barCond, setBarCond] = useState('');
  const [barMin, setBarMin] = useState('');
  const [barMax, setBarMax] = useState('');
  const [barSort, setBarSort] = useState('newest');

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; bar?: Partial<{ q: string; cat: string; cond: string; min: string; max: string; sort: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const bq = opts?.bar?.q ?? barQ;
    const bc = opts?.bar?.cat ?? barCat;
    const bco = opts?.bar?.cond ?? barCond;
    const bmin = opts?.bar?.min ?? barMin;
    const bmax = opts?.bar?.max ?? barMax;
    const bs = opts?.bar?.sort ?? barSort;
    // Filter kolom Nama dipetakan ke pencarian (backend katalog tanpa filter kolom).
    const effQ = bq !== '' ? bq : String(f.NAME || '');
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: effQ,
        category: bc, condition: bco, price_min: bmin, price_max: bmax, sortopt: bs,
      });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [page, filters, barQ, barCat, barCond, barMin, barMax, barSort]);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {} });
  }, [load]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const openDetail = useCallback((r: CatalogRow) => {
    if (r.PRODUCTID == null) return;
    open(<DetailModal productid={Number(r.PRODUCTID)} onOrder={() => undefined} />);
  }, [open]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarCat(''); setBarCond(''); setBarMin(''); setBarMax(''); setBarSort('newest');
    load({ page: 0, bar: { q: '', cat: '', cond: '', min: '', max: '', sort: 'newest' } });
  }, [load]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail }), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = null;

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input className="input" placeholder="Cari nama produk" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barCat} onChange={(e) => setBarCat(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua kategori</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={barCond} onChange={(e) => setBarCond(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua kondisi</option>
          {['BARU', 'BEKAS'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" type="number" min={0} placeholder="Harga min" value={barMin} onChange={(e) => setBarMin(e.target.value)} style={{ width: 110 }} />
        <input className="input" type="number" min={0} placeholder="Harga max" value={barMax} onChange={(e) => setBarMax(e.target.value)} style={{ width: 110 }} />
        <select value={barSort} onChange={(e) => setBarSort(e.target.value)} style={{ width: 140 }}>
          <option value="newest">Terbaru</option>
          <option value="price_asc">Harga terendah</option>
          <option value="price_desc">Harga tertinggi</option>
          <option value="name">Nama</option>
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <Btn className="btn-sm" icon={mode === 'card' ? 'grid' : 'box'} onClick={() => setMode(mode === 'card' ? 'table' : 'card')}>
          {mode === 'card' ? 'Tabel' : 'Kartu'}
        </Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      {loading && (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      )}
      {!loading && !err && rows.length === 0 && (
        <div className="card-body">
          <p className="empty-hint"><Icon name="box" size={16} /> Tidak ada produk.</p>
        </div>
      )}
      {!loading && mode === 'card' && rows.length > 0 && (
        <div className="mod-cards">
          {rows.map((r) => {
            const s = Number(r.STOCK) || 0;
            const src = imageUrl(r.MAINIMAGE);
            return (
              <button key={r.PRODUCTID} type="button" className="mod-card" onClick={() => openDetail(r)}>
                {src
                  ? <img src={src} alt="" loading="lazy" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 8 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <span style={{ display: 'flex', width: '100%', height: 150, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center' }}><Icon name="box" size={32} /></span>}
                <span className="mod-meta">
                  <b>{r.NAME}</b>
                  <span>{formatIDR(r.PRICE)} • {r.SHOPNAME}</span>
                  <span>
                    {r.CONDITION}
                    {s === 0 && <span className="badge err">Habis</span>}
                    {s > 0 && s <= 5 && <span className="badge">Menipis</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!loading && mode === 'table' && rows.length > 0 && (
        <DataTable<CatalogRow>
          columns={columns}
          rows={rows}
          filters={filters}
          onFilter={onFilter}
          sort={sortDir}
          startRow={page * PAGE_SIZE}
          loading={loading}
          rowKey={(r) => String(r.PRODUCTID ?? '')}
        />
      )}
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmproduct;
