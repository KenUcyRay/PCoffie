// GRIDcp_city — padanan GRIDcp_userlogin.js langit_v2, sekaligus
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
import FRMcp_city, { type CityForm } from './FRMcp_city';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type CityRow = {
  CITYID?: number;
  CITYCODE: string;
  CITYNAME?: string;
  CITYPROV?: string;
  CITYTZ?: string;
  CATACTIVE?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: CityRow) => void;
  remove: (r: CityRow) => void;
};

const toForm = (r: CityRow): CityForm => ({
  CITYID: r.CITYID,
  CITYCODE: r.CITYCODE,
  CITYNAME: r.CITYNAME || '',
  CITYPROV: r.CITYPROV || '',
  CITYTZ: r.CITYTZ || 'WIB',
  CATACTIVE: r.CATACTIVE || 'YES',
});

function buildColumns(h: { onEdit: (r: CityRow) => void; onRemove: (r: CityRow) => void; onToggle: (r: CityRow) => void }): Column<CityRow>[] {
  return [
    noColumn,
    actionsColumn<CityRow>((r) => (
      <>
        <Btn
          className="danger btn-sm" iconOnly icon="del"
          title={`Hapus ${r.CITYCODE}`} aria-label={`Hapus ${r.CITYCODE}`}
          onClick={() => h.onRemove(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon="edit"
          title={`Ubah ${r.CITYCODE}`} aria-label={`Ubah ${r.CITYCODE}`}
          onClick={() => h.onEdit(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon={r.CATACTIVE === 'YES' ? 'close' : 'check'}
          title={r.CATACTIVE === 'YES' ? `Nonaktifkan ${r.CITYCODE}` : `Aktifkan ${r.CITYCODE}`}
          aria-label={r.CATACTIVE === 'YES' ? `Nonaktifkan ${r.CITYCODE}` : `Aktifkan ${r.CITYCODE}`}
          onClick={() => h.onToggle(r)}
        />
      </>
    ), 120),
    { key: 'CITYCODE', label: 'Kode', width: 90, sortable: true },
    { key: 'CITYNAME', label: 'Kota', width: 160, sortable: true },
    { key: 'CITYPROV', label: 'Provinsi', width: 160, sortable: true },
    selectColumn<CityRow>('CITYTZ', 'Zona', ['WIB', 'WITA', 'WIT']),
    selectColumn<CityRow>('CATACTIVE', 'Aktif', ['YES', 'NO']),
  ];
}

const GRIDcp_city = forwardRef<GridApi>(function GRIDcp_city(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<CityRow[]>([]);
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

  const openCity = useCallback((r: CityRow) => {
    open(<FRMcp_city isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const toggleStatus = useCallback(async (r: CityRow) => {
    const active = r.CATACTIVE === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} kota ${r.CITYCODE}?` })) return;
    const res: any = await proxy.change_status({ CITYID: r.CITYID, CATACTIVE: active ? 'NO' : 'YES' });
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const removeCity = useCallback(async (r: CityRow) => {
    if (!await confirmDialog({ message: `Hapus kota ${r.CITYCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    const res: any = await proxy.process_delete(r);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const create = useCallback(() => {
    open(<FRMcp_city isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: CityRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.CITYCODE}`, icon: 'edit', onClick: () => openCity(r) },
        { label: `${r.CATACTIVE === 'YES' ? 'Nonaktifkan' : 'Aktifkan'} ${r.CITYCODE}`, icon: 'check', onClick: () => toggleStatus(r) },
        { label: `Hapus ${r.CITYCODE}`, icon: 'del', danger: true, onClick: () => removeCity(r) },
      ],
    });
  }, [openCity, toggleStatus, removeCity]);

  const columns = useMemo(() => buildColumns({ onEdit: openCity, onRemove: removeCity, onToggle: toggleStatus }), [openCity, removeCity, toggleStatus]);

  useImperativeHandle(
    ref,
    () => ({ refresh, create, edit: openCity, remove: removeCity }),
    [refresh, create, openCity, removeCity],
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
      <DataTable<CityRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.CITYID ?? r.CITYCODE)}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_city;
