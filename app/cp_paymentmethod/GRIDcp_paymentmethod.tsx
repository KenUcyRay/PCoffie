// GRIDcp_paymentmethod — padanan GRIDcp_userlogin.js langit_v2, sekaligus
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
import FRMcp_paymentmethod, { type PayForm } from './FRMcp_paymentmethod';
import { formatIDR, formatPct } from './Ccp_paymentmethod';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type PayRow = {
  PAYID?: number;
  PAYCODE: string;
  PAYNAME?: string;
  PAYTYPE?: string;
  BANKCODE?: string;
  BANKSHORT?: string;
  PCTCOST?: number | string;
  FIXCOST?: number | string;
  MINAMT?: number | string;
  MAXAMT?: number | string;
  LOGO?: string;
  PAYSORT?: number | string;
  PAYACTIVE?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: PayRow) => void;
  remove: (r: PayRow) => void;
};

const toForm = (r: PayRow): PayForm => ({
  PAYID: r.PAYID,
  PAYCODE: r.PAYCODE,
  PAYNAME: r.PAYNAME || '',
  PAYTYPE: r.PAYTYPE || 'QRIS',
  BANKCODE: r.BANKCODE || '',
  PCTCOST: String(r.PCTCOST ?? '0'),
  FIXCOST: String(r.FIXCOST ?? '0'),
  MINAMT: r.MINAMT === null || r.MINAMT === undefined || r.MINAMT === '' ? '' : String(r.MINAMT),
  MAXAMT: r.MAXAMT === null || r.MAXAMT === undefined || r.MAXAMT === '' ? '' : String(r.MAXAMT),
  LOGO: r.LOGO || '',
  PAYSORT: String(r.PAYSORT ?? '0'),
  PAYACTIVE: r.PAYACTIVE || 'YES',
});

function buildColumns(h: { onEdit: (r: PayRow) => void; onRemove: (r: PayRow) => void; onToggle: (r: PayRow) => void }): Column<PayRow>[] {
  return [
    noColumn,
    actionsColumn<PayRow>((r) => (
      <>
        <Btn
          className="danger btn-sm" iconOnly icon="del"
          title={`Hapus ${r.PAYCODE}`} aria-label={`Hapus ${r.PAYCODE}`}
          onClick={() => h.onRemove(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon="edit"
          title={`Ubah ${r.PAYCODE}`} aria-label={`Ubah ${r.PAYCODE}`}
          onClick={() => h.onEdit(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon={r.PAYACTIVE === 'YES' ? 'close' : 'check'}
          title={r.PAYACTIVE === 'YES' ? `Nonaktifkan ${r.PAYCODE}` : `Aktifkan ${r.PAYCODE}`}
          aria-label={r.PAYACTIVE === 'YES' ? `Nonaktifkan ${r.PAYCODE}` : `Aktifkan ${r.PAYCODE}`}
          onClick={() => h.onToggle(r)}
        />
      </>
    ), 120),
    { key: 'PAYCODE', label: 'Kode', width: 90, sortable: true },
    { key: 'PAYNAME', label: 'Nama', width: 190, sortable: true },
    selectColumn<PayRow>('PAYTYPE', 'Tipe', ['QRIS', 'VA', 'EWALLET', 'CARD']),
    { key: 'BANKCODE', label: 'Bank', width: 90, render: (r) => r.BANKSHORT || r.BANKCODE || '-' },
    { key: 'PCTCOST', label: '%', width: 70, align: 'right', sortable: true, render: (r) => formatPct(r.PCTCOST) },
    { key: 'FIXCOST', label: 'Tetap', width: 110, align: 'right', sortable: true, render: (r) => formatIDR(r.FIXCOST) },
    { key: 'MINAMT', label: 'Minimum', width: 120, align: 'right', sortable: true, render: (r) => formatIDR(r.MINAMT) },
    { key: 'MAXAMT', label: 'Maksimum', width: 120, align: 'right', sortable: true, render: (r) => formatIDR(r.MAXAMT) },
    { key: 'PAYSORT', label: 'Urutan', width: 70, align: 'right', sortable: true },
    selectColumn<PayRow>('PAYACTIVE', 'Aktif', ['YES', 'NO']),
  ];
}

const GRIDcp_paymentmethod = forwardRef<GridApi>(function GRIDcp_paymentmethod(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<PayRow[]>([]);
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

  const openPay = useCallback((r: PayRow) => {
    open(<FRMcp_paymentmethod isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const toggleStatus = useCallback(async (r: PayRow) => {
    const active = r.PAYACTIVE === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} metode ${r.PAYCODE}?` })) return;
    const res: any = await proxy.change_status({ PAYID: r.PAYID, PAYACTIVE: active ? 'NO' : 'YES' });
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const removePay = useCallback(async (r: PayRow) => {
    if (!await confirmDialog({ message: `Hapus metode ${r.PAYCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    const res: any = await proxy.process_delete(r);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const create = useCallback(() => {
    open(<FRMcp_paymentmethod isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  const columns = useMemo(() => buildColumns({ onEdit: openPay, onRemove: removePay, onToggle: toggleStatus }), [openPay, removePay, toggleStatus]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: PayRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.PAYCODE}`, icon: 'edit', onClick: () => openPay(r) },
        { label: `${r.PAYACTIVE === 'YES' ? 'Nonaktifkan' : 'Aktifkan'} ${r.PAYCODE}`, icon: 'check', onClick: () => toggleStatus(r) },
        { label: `Hapus ${r.PAYCODE}`, icon: 'del', danger: true, onClick: () => removePay(r) },
      ],
    });
  }, [openPay, toggleStatus, removePay]);

  useImperativeHandle(
    ref,
    () => ({ refresh, create, edit: openPay, remove: removePay }),
    [refresh, create, openPay, removePay],
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
      <DataTable<PayRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.PAYID ?? r.PAYCODE)}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_paymentmethod;
