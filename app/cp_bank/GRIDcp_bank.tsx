// GRIDcp_bank — padanan GRIDcp_userlogin.js langit_v2, sekaligus
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
import FRMcp_bank, { type BankForm } from './FRMcp_bank';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type BankRow = {
  BANKID?: number;
  BANKCODE: string;
  BANKNAME?: string;
  BANKSHORT?: string;
  BANKACTIVE?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: BankRow) => void;
  remove: (r: BankRow) => void;
};

const toForm = (r: BankRow): BankForm => ({
  BANKID: r.BANKID,
  BANKCODE: r.BANKCODE,
  BANKNAME: r.BANKNAME || '',
  BANKSHORT: r.BANKSHORT || '',
  BANKACTIVE: r.BANKACTIVE || 'YES',
});

function buildColumns(h: { onEdit: (r: BankRow) => void; onRemove: (r: BankRow) => void; onToggle: (r: BankRow) => void }): Column<BankRow>[] {
  return [
    noColumn,
    actionsColumn<BankRow>((r) => (
      <>
        <Btn
          className="danger btn-sm" iconOnly icon="del"
          title={`Hapus ${r.BANKCODE}`} aria-label={`Hapus ${r.BANKCODE}`}
          onClick={() => h.onRemove(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon="edit"
          title={`Ubah ${r.BANKCODE}`} aria-label={`Ubah ${r.BANKCODE}`}
          onClick={() => h.onEdit(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon={r.BANKACTIVE === 'YES' ? 'close' : 'check'}
          title={r.BANKACTIVE === 'YES' ? `Nonaktifkan ${r.BANKCODE}` : `Aktifkan ${r.BANKCODE}`}
          aria-label={r.BANKACTIVE === 'YES' ? `Nonaktifkan ${r.BANKCODE}` : `Aktifkan ${r.BANKCODE}`}
          onClick={() => h.onToggle(r)}
        />
      </>
    ), 120),
    { key: 'BANKCODE', label: 'Kode', width: 90, sortable: true },
    { key: 'BANKNAME', label: 'Bank', width: 200, sortable: true },
    { key: 'BANKSHORT', label: 'Singkat', width: 110, sortable: true },
    selectColumn<BankRow>('BANKACTIVE', 'Aktif', ['YES', 'NO']),
  ];
}

const GRIDcp_bank = forwardRef<GridApi>(function GRIDcp_bank(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<BankRow[]>([]);
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

  const openBank = useCallback((r: BankRow) => {
    open(<FRMcp_bank isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const toggleStatus = useCallback(async (r: BankRow) => {
    const active = r.BANKACTIVE === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} bank ${r.BANKCODE}?` })) return;
    const res: any = await proxy.change_status({ BANKID: r.BANKID, BANKACTIVE: active ? 'NO' : 'YES' });
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const removeBank = useCallback(async (r: BankRow) => {
    if (!await confirmDialog({ message: `Hapus bank ${r.BANKCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    const res: any = await proxy.process_delete(r);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const create = useCallback(() => {
    open(<FRMcp_bank isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  const columns = useMemo(() => buildColumns({ onEdit: openBank, onRemove: removeBank, onToggle: toggleStatus }), [openBank, removeBank, toggleStatus]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: BankRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.BANKCODE}`, icon: 'edit', onClick: () => openBank(r) },
        { label: `${r.BANKACTIVE === 'YES' ? 'Nonaktifkan' : 'Aktifkan'} ${r.BANKCODE}`, icon: 'check', onClick: () => toggleStatus(r) },
        { label: `Hapus ${r.BANKCODE}`, icon: 'del', danger: true, onClick: () => removeBank(r) },
      ],
    });
  }, [openBank, toggleStatus, removeBank]);

  useImperativeHandle(
    ref,
    () => ({ refresh, create, edit: openBank, remove: removeBank }),
    [refresh, create, openBank, removeBank],
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
      <DataTable<BankRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.BANKID ?? r.BANKCODE)}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_bank;
