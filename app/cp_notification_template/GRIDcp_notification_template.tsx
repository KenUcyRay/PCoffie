// GRIDcp_notification_template — tabel template + ubah (tanpa tambah/hapus).
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMcp_notification_template from './FRMcp_notification_template';
import { formatTanggal } from './Ccp_notification_template';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type TemplateRow = {
  TEMPLATEID?: number;
  CODE?: string;
  CHANNEL?: string;
  NAME?: string;
  SUBJECT?: string;
  ISACTIVE?: string;
  SYSUPDATEDATE?: string;
};

export type GridApi = {
  refresh: () => void;
  edit: (r: TemplateRow) => void;
};

function buildColumns(h: { onEdit: (r: TemplateRow) => void; canWrite: boolean }): Column<TemplateRow>[] {
  return [
    noColumn,
    { key: 'CODE', label: 'Kode', width: 180, sortable: true },
    { key: 'NAME', label: 'Nama', width: 200, sortable: true },
    {
      key: 'CHANNEL', label: 'Saluran', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'EMAIL', label: 'EMAIL' }, { value: 'IN_APP', label: 'IN_APP' },
      ] as any,
    },
    {
      key: 'ISACTIVE', label: 'Status', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'YES', label: 'Aktif' }, { value: 'NO', label: 'Nonaktif' },
      ] as any,
      render: (r) => {
        const on = String(r.ISACTIVE || '').toUpperCase() === 'YES';
        return <span className={`badge ${on ? 'ok' : ''}`}>{on ? 'Aktif' : 'Nonaktif'}</span>;
      },
    },
    { key: 'SYSUPDATEDATE', label: 'Terakhir diubah', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.SYSUPDATEDATE) },
    ...(h.canWrite ? [actionsColumn<TemplateRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="edit"
        title={`Ubah ${r.CODE}`} aria-label={`Ubah ${r.CODE}`}
        onClick={() => h.onEdit(r)}
      />
    ), 48)] : []),
  ];
}

const GRIDcp_notification_template = forwardRef<GridApi>(function GRIDcp_notification_template(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [canWrite, setCanWrite] = useState(true);

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

  const openTemplate = useCallback((r: TemplateRow) => {
    if (r.TEMPLATEID == null) return;
    open(<FRMcp_notification_template templateid={Number(r.TEMPLATEID)} canWrite={canWrite} onSaved={() => load({ page })} />);
  }, [open, canWrite, load, page]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: TemplateRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.CODE}`, icon: 'edit', onClick: () => openTemplate(r) },
      ],
    });
  }, [openTemplate]);

  const columns = useMemo(() => buildColumns({ onEdit: openTemplate, canWrite }), [openTemplate, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, edit: openTemplate }), [refresh, openTemplate]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    checkMenuAccess('10060003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
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
      <DataTable<TemplateRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.TEMPLATEID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_notification_template;
