// GRIDmscanhistory — kartu ringkasan + tabel riwayat scan + export CSV.
// Read-only (tanpa tambah/ubah/hapus). Pakai komponen DataTable.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary, exporting
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { formatTanggal, downloadCSV } from './Cmscanhistory';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type ScanRow = {
  SCANID?: number;
  SCANTIME?: string;
  EVENTTITLE?: string;
  SCANCODE?: string;
  ATTNAME?: string;
  TYPENAME?: string;
  RESULT?: string;
  USERLOGIN?: string;
  METHOD?: string;
};

export type GridApi = {
  refresh: () => void;
};

function badgeColor(result: string): string {
  switch (String(result || '').toUpperCase()) {
    case 'VALID': return 'ok';
    case 'SUDAH_DIPAKAI': return '';
    default: return 'err';
  }
}

function buildColumns(): Column<ScanRow>[] {
  return [
    noColumn,
    { key: 'SCANTIME', label: 'Waktu', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.SCANTIME) },
    { key: 'SCANCODE', label: 'Kode', width: 130, sortable: false },
    { key: 'ATTNAME', label: 'Pemilik', width: 150, filter: false },
    { key: 'TYPENAME', label: 'Tipe', width: 110, filter: false },
    {
      key: 'RESULT', label: 'Hasil', width: 130, sortable: true,
      filter: 'select', options: [
        { value: 'VALID', label: 'VALID' }, { value: 'SUDAH_DIPAKAI', label: 'SUDAH_DIPAKAI' },
        { value: 'TIDAK_VALID', label: 'TIDAK_VALID' }, { value: 'SALAH_EVENT', label: 'SALAH_EVENT' },
        { value: 'BELUM_DIBAYAR', label: 'BELUM_DIBAYAR' }, { value: 'REFUND', label: 'REFUND' },
        { value: 'DIBATALKAN', label: 'DIBATALKAN' }, { value: 'DI_LUAR_JADWAL', label: 'DI_LUAR_JADWAL' },
      ] as any,
      render: (r) => <span className={`badge ${badgeColor(String(r.RESULT || ''))}`}>{r.RESULT || '-'}</span>,
    },
    { key: 'USERLOGIN', label: 'Petugas', width: 110, sortable: true },
    { key: 'METHOD', label: 'Metode', width: 90 },
  ];
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const GRIDmscanhistory = forwardRef<GridApi>(function GRIDmscanhistory(_props, ref) {
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barEvent, setBarEvent] = useState('');
  const [barResult, setBarResult] = useState('');
  const [barUser, setBarUser] = useState('');
  const [barFrom, setBarFrom] = useState(today());
  const [barTo, setBarTo] = useState(today());
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; event: string; result: string; user: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const be = opts?.bar?.event ?? barEvent;
    const br = opts?.bar?.result ?? barResult;
    const bu = opts?.bar?.user ?? barUser;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: bt, eventid: be, result: br, user: bu,
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
  }, [page, filters, sort, barQ, barEvent, barResult, barUser, barFrom, barTo]);

  const loadSummary = useCallback(async (ev?: string) => {
    try {
      const res: any = await proxy.read_summary(ev ?? barEvent);
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, [barEvent]);

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
        date_from: barFrom, date_to: barTo, eventid: barEvent,
        result: barResult, user: barUser, q: barQ, filters,
      });
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      if (res.truncated) toast('Success', 'Hasil melebihi 10.000 baris, diekspor sebagian. Persempit filter.', 'ok');
      downloadCSV(String(res.csv_base64 || ''), String(res.filename || 'scan.csv'));
      toast('Success', 'Export selesai.' + (res.truncated ? ' (dipotong)' : ''), 'ok');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [barFrom, barTo, barEvent, barResult, barUser, barQ, filters]);

  const applyBar = useCallback(() => { load({ page: 0 }); loadSummary(); }, [load, loadSummary]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarEvent(''); setBarResult(''); setBarUser('');
    setBarFrom(today()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary('');
  }, [load, loadSummary]);

  const columns = useMemo(() => buildColumns(), []);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Total scan', value: summary.TOTAL ?? 0 },
    { label: 'Valid', value: summary.VALID ?? 0 },
    { label: 'Ditolak', value: (Number(summary.TOTAL) || 0) - (Number(summary.VALID) || 0) },
    { label: 'Kehadiran', value: `${summary.HADIRPCT ?? 0}%` },
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
        <input className="input" placeholder="ID event" value={barEvent} onChange={(e) => setBarEvent(e.target.value)} style={{ width: 100 }} />
        <select value={barResult} onChange={(e) => setBarResult(e.target.value)} style={{ width: 140 }}>
          <option value="">Semua hasil</option>
          {['VALID', 'SUDAH_DIPAKAI', 'TIDAK_VALID', 'SALAH_EVENT', 'BELUM_DIBAYAR', 'REFUND', 'DIBATALKAN', 'DI_LUAR_JADWAL'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Petugas" value={barUser} onChange={(e) => setBarUser(e.target.value)} style={{ width: 120 }} />
        <input className="input" placeholder="Cari kode/nama" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
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
      <DataTable<ScanRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.SCANID ?? '')}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmscanhistory;
