// GRIDcp_loginhistory — read-only: kartu ringkasan + tabel waktu, username,
// hasil (badge), alasan, IP, perangkat/browser + export CSV + penanda brute-force.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, selectColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { formatTanggal, downloadCSV } from './Ccp_loginhistory';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type LoginRow = {
  LOGINID?: number;
  LOGTIME?: string;
  TYPEDUSER?: string;
  USERID?: number;
  RESULT?: string;
  FAILREASON?: string;
  USERIP?: string;
  DEVICE?: string;
  BROWSER?: string;
};

export type GridApi = {
  refresh: () => void;
};

function badgeColor(result: string): string {
  switch (String(result || '').toUpperCase()) {
    case 'SUCCESS': return 'ok';
    case 'FAILED': return 'err';
    case 'BLOCKED': return 'err';
    case 'LOGOUT': return '';
    default: return '';
  }
}

function buildColumns(): Column<LoginRow>[] {
  return [
    noColumn,
    { key: 'LOGTIME', label: 'Waktu', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.LOGTIME) },
    { key: 'TYPEDUSER', label: 'Username', width: 130, sortable: true },
    {
      key: 'RESULT', label: 'Hasil', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'SUCCESS', label: 'SUCCESS' }, { value: 'FAILED', label: 'FAILED' },
        { value: 'BLOCKED', label: 'BLOCKED' }, { value: 'LOGOUT', label: 'LOGOUT' },
      ] as any,
      render: (r) => {
        const k = badgeColor(String(r.RESULT || ''));
        return <span className={`badge ${k}`}>{r.RESULT || '-'}</span>;
      },
    },
    {
      key: 'FAILREASON', label: 'Alasan', width: 140, sortable: true,
      filter: 'select', options: [
        { value: 'WRONG_PASSWORD', label: 'WRONG_PASSWORD' }, { value: 'USER_NOT_FOUND', label: 'USER_NOT_FOUND' },
        { value: 'INACTIVE', label: 'INACTIVE' }, { value: 'BLOCKED', label: 'BLOCKED' },
      ] as any,
    },
    { key: 'USERIP', label: 'IP', width: 120 },
    {
      key: 'DEVICE', label: 'Perangkat', width: 120,
      render: (r) => [r.DEVICE, r.BROWSER].filter(Boolean).join(' / ') || '-',
    },
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

const GRIDcp_loginhistory = forwardRef<GridApi>(function GRIDcp_loginhistory(_props, ref) {
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barUser, setBarUser] = useState('');
  const [barResult, setBarResult] = useState('');
  const [barReason, setBarReason] = useState('');
  const [barIp, setBarIp] = useState('');
  const [barFrom, setBarFrom] = useState(sevenAgo());
  const [barTo, setBarTo] = useState(today());
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; user: string; result: string; reason: string; ip: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bu = opts?.bar?.user ?? barUser;
    const br = opts?.bar?.result ?? barResult;
    const be = opts?.bar?.reason ?? barReason;
    const bi = opts?.bar?.ip ?? barIp;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: bt, user: bu, result: br, reason: be, ip: bi,
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
  }, [page, filters, sort, barQ, barUser, barResult, barReason, barIp, barFrom, barTo]);

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

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export({
        date_from: barFrom, date_to: barTo, user: barUser, result: barResult,
        reason: barReason, ip: barIp, q: barQ, filters,
      });
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      if (res.truncated) toast('Info', 'Hasil melebihi 10.000 baris, diekspor sebagian. Persempit filter.', 'ok');
      downloadCSV(String(res.csv_base64 || ''), String(res.filename || 'login.csv'));
      toast('Success', 'Export selesai.' + (res.truncated ? ' (dipotong)' : ''), 'ok');
      load({ page: 0 });
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [barFrom, barTo, barUser, barResult, barReason, barIp, barQ, filters, load]);

  const applyBar = useCallback(() => { load({ page: 0 }); loadSummary(); }, [load, loadSummary]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarUser(''); setBarResult(''); setBarReason(''); setBarIp('');
    setBarFrom(sevenAgo()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary(sevenAgo(), today());
  }, [load, loadSummary]);

  // Penanda brute-force: >=3 gagal beruntun user/IP sama (di halaman ini).
  const streakKey = (r: LoginRow, i: number): boolean => {
    if (String(r.RESULT || '').toUpperCase() !== 'FAILED') return false;
    let n = 0;
    for (let j = i; j >= 0 && n < 3; j--) {
      const x = rows[j];
      if (String(x.RESULT || '').toUpperCase() !== 'FAILED') break;
      if ((x.TYPEDUSER || '') !== (r.TYPEDUSER || '') && (x.USERIP || '') !== (r.USERIP || '')) break;
      n++;
    }
    return n >= 3;
  };

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: LoginRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Filter user ${r.TYPEDUSER || '-'}`, icon: 'search', onClick: () => { setBarUser(String(r.TYPEDUSER || '')); load({ page: 0, bar: { user: String(r.TYPEDUSER || '') } }); } },
        { label: `Filter IP ${r.USERIP || '-'}`, icon: 'search', onClick: () => { setBarIp(String(r.USERIP || '')); load({ page: 0, bar: { ip: String(r.USERIP || '') } }); } },
      ],
    });
  }, [load]);

  const columns = useMemo(() => buildColumns(), []);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Berhasil', value: summary.SUCCESS ?? 0, tint: 1 },
    { label: 'Gagal', value: summary.FAILED ?? 0, tint: 3 },
    { label: 'Diblokir', value: summary.BLOCKED ?? 0, tint: 2 },
    { label: 'IP ggl trbanyak', value: summary.TOP_IP && summary.TOP_IP !== '-' ? `${summary.TOP_IP} (${summary.TOP_IP_FAILS ?? 0})` : '-', tint: 4 },
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
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Dari</span>
        <input className="input" type="date" value={barFrom} onChange={(e) => setBarFrom(e.target.value)} style={{ width: 150 }} />
        <span className="loading-hint">s.d.</span>
        <input className="input" type="date" value={barTo} onChange={(e) => setBarTo(e.target.value)} style={{ width: 150 }} />
        <input className="input" placeholder="Username" value={barUser} onChange={(e) => setBarUser(e.target.value)} style={{ width: 120 }} />
        <select value={barResult} onChange={(e) => setBarResult(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua hasil</option>
          {['SUCCESS', 'FAILED', 'BLOCKED', 'LOGOUT'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barReason} onChange={(e) => setBarReason(e.target.value)} style={{ width: 150 }}>
          <option value="">Semua alasan</option>
          {['WRONG_PASSWORD', 'USER_NOT_FOUND', 'INACTIVE', 'BLOCKED'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="IP" value={barIp} onChange={(e) => setBarIp(e.target.value)} style={{ width: 120 }} />
        <input className="input" placeholder="Cari" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
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
      <DataTable<LoginRow>
        columns={columns}
        rows={rows.map((r, i) => ({ ...r, _streak: streakKey(r, i) }) as any)}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.LOGINID ?? '')}
        isActive={(r: any) => !!r._streak}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_loginhistory;
