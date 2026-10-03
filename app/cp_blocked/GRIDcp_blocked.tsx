// GRIDcp_blocked — kartu ringkasan + tabel blokir + tambah manual + Buka Blokir.
// Tanpa hapus fisik (buka blokir = STATUS DIBUKA).
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMcp_blocked from './FRMcp_blocked';
import { formatTanggal } from './Ccp_blocked';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type BlockRow = {
  BLOCKID?: number;
  BLOCKTYPE?: string;
  BLOCKVALUE?: string;
  SOURCE?: string;
  REASON?: string;
  STARTIME?: string;
  ENDTIME?: string;
  STATUS?: string;
  UNBLOCKTIME?: string;
  UNBLOCKBY?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  unblock: (r: BlockRow) => void;
};

function badgeColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'AKTIF': return 'err';
    case 'DIBUKA': return 'ok';
    case 'KEDALUWARSA': return '';
    default: return '';
  }
}

function buildColumns(h: { onUnblock: (r: BlockRow) => void; canWrite: boolean }): Column<BlockRow>[] {
  return [
    noColumn,
    {
      key: 'BLOCKTYPE', label: 'Jenis', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'USERNAME', label: 'USERNAME' }, { value: 'IP', label: 'IP' },
      ] as any,
    },
    { key: 'BLOCKVALUE', label: 'Nilai', width: 150, sortable: true },
    {
      key: 'SOURCE', label: 'Sumber', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'AUTO', label: 'AUTO' }, { value: 'MANUAL', label: 'MANUAL' },
      ] as any,
    },
    { key: 'REASON', label: 'Alasan', width: 200 },
    { key: 'STARTIME', label: 'Mulai', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.STARTIME) },
    { key: 'ENDTIME', label: 'Berakhir', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.ENDTIME) },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'AKTIF', label: 'AKTIF' }, { value: 'DIBUKA', label: 'DIBUKA' },
        { value: 'KEDALUWARSA', label: 'KEDALUWARSA' },
      ] as any,
      render: (r) => {
        const k = badgeColor(String(r.STATUS || ''));
        return <span className={`badge ${k}`}>{r.STATUS || '-'}</span>;
      },
    },
    ...(h.canWrite ? [actionsColumn<BlockRow>((r) => {
      const active = String(r.STATUS || '').toUpperCase() === 'AKTIF';
      return (
        <Btn
          className="btn-sm" iconOnly icon="check"
          title={active ? `Buka blokir ${r.BLOCKVALUE || ''}` : 'Blokir sudah tidak aktif'}
          aria-label={active ? `Buka blokir ${r.BLOCKVALUE || ''}` : 'Blokir sudah tidak aktif'}
          disabled={!active}
          onClick={() => h.onUnblock(r)}
        />
      );
    }, 48)] : []),
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

const GRIDcp_blocked = forwardRef<GridApi>(function GRIDcp_blocked(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barType, setBarType] = useState('');
  const [barSource, setBarSource] = useState('');
  const [barStatus, setBarStatus] = useState('AKTIF');
  const [barValue, setBarValue] = useState('');
  const [barFrom, setBarFrom] = useState(sevenAgo());
  const [barTo, setBarTo] = useState(today());
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; type: string; source: string; status: string; value: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bt = opts?.bar?.type ?? barType;
    const bs2 = opts?.bar?.source ?? barSource;
    const bs = opts?.bar?.status ?? barStatus;
    const bv = opts?.bar?.value ?? barValue;
    const bf = opts?.bar?.from ?? barFrom;
    const btt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: btt, type: bt, source: bs2, status: bs, value: bv,
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
  }, [page, filters, sort, barQ, barType, barSource, barStatus, barValue, barFrom, barTo]);

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await proxy.read_summary();
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

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

  const create = useCallback(() => {
    open(<FRMcp_blocked onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [load, loadSummary, open]);

  const unblock = useCallback(async (r: BlockRow) => {
    if (!await confirmDialog({ message: `Buka blokir ${r.BLOCKTYPE} ${r.BLOCKVALUE || '-'}? Akses login pulih kembali.` })) return;
    try {
      const res: any = await proxy.process_unblock({ BLOCKID: r.BLOCKID });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Blokir berhasil dibuka.', 'ok');
        load({ page });
        loadSummary();
      } else toast('Error', res?.message || 'Gagal membuka blokir.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, loadSummary, page]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarType(''); setBarSource(''); setBarStatus('AKTIF'); setBarValue('');
    setBarFrom(sevenAgo()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null, bar: { status: 'AKTIF' } });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: BlockRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Filter nilai ${r.BLOCKVALUE || '-'}`, icon: 'search', onClick: () => { setBarValue(String(r.BLOCKVALUE || '')); load({ page: 0, bar: { value: String(r.BLOCKVALUE || '') } }); } },
      ],
    });
  }, [load]);

  const columns = useMemo(() => buildColumns({ onUnblock: unblock, canWrite }), [unblock, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create, unblock }), [refresh, create, unblock]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('10030004').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Username aktif', value: summary.ACTIVE_USER ?? 0, tint: 1 },
    { label: 'IP aktif', value: summary.ACTIVE_IP ?? 0, tint: 2 },
    { label: 'Otomatis 24 jam', value: summary.AUTO_24H ?? 0, tint: 3 },
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
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua jenis</option>
          {['USERNAME', 'IP'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barSource} onChange={(e) => setBarSource(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua sumber</option>
          {['AUTO', 'MANUAL'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['AKTIF', 'DIBUKA', 'KEDALUWARSA'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Nilai" value={barValue} onChange={(e) => setBarValue(e.target.value)} style={{ width: 130 }} />
        <input className="input" placeholder="Cari" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
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
      <DataTable<BlockRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.BLOCKID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_blocked;
