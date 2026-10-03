// GRIDcp_message_history — kartu ringkasan + tabel pesan + detail + tarik pesan.
// Klik baris membuka detail (isi, penerima, penarikan). Tanpa ubah isi/hapus.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary, canWrite
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
import FRMcp_message_history from './FRMcp_message_history';
import { formatTanggal } from './Ccp_message_history';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type MessageRow = {
  MSGID?: number;
  TITLE?: string;
  PRIORITY?: string;
  TARGETTYPE?: string;
  SENTAT?: string;
  STATUS?: string;
  RECIPIENTCOUNT?: number | string;
  READCOUNT?: number | string;
  READPCT?: number | string;
  SENDERLOGIN?: string;
};

export type GridApi = {
  refresh: () => void;
  openDetail: (r: MessageRow) => void;
};

function prioBadge(p: string): string {
  switch (String(p || '').toUpperCase()) {
    case 'DARURAT': return 'err';
    case 'PENTING': return '';
    default: return 'ok';
  }
}

function buildColumns(h: { onDetail: (r: MessageRow) => void }): Column<MessageRow>[] {
  return [
    noColumn,
    { key: 'SENTAT', label: 'Dikirim', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.SENTAT) },
    {
      key: 'TITLE', label: 'Judul', width: 220, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}>{r.TITLE || '-'}</a>,
    },
    {
      key: 'PRIORITY', label: 'Prioritas', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'INFO', label: 'INFO' }, { value: 'PENTING', label: 'PENTING' },
        { value: 'DARURAT', label: 'DARURAT' },
      ] as any,
      render: (r) => <span className={`badge ${prioBadge(String(r.PRIORITY || ''))}`}>{r.PRIORITY || '-'}</span>,
    },
    {
      key: 'TARGETTYPE', label: 'Target', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'ALL', label: 'ALL' }, { value: 'GROUP', label: 'GROUP' }, { value: 'USER', label: 'USER' },
      ] as any,
    },
    { key: 'RECIPIENTCOUNT', label: 'Penerima', width: 80, align: 'right', filter: false },
    {
      key: 'READCOUNT', label: 'Terbaca', width: 100, align: 'right', filter: false,
      render: (r) => `${r.READCOUNT ?? 0} (${r.READPCT ?? 0}%)`,
    },
    {
      key: 'STATUS', label: 'Status', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'TERKIRIM', label: 'TERKIRIM' }, { value: 'DITARIK', label: 'DITARIK' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${s === 'DITARIK' ? 'err' : 'ok'}`}>{r.STATUS || '-'}</span>;
      },
    },
    actionsColumn<MessageRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="view"
        title={`Detail ${r.TITLE || ''}`} aria-label={`Detail ${r.TITLE || ''}`}
        onClick={() => h.onDetail(r)}
      />
    ), 48),
  ];
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function thirtyAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const GRIDcp_message_history = forwardRef<GridApi>(function GRIDcp_message_history(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barPriority, setBarPriority] = useState('');
  const [barType, setBarType] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [barSender, setBarSender] = useState('');
  const [barFrom, setBarFrom] = useState(thirtyAgo());
  const [barTo, setBarTo] = useState(today());
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; priority: string; type: string; status: string; sender: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bp = opts?.bar?.priority ?? barPriority;
    const bt = opts?.bar?.type ?? barType;
    const bs = opts?.bar?.status ?? barStatus;
    const bu = opts?.bar?.sender ?? barSender;
    const bf = opts?.bar?.from ?? barFrom;
    const btt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: btt, priority: bp, targettype: bt, status: bs, sender: bu,
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
  }, [page, filters, sort, barQ, barPriority, barType, barStatus, barSender, barFrom, barTo]);

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

  const openDetail = useCallback((r: MessageRow) => {
    if (r.MSGID == null) return;
    open(<FRMcp_message_history msgid={Number(r.MSGID)} canWrite={canWrite} onRecalled={() => { load({ page }); loadSummary(); }} />);
  }, [open, canWrite, load, loadSummary, page]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarPriority(''); setBarType(''); setBarStatus(''); setBarSender('');
    setBarFrom(thirtyAgo()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: MessageRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.TITLE || '-'}`, icon: 'view', onClick: () => openDetail(r) },
      ],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail }), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh, openDetail }), [refresh, openDetail]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('10050003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Terkirim', value: summary.SENT ?? 0, tint: 1 },
    { label: 'Ditarik', value: summary.RECALLED ?? 0, tint: 2 },
    { label: 'Penerima', value: summary.RECIPIENTS ?? 0, tint: 3 },
    { label: 'Sudah dibaca', value: summary.READTOTAL ?? 0, tint: 4 },
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
        <select value={barPriority} onChange={(e) => setBarPriority(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua prioritas</option>
          {['INFO', 'PENTING', 'DARURAT'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua target</option>
          {['ALL', 'GROUP', 'USER'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua status</option>
          {['TERKIRIM', 'DITARIK'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Pengirim" value={barSender} onChange={(e) => setBarSender(e.target.value)} style={{ width: 120 }} />
        <input className="input" placeholder="Cari judul" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
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
      <DataTable<MessageRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.MSGID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_message_history;
