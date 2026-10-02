// GRIDcp_fee — riwayat versi pengaturan (read-only, tanpa aksi ubah/hapus).
// Pakai komponen reusable components/DataTable.tsx. Form versi baru dibuka
// lewat GridApi.create(initial) dari tombol utama (prefill nilai saat ini).
//
// State: rows, filters, sort, page, total, loading, err | Kolom: buildColumns()
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { openContextMenu } from '@/components/ContextMenu';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, selectColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { formatIDR, formatPct, formatTanggal } from './Ccp_fee';
import FRMcp_fee, { type FeeForm } from './FRMcp_fee';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type FeeRow = {
  FEEID?: number;
  EFFECTIVEFROM?: string;
  PLATFORMPCT?: number | string;
  PLATFORMFIX?: number | string;
  SERVICEPERTICKET?: number | string;
  WITHDRAWFEE?: number | string;
  MINWITHDRAW?: number | string;
  PAYOUTWAITDAYS?: number | string;
  PAYTIMEOUTMIN?: number | string;
  FEESTATUS?: string;
  FEENOTE?: string;
  SYSCREATEUSER?: string;
  ISCURRENT?: string;
};

export type GridApi = {
  refresh: () => void;
  create: (initial?: FeeForm) => void;
};

export function toForm(r: Partial<FeeRow>): FeeForm {
  return {
    EFFECTIVEFROM: String(r.EFFECTIVEFROM || '').slice(0, 10),
    PLATFORMPCT: String(r.PLATFORMPCT ?? '0'),
    PLATFORMFIX: String(r.PLATFORMFIX ?? '0'),
    SERVICEPERTICKET: String(r.SERVICEPERTICKET ?? '0'),
    WITHDRAWFEE: String(r.WITHDRAWFEE ?? '0'),
    MINWITHDRAW: r.MINWITHDRAW === null || r.MINWITHDRAW === undefined || r.MINWITHDRAW === '' ? '' : String(r.MINWITHDRAW),
    PAYOUTWAITDAYS: String(r.PAYOUTWAITDAYS ?? '0'),
    PAYTIMEOUTMIN: String(r.PAYTIMEOUTMIN ?? '15'),
    FEENOTE: '',
  };
}

function summary(r: FeeRow): string {
  return `${formatPct(r.PLATFORMPCT)} + ${formatIDR(r.PLATFORMFIX)} | layanan ${formatIDR(r.SERVICEPERTICKET)} | tarik ${formatIDR(r.WITHDRAWFEE)}`;
}

function buildColumns(): Column<FeeRow>[] {
  return [
    noColumn,
    { key: 'EFFECTIVEFROM', label: 'Berlaku', width: 110, sortable: true, render: (r) => formatTanggal(r.EFFECTIVEFROM) },
    {
      key: 'FEENOTE', label: 'Catatan', width: 260,
      render: (r) => (
        <span>
          <b>{r.FEENOTE || '-'}</b>
          <br />
          <span className="loading-hint">{summary(r)}</span>
        </span>
      ),
    },
    selectColumn<FeeRow>('FEESTATUS', 'Status', ['AKTIF', 'DIBATALKAN']),
    { key: 'SYSCREATEUSER', label: 'Dibuat oleh', width: 120 },
    {
      key: 'ISCURRENT', label: 'Berlaku', width: 80, filter: false,
      render: (r) => (r.ISCURRENT === 'YES' ? <b>Ya</b> : <span className="loading-hint">-</span>),
    },
  ];
}

const GRIDcp_fee = forwardRef<GridApi, { onChanged?: () => void }>(function GRIDcp_fee({ onChanged }, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<FeeRow[]>([]);
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
      const res: any = await proxy.read_history({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f, sort: s ?? undefined });
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

  const openVersion = useCallback((initial?: FeeForm) => {
    open(<FRMcp_fee base={initial} initial={initial} onSaved={() => { load({ page: 0 }); onChanged?.(); }} />);
  }, [load, open, onChanged]);

  const columns = useMemo(() => buildColumns(), []);

  // Klik-kanan baris: duplikat sebagai versi baru (hanya mode desktop).
  const rowMenu = useCallback((r: FeeRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Duplikat sebagai versi baru', icon: 'add', onClick: () => openVersion(toForm(r)) },
      ],
    });
  }, [openVersion]);

  useImperativeHandle(ref, () => ({ refresh, create: openVersion }), [refresh, openVersion]);

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
      <DataTable<FeeRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.FEEID ?? '')}
        isActive={(r) => r.ISCURRENT === 'YES'}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_fee;
