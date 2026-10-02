// GRIDcp_auditlog — read-only: waktu, user, aksi (badge warna), halaman,
// ringkasan, IP + detail (sebelum/sesudah). Bar filter di atas + export CSV.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, selectColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { formatTanggal } from './Ccp_auditlog';
import FRMcp_auditlog from './FRMcp_auditlog';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type AuditRow = {
  LOGID?: number;
  LOGTIME?: string;
  USERLOGIN?: string;
  USERNAME?: string;
  ACTION?: string;
  MCONTROL?: string;
  PAGENAME?: string;
  TABLENAME?: string;
  DATAID?: string;
  SUMMARY?: string;
  USERIP?: string;
  BEFOREJSON?: string;
  AFTERJSON?: string;
  USERAGENT?: string;
};

export type GridApi = {
  refresh: () => void;
};

function badgeColor(action: string): string {
  switch (String(action || '').toUpperCase()) {
    case 'CREATE': return 'ok';
    case 'UPDATE': return 'ok';
    case 'DELETE': return 'err';
    case 'STATUS': return '';
    case 'EXPORT': return '';
    default: return '';
  }
}

function buildColumns(onDetail: (r: AuditRow) => void): Column<AuditRow>[] {
  return [
    noColumn,
    { key: 'LOGTIME', label: 'Waktu', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.LOGTIME) },
    { key: 'USERLOGIN', label: 'User', width: 110, sortable: true },
    {
      key: 'ACTION', label: 'Aksi', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'CREATE', label: 'CREATE' }, { value: 'UPDATE', label: 'UPDATE' },
        { value: 'DELETE', label: 'DELETE' }, { value: 'STATUS', label: 'STATUS' },
        { value: 'EXPORT', label: 'EXPORT' }, { value: 'LAINNYA', label: 'LAINNYA' },
      ] as any,
      render: (r) => {
        const k = badgeColor(String(r.ACTION || ''));
        return <span className={`badge ${k}`}>{r.ACTION || '-'}</span>;
      },
    },
    { key: 'PAGENAME', label: 'Halaman', width: 140, sortable: true },
    { key: 'SUMMARY', label: 'Ringkasan', width: 220, render: (r) => String(r.SUMMARY || '-').slice(0, 80) },
    { key: 'MCONTROL', label: 'Menu', width: 100 },
    { key: 'USERIP', label: 'IP', width: 110 },
  ];
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function sevenAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const GRIDcp_auditlog = forwardRef<GridApi>(function GRIDcp_auditlog(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barUser, setBarUser] = useState('');
  const [barAction, setBarAction] = useState('');
  const [barPage, setBarPage] = useState('');
  const [barFrom, setBarFrom] = useState(sevenAgo());
  const [barTo, setBarTo] = useState(today());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; user: string; action: string; page: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bu = opts?.bar?.user ?? barUser;
    const ba = opts?.bar?.action ?? barAction;
    const bp = opts?.bar?.page ?? barPage;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: bt, user: bu, action: ba, page: bp,
      });
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
  }, [page, filters, sort, barQ, barUser, barAction, barPage, barFrom, barTo]);

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

  const openDetail = useCallback(async (r: AuditRow) => {
    if (!r.LOGID) return;
    try {
      const res: any = await proxy.read_detail(Number(r.LOGID));
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      const row = (res.Rows || [])[0] as AuditRow;
      open(<FRMcp_auditlog row={row} />);
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [open]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export({
        date_from: barFrom, date_to: barTo, user: barUser, action: barAction, page: barPage, q: barQ,
        filters,
      });
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      if (res.truncated) toast('Info', 'Hasil melebihi 10.000 baris, diekspor sebagian. Persempit filter.', 'ok');
      const { downloadCSV } = await import('./Ccp_auditlog');
      downloadCSV(String(res.csv_base64 || ''), String(res.filename || 'audit.csv'));
      toast('Success', 'Export selesai.' + (res.truncated ? ' (dipotong)' : ''), 'ok');
      load({ page: 0 });
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [barFrom, barTo, barUser, barAction, barPage, barQ, filters, load]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarUser(''); setBarAction(''); setBarPage('');
    setBarFrom(sevenAgo()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: AuditRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Lihat detail', icon: 'view', onClick: () => openDetail(r) },
      ],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns(openDetail), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const barActionOpts = ['CREATE', 'UPDATE', 'DELETE', 'STATUS', 'EXPORT', 'LAINNYA'];

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Dari</span>
        <input className="input" type="date" value={barFrom} onChange={(e) => setBarFrom(e.target.value)} style={{ width: 150 }} />
        <span className="loading-hint">s.d.</span>
        <input className="input" type="date" value={barTo} onChange={(e) => setBarTo(e.target.value)} style={{ width: 150 }} />
        <input className="input" placeholder="User" value={barUser} onChange={(e) => setBarUser(e.target.value)} style={{ width: 120 }} />
        <select value={barAction} onChange={(e) => setBarAction(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua aksi</option>
          {barActionOpts.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Halaman" value={barPage} onChange={(e) => setBarPage(e.target.value)} style={{ width: 120 }} />
        <input className="input" placeholder="Ringkasan" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <Btn className="btn-sm" icon="download" disabled={exporting} onClick={doExport}>
          {exporting ? 'Mengekspor…' : 'Export CSV'}
        </Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<AuditRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.LOGID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_auditlog;
