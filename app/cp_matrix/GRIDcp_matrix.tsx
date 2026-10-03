// GRIDcp_matrix — grid module + ubah (tanpa tambah/hapus).
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err | Kolom: buildColumns(onEdit)
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMcp_matrix, { type ModuleForm } from './FRMcp_matrix';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type ModuleRow = {
  DEFID?: number;
  DEFCODE: string;
  DEFNAME?: string;
  DEFSHORT?: number | string;
  DEFIMAGE?: string;
  PARENTCOUNT?: number | string;
  LEAFCOUNT?: number | string;
};

export type GridApi = {
  refresh: () => void;
  edit: (r: ModuleRow) => void;
};

const toForm = (r: ModuleRow): ModuleForm => ({
  DEFID: r.DEFID,
  DEFCODE: r.DEFCODE,
  DEFNAME: r.DEFNAME || '',
  DEFSHORT: String(r.DEFSHORT ?? '0'),
  DEFIMAGE: r.DEFIMAGE || '',
});

function buildColumns(h: { onEdit: (r: ModuleRow) => void }): Column<ModuleRow>[] {
  return [
    noColumn,
    actionsColumn<ModuleRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="edit"
        title={`Ubah ${r.DEFCODE}`} aria-label={`Ubah ${r.DEFCODE}`}
        onClick={() => h.onEdit(r)}
      />
    ), 48),
    { key: 'DEFSHORT', label: 'Urutan', width: 80, align: 'right', sortable: true },
    { key: 'DEFCODE', label: 'Kode', width: 130, sortable: true },
    { key: 'DEFNAME', label: 'Nama', width: 220, sortable: true },
    {
      key: 'PARENTCOUNT', label: 'Induk', width: 70, align: 'right', filter: false,
      render: (r) => String(r.PARENTCOUNT ?? '0'),
    },
    {
      key: 'LEAFCOUNT', label: 'Halaman', width: 80, align: 'right', filter: false,
      render: (r) => String(r.LEAFCOUNT ?? '0'),
    },
  ];
}

const GRIDcp_matrix = forwardRef<GridApi>(function GRIDcp_matrix(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<ModuleRow[]>([]);
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

  const openModule = useCallback((r: ModuleRow) => {
    open(<FRMcp_matrix initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: ModuleRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.DEFCODE}`, icon: 'edit', onClick: () => openModule(r) },
      ],
    });
  }, [openModule]);

  const columns = useMemo(() => buildColumns({ onEdit: openModule }), [openModule]);

  useImperativeHandle(ref, () => ({ refresh, edit: openModule }), [refresh, openModule]);

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
      <DataTable<ModuleRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.DEFID ?? r.DEFCODE)}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_matrix;
