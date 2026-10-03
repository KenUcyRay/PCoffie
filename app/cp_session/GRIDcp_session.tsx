// GRIDcp_session — kartu ringkasan + tabel sesi + aksi Cabut.
// Baris sesi milik sendiri ditandai "Sesi Anda" dan tidak bisa dicabut.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
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
import { formatTanggal } from './Ccp_session';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type SessionRow = {
  SESSIONID?: string;
  USERID?: number;
  USERLOGIN?: string;
  LOGINTIME?: string;
  LASTACTIVE?: string;
  EXPIRESAT?: string;
  USERIP?: string;
  DEVICE?: string;
  BROWSER?: string;
  STATUS?: string;
  ISSELF?: string;
};

export type GridApi = {
  refresh: () => void;
  revoke: (r: SessionRow) => void;
};

function badgeColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'AKTIF': return 'ok';
    case 'LOGOUT': return '';
    case 'DICABUT': return 'err';
    case 'KEDALUWARSA': return 'err';
    default: return '';
  }
}

function buildColumns(h: { onRevoke: (r: SessionRow) => void; canWrite: boolean }): Column<SessionRow>[] {
  return [
    noColumn,
    {
      key: 'USERLOGIN', label: 'User', width: 130, sortable: true,
      render: (r) => (
        <span>
          {r.USERLOGIN || '-'}
          {String(r.ISSELF || '').toUpperCase() === 'YES' && <span className="badge ok">Sesi Anda</span>}
        </span>
      ),
    },
    { key: 'LOGINTIME', label: 'Login', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.LOGINTIME) },
    { key: 'LASTACTIVE', label: 'Aktivitas Terakhir', width: 160, filter: false, sortable: true, render: (r) => formatTanggal(r.LASTACTIVE) },
    { key: 'USERIP', label: 'IP', width: 120 },
    {
      key: 'DEVICE', label: 'Perangkat', width: 150,
      render: (r) => [r.DEVICE, r.BROWSER].filter(Boolean).join(' / ') || '-',
    },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'AKTIF', label: 'AKTIF' }, { value: 'LOGOUT', label: 'LOGOUT' },
        { value: 'DICABUT', label: 'DICABUT' }, { value: 'KEDALUWARSA', label: 'KEDALUWARSA' },
      ] as any,
      render: (r) => {
        const k = badgeColor(String(r.STATUS || ''));
        return <span className={`badge ${k}`}>{r.STATUS || '-'}</span>;
      },
    },
    ...(h.canWrite ? [actionsColumn<SessionRow>((r) => {
      const self = String(r.ISSELF || '').toUpperCase() === 'YES';
      const active = String(r.STATUS || '').toUpperCase() === 'AKTIF';
      return (
        <Btn
          className="btn-sm" iconOnly icon="close"
          title={self ? 'Sesi Anda sendiri (pakai logout biasa)' : `Cabut sesi ${r.USERLOGIN || ''}`}
          aria-label={self ? 'Sesi Anda sendiri' : `Cabut sesi ${r.USERLOGIN || ''}`}
          disabled={self || !active}
          onClick={() => h.onRevoke(r)}
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

const GRIDcp_session = forwardRef<GridApi>(function GRIDcp_session(_props, ref) {
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barUser, setBarUser] = useState('');
  const [barStatus, setBarStatus] = useState('AKTIF');
  const [barIp, setBarIp] = useState('');
  const [barFrom, setBarFrom] = useState(sevenAgo());
  const [barTo, setBarTo] = useState(today());
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; user: string; status: string; ip: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bu = opts?.bar?.user ?? barUser;
    const bs = opts?.bar?.status ?? barStatus;
    const bi = opts?.bar?.ip ?? barIp;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        date_from: bf, date_to: bt, user: bu, status: bs, ip: bi,
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
  }, [page, filters, sort, barQ, barUser, barStatus, barIp, barFrom, barTo]);

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

  const revoke = useCallback(async (r: SessionRow) => {
    if (!await confirmDialog({ message: `Cabut sesi ${r.USERLOGIN || '-'}? User diminta login ulang pada request berikutnya.`, okText: 'Ya, Cabut', danger: true })) return;
    try {
      const res: any = await proxy.process_revoke({ SESSIONID: r.SESSIONID });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Sesi berhasil dicabut.', 'ok');
        load({ page });
        loadSummary();
      } else toast('Error', res?.message || 'Gagal mencabut sesi.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, loadSummary, page]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarUser(''); setBarStatus('AKTIF'); setBarIp('');
    setBarFrom(sevenAgo()); setBarTo(today());
    setFilters({});
    load({ page: 0, filters: {}, sort: null, bar: { status: 'AKTIF' } });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: SessionRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Filter user ${r.USERLOGIN || '-'}`, icon: 'search', onClick: () => { setBarUser(String(r.USERLOGIN || '')); load({ page: 0, bar: { user: String(r.USERLOGIN || '') } }); } },
      ],
    });
  }, [load]);

  const columns = useMemo(() => buildColumns({ onRevoke: revoke, canWrite }), [revoke, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, revoke }), [refresh, revoke]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('10030003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Sesi aktif', value: summary.ACTIVE ?? 0, tint: 1 },
    { label: 'User aktif', value: summary.USERS ?? 0, tint: 2 },
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
        <input className="input" placeholder="User" value={barUser} onChange={(e) => setBarUser(e.target.value)} style={{ width: 120 }} />
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['AKTIF', 'LOGOUT', 'DICABUT', 'KEDALUWARSA'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="IP" value={barIp} onChange={(e) => setBarIp(e.target.value)} style={{ width: 120 }} />
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
      <DataTable<SessionRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.SESSIONID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_session;
