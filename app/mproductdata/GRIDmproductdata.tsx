// GRIDmproductdata — tab Produk: ringkasan + tabel + ubah/stok/status/hapus.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err, summary, sellers, low
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn, selectColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMmproductdata, { type ProductForm } from './FRMmproductdata';
import { formatIDR } from './Cmproductdata';
import * as proxy from './api';
import { imageUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type ProductRow = {
  PRODUCTID?: number;
  PRODUCTCODE: string;
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
  MAINIMAGE?: string;
  IMGCOUNT?: number | string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: ProductRow) => void;
  remove: (r: ProductRow) => void;
};

const toForm = (r: ProductRow): ProductForm => ({
  PRODUCTID: r.PRODUCTID,
  SELLERID: String(r.SELLERID ?? ''),
  NAME: r.NAME || '',
  DESCR: String((r as any).DESCR || ''),
  CATEGORY: r.CATEGORY || 'Lainnya',
  PRICE: String(r.PRICE ?? ''),
  STOCK: String(r.STOCK ?? ''),
  CONDITION: String(r.CONDITION || 'BARU'),
  WEIGHT: String(r.WEIGHT ?? ''),
  ISACTIVE: r.ISACTIVE || 'YES',
  IMAGES: [],
});

function buildColumns(h: {
  onEdit: (r: ProductRow) => void;
  onRemove: (r: ProductRow) => void;
  onToggle: (r: ProductRow) => void;
  onStock: (r: ProductRow) => void;
  low: number;
}): Column<ProductRow>[] {
  return [
    noColumn,
    actionsColumn<ProductRow>((r) => (
      <>
        <Btn className="danger btn-sm" iconOnly icon="del"
          title={`Hapus ${r.PRODUCTCODE}`} aria-label={`Hapus ${r.PRODUCTCODE}`} onClick={() => h.onRemove(r)} />
        <Btn className="btn-sm" iconOnly icon="edit"
          title={`Ubah ${r.PRODUCTCODE}`} aria-label={`Ubah ${r.PRODUCTCODE}`} onClick={() => h.onEdit(r)} />
        <Btn className="btn-sm" iconOnly icon={String(r.ISACTIVE || '').toUpperCase() === 'YES' ? 'close' : 'check'}
          title={String(r.ISACTIVE || '').toUpperCase() === 'YES' ? `Nonaktifkan ${r.PRODUCTCODE}` : `Aktifkan ${r.PRODUCTCODE}`}
          aria-label={String(r.ISACTIVE || '').toUpperCase() === 'YES' ? `Nonaktifkan ${r.PRODUCTCODE}` : `Aktifkan ${r.PRODUCTCODE}`}
          onClick={() => h.onToggle(r)} />
        <Btn className="btn-sm" iconOnly icon="box"
          title={`Ubah stok ${r.PRODUCTCODE}`} aria-label={`Ubah stok ${r.PRODUCTCODE}`} onClick={() => h.onStock(r)} />
      </>
    ), 150),
    {
      key: 'MAINIMAGE', label: 'Gambar', width: 64, filter: false,
      render: (r) => {
        const src = imageUrl(r.MAINIMAGE);
        return src
          ? <img src={src} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          : <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center' }}><Icon name="box" size={18} /></span>;
      },
    },
    { key: 'PRODUCTCODE', label: 'Kode', width: 100, sortable: true },
    { key: 'NAME', label: 'Nama', width: 180, sortable: true },
    { key: 'SHOPNAME', label: 'Penjual', width: 140, filter: false },
    { key: 'CATEGORY', label: 'Kategori', width: 100, sortable: true },
    {
      key: 'PRICE', label: 'Harga', width: 110, align: 'right', sortable: true,
      render: (r) => formatIDR(r.PRICE),
    },
    {
      key: 'STOCK', label: 'Stok', width: 90, align: 'right', sortable: true,
      render: (r) => {
        const s = Number(r.STOCK) || 0;
        const low = s > 0 && s <= h.low;
        return (
          <span>
            {s}
            {s === 0 && <span className="badge err">Habis</span>}
            {low && <span className="badge">Menipis</span>}
          </span>
        );
      },
    },
    { key: 'CONDITION', label: 'Kondisi', width: 80 },
    selectColumn<ProductRow>('ISACTIVE', 'Status', ['YES', 'NO']),
  ];
}

// Modal ubah stok cepat (selisih + alasan wajib).
function StockModal({ row, onDone }: { row: ProductRow; onDone: () => void }) {
  const { close } = useModal();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [errs, setErrs] = useState<{ DELTA?: string; REASON?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errs = {};
    if (!/^-?\d+$/.test(delta.trim()) || Number(delta) === 0) e.DELTA = 'Selisih wajib angka bulat bukan nol.';
    if (!reason.trim()) e.REASON = 'Alasan wajib diisi.';
    setErrs(e);
    if (Object.keys(e).length) return;
    if (!await confirmDialog({ message: `Ubah stok ${row.PRODUCTCODE} ${Number(delta) > 0 ? '+' : ''}${delta}?` })) return;
    setBusy(true);
    try {
      const res: any = await proxy.adjust_stock({ PRODUCTID: row.PRODUCTID, DELTA: delta.trim(), REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Stok diupdate.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal update stok.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Stok ${row.PRODUCTCODE} (kini ${row.STOCK})`}
      icon="box"
      width="400px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={submit}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Selisih">
        <div>
          <input className="input" type="number" placeholder="cth. 10 atau -3" value={delta} onChange={(e) => { setDelta(e.target.value); setErrs((x) => ({ ...x, DELTA: undefined })); }} />
          {errs.DELTA && <span className="field-err">{errs.DELTA}</span>}
        </div>
      </FrmRow>
      <FrmRow label="Alasan">
        <div>
          <input className="input" placeholder="Alasan (wajib)" value={reason} onChange={(e) => { setReason(e.target.value); setErrs((x) => ({ ...x, REASON: undefined })); }} maxLength={200} />
          {errs.REASON && <span className="field-err">{errs.REASON}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

const GRIDmproductdata = forwardRef<GridApi>(function GRIDmproductdata(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [low] = useState(5);
  const [summary, setSummary] = useState({ total: 0, aktif: 0, menipis: 0, habis: 0 });

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await proxy.read_products({ limit: 0 });
      if (parseBoolean(res?.success)) {
        const all = (res.Rows || []) as ProductRow[];
        setSummary({
          total: all.length,
          aktif: all.filter((r) => String(r.ISACTIVE || '').toUpperCase() === 'YES').length,
          menipis: all.filter((r) => { const s = Number(r.STOCK) || 0; return s > 0 && s <= 5; }).length,
          habis: all.filter((r) => (Number(r.STOCK) || 0) === 0).length,
        });
      }
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_products({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f, sort: s ?? undefined });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
        setSort(s);
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [page, filters, sort]);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
  }, [load, loadSummary]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openProduct = useCallback(async (r: ProductRow) => {
    // Muat detail penuh (termasuk gambar) sebelum buka form.
    try {
      const res: any = await proxy.read_product_detail(Number(r.PRODUCTID));
      if (parseBoolean(res?.success)) {
        const d = (res.Rows || [])[0] || {};
        open(
          <FRMmproductdata
            isNew={false}
            initial={{
              ...toForm(r),
              DESCR: String(d.DESCR || ''),
              IMAGES: ((d.IMAGES || []) as any[]).map((im: any) => String(im.FILEPATH || '')),
            }}
            onSaved={() => { load({ page }); loadSummary(); }}
          />,
        );
        return;
      }
    } catch { /* jatuh ke baris grid */ }
    open(<FRMmproductdata isNew={false} initial={toForm(r)} onSaved={() => { load({ page }); loadSummary(); }} />);
  }, [open, load, page]);

  const create = useCallback(() => {
    open(<FRMmproductdata isNew onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load]);

  const toggleStatus = useCallback(async (r: ProductRow) => {
    const active = String(r.ISACTIVE || '').toUpperCase() === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} produk ${r.PRODUCTCODE}?` })) return;
    try {
      const res: any = await proxy.change_product_status({ PRODUCTID: r.PRODUCTID, ISACTIVE: active ? 'NO' : 'YES' });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); loadSummary(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, page]);

  const removeProduct = useCallback(async (r: ProductRow) => {
    if (!await confirmDialog({ message: `Hapus produk ${r.PRODUCTCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    try {
      const res: any = await proxy.process_product_delete({ PRODUCTID: r.PRODUCTID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); loadSummary(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, page]);

  const adjustStock = useCallback((r: ProductRow) => {
    open(<StockModal row={r} onDone={() => { load({ page }); loadSummary(); }} />);
  }, [open, load, page]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: ProductRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.PRODUCTCODE}`, icon: 'edit', onClick: () => openProduct(r) },
        { label: `Stok ${r.PRODUCTCODE}`, icon: 'box', onClick: () => adjustStock(r) },
        { label: `Hapus ${r.PRODUCTCODE}`, icon: 'del', danger: true, onClick: () => removeProduct(r) },
      ],
    });
  }, [openProduct, adjustStock, removeProduct]);

  const columns = useMemo(() => buildColumns({
    onEdit: openProduct, onRemove: removeProduct, onToggle: toggleStatus, onStock: adjustStock, low,
  }), [openProduct, removeProduct, toggleStatus, adjustStock, low]);

  useImperativeHandle(ref, () => ({ refresh, create, edit: openProduct, remove: removeProduct }), [refresh, create, openProduct, removeProduct]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Total produk', value: summary.total },
    { label: 'Aktif', value: summary.aktif },
    { label: `Stok menipis (≤${low})`, value: summary.menipis },
    { label: 'Stok habis', value: summary.habis },
  ];

  return (
    <div className="grid-box">
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
          </div>
        ))}
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<ProductRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.PRODUCTID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmproductdata;
