// GRIDcp_category — padanan GRIDcp_userlogin.js langit_v2, sekaligus
// "store + proxy"-nya. Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err | Kolom: buildColumns(handlers)
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn, selectColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMcp_category, { type CategoryForm } from './FRMcp_category';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type CategoryRow = {
  CATID?: number;
  CATCODE: string;
  CATNAME?: string;
  CATSORT?: number | string;
  CATACTIVE?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: CategoryRow) => void;
  remove: (r: CategoryRow) => void;
};

const toForm = (r: CategoryRow): CategoryForm => ({
  CATID: r.CATID,
  CATCODE: r.CATCODE,
  CATNAME: r.CATNAME || '',
  CATSORT: String(r.CATSORT ?? '0'),
  CATACTIVE: r.CATACTIVE || 'YES',
});

function buildColumns(h: { onEdit: (r: CategoryRow) => void; onRemove: (r: CategoryRow) => void; onToggle: (r: CategoryRow) => void }): Column<CategoryRow>[] {
  return [
    noColumn,
    actionsColumn<CategoryRow>((r) => (
      <>
        <Btn
          className="danger btn-sm" iconOnly icon="del"
          title={`Hapus ${r.CATCODE}`} aria-label={`Hapus ${r.CATCODE}`}
          onClick={() => h.onRemove(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon="edit"
          title={`Ubah ${r.CATCODE}`} aria-label={`Ubah ${r.CATCODE}`}
          onClick={() => h.onEdit(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon={r.CATACTIVE === 'YES' ? 'close' : 'check'}
          title={r.CATACTIVE === 'YES' ? `Nonaktifkan ${r.CATCODE}` : `Aktifkan ${r.CATCODE}`}
          aria-label={r.CATACTIVE === 'YES' ? `Nonaktifkan ${r.CATCODE}` : `Aktifkan ${r.CATCODE}`}
          onClick={() => h.onToggle(r)}
        />
      </>
    ), 120),
    { key: 'CATCODE', label: 'Kode', width: 110, sortable: true },
    { key: 'CATNAME', label: 'Nama', width: 200, sortable: true },
    { key: 'CATSORT', label: 'Urutan', width: 80, align: 'right', sortable: true },
    selectColumn<CategoryRow>('CATACTIVE', 'Aktif', ['YES', 'NO']),
  ];
}

const GRIDcp_category = forwardRef<GridApi>(function GRIDcp_category(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f, sort: s ?? undefined });
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
  }, [load]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openCategory = useCallback((r: CategoryRow) => {
    open(<FRMcp_category isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const toggleStatus = useCallback(async (r: CategoryRow) => {
    const active = r.CATACTIVE === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} kategori ${r.CATCODE}?` })) return;
    const res: any = await proxy.change_status({ CATID: r.CATID, CATACTIVE: active ? 'NO' : 'YES' });
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const removeCategory = useCallback(async (r: CategoryRow) => {
    if (!await confirmDialog({ message: `Hapus kategori ${r.CATCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    const res: any = await proxy.process_delete(r);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const create = useCallback(() => {
    open(<FRMcp_category isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: CategoryRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.CATCODE}`, icon: 'edit', onClick: () => openCategory(r) },
        { label: `${r.CATACTIVE === 'YES' ? 'Nonaktifkan' : 'Aktifkan'} ${r.CATCODE}`, icon: 'check', onClick: () => toggleStatus(r) },
        { label: `Hapus ${r.CATCODE}`, icon: 'del', danger: true, onClick: () => removeCategory(r) },
      ],
    });
  }, [openCategory, toggleStatus, removeCategory]);

  const columns = useMemo(() => buildColumns({ onEdit: openCategory, onRemove: removeCategory, onToggle: toggleStatus }), [openCategory, removeCategory, toggleStatus]);

  useImperativeHandle(
    ref,
    () => ({ refresh, create, edit: openCategory, remove: removeCategory }),
    [refresh, create, openCategory, removeCategory],
  );

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  return (
    <div className="grid-box">
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<CategoryRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.CATID ?? r.CATCODE)}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_category;
