// GRIDcp_syslog — read-only: kartu ringkasan per level (klik = filter) +
// tabel waktu, level (badge), sumber, pesan, HTTP, user + detail modal.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary
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
import { formatTanggal } from './Ccp_syslog';
import FRMcp_syslog from './FRMcp_syslog';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type SysRow = {
  SYSLOGID?: number;
  LOGTIME?: string;
  LOGLEVEL?: string;
  LOGSOURCE?: string;
  MESSAGE?: string;
  CONTEXTJSON?: string;
  STACKTRACE?: string;
  URL?: string;
  METHOD?: string;
  HTTPSTATUS?: number | string;
  USERID?: number;
  USERLOGIN?: string;
  USERIP?: string;
};

export type GridApi = {
  refresh: () => void;
};

function badgeColor(level: string): string {
  switch (String(level || '').toUpperCase()) {
    case 'INFO': return 'ok';
    case 'WARNING': return '';
    case 'ERROR': return 'err';
    case 'CRITICAL': return 'err';
    default: return '';
  }
}

function buildColumns(onDetail: (r: SysRow) => void): Column<SysRow>[] {
  return [
    noColumn,
    { key: 'LOGTIME', label: 'Waktu', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.LOGTIME) },
    {
      key: 'LOGLEVEL', label: 'Level', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'INFO', label: 'INFO' }, { value: 'WARNING', label: 'WARNING' },
        { value: 'ERROR', label: 'ERROR' }, { value: 'CRITICAL', label: 'CRITICAL' },
      ] as any,
      render: (r) => {
        const k = badgeColor(String(r.LOGLEVEL || ''));
        return <span className={`badge ${k}`}>{r.LOGLEVEL || '-'}</span>;
      },
    },
    { key: 'LOGSOURCE', label: 'Sumber', width: 110, sortable: true },
    { key: 'MESSAGE', label: 'Pesan', width: 260, render: (r) => String(r.MESSAGE || '-').slice(0, 100) },
    { key: 'HTTPSTATUS', label: 'HTTP', width: 70, align: 'right' },
    { key: 'USERLOGIN', label: 'User', width: 110, sortable: true },
  ];
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const GRIDcp_syslog = forwardRef<GridApi>(function GRIDcp_syslog(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<SysRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barLevel, setBarLevel] = useState('');
  const [barSource, setBarSource] = useState('');
  const [barFrom, setBarFrom] = useState(yesterday());
  const [barTo, setBarTo] = useState(today());
  const [summary, setSummary] = useState<Record<string, number>>({});

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; level: string; source: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bl = opts?.bar?.level ?? barLevel;
    const bs = opts?.bar?.source ?? barSource;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: bt, level: bl, source: bs,
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
  }, [page, filters, sort, barQ, barLevel, barSource, barFrom, barTo]);

  const loadSummary = useCallback(async (from?: string, to?: string) => {
    try {
      const res: any = await proxy.read_summary({ date_from: from ?? barFrom, date_to: to ?? barTo });
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, [barFrom, barTo]);

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

  const openDetail = useCallback(async (r: SysRow) => {
    if (!r.SYSLOGID) return;
    try {
      const res: any = await proxy.read_detail(Number(r.SYSLOGID));
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      const row = (res.Rows || [])[0] as SysRow;
      open(<FRMcp_syslog row={row} />);
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [open]);

  const applyBar = useCallback(() => { load({ page: 0 }); loadSummary(); }, [load, loadSummary]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarLevel(''); setBarSource('');
    setBarFrom(yesterday()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary(yesterday(), today());
  }, [load, loadSummary]);

  // Klik kartu ringkasan = filter tabel ke level itu.
  const pickLevel = useCallback((lv: string) => {
    setBarLevel((prev) => {
      const next = prev === lv ? '' : lv;
      load({ page: 0, bar: { level: next } });
      return next;
    });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: SysRow, e: React.MouseEvent) => {
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
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'INFO', value: summary.INFO ?? 0, tint: 1 },
    { label: 'WARNING', value: summary.WARNING ?? 0, tint: 2 },
    { label: 'ERROR', value: summary.ERROR ?? 0, tint: 3 },
    { label: 'CRITICAL', value: summary.CRITICAL ?? 0, tint: 3 },
  ];

  return (
    <div className="grid-box">
      <div className="stat-grid">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            className="stat-card"
            onClick={() => pickLevel(c.label)}
            title={`Filter ${c.label}`}
            style={barLevel === c.label ? { outline: '2px solid var(--brand)' } : undefined}
          >
            <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
          </button>
        ))}
      </div>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Dari</span>
        <input className="input" type="date" value={barFrom} onChange={(e) => setBarFrom(e.target.value)} style={{ width: 150 }} />
        <span className="loading-hint">s.d.</span>
        <input className="input" type="date" value={barTo} onChange={(e) => setBarTo(e.target.value)} style={{ width: 150 }} />
        <select value={barLevel} onChange={(e) => setBarLevel(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua level</option>
          {['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Sumber" value={barSource} onChange={(e) => setBarSource(e.target.value)} style={{ width: 120 }} />
        <input className="input" placeholder="Pesan" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<SysRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.SYSLOGID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_syslog;
