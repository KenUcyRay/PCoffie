// GRIDmnewsdata — kartu ringkasan + tabel berita + aksi status.
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
import FRMmnewsdata from './FRMmnewsdata';
import { formatTanggal } from './Cmnewsdata';
import * as proxy from './api';
import { imageUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type NewsRow = {
  NEWSID?: number;
  TITLE?: string;
  SLUG?: string;
  MAINIMAGE?: string;
  NEWSCATCODE?: string;
  CATNAME?: string;
  STATUS?: string;
  PUBLISHEDAT?: string;
  SCHEDULEDAT?: string;
  AUTHORLOGIN?: string;
  VIEWCOUNT?: number | string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: NewsRow) => void;
  remove: (r: NewsRow) => void;
};

function badgeColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'TERBIT': return 'ok';
    case 'DRAFT': return '';
    case 'TERJADWAL': return '';
    case 'DIARSIPKAN': return 'off';
    default: return '';
  }
}

function buildColumns(h: {
  onEdit: (r: NewsRow) => void;
  onPublish: (r: NewsRow) => void;
  onRetract: (r: NewsRow) => void;
  onArchive: (r: NewsRow) => void;
  onRestore: (r: NewsRow) => void;
  onRemove: (r: NewsRow) => void;
  canWrite: boolean;
}): Column<NewsRow>[] {
  return [
    noColumn,
    {
      key: 'MAINIMAGE', label: 'Gambar', width: 64, filter: false,
      render: (r) => {
        const src = imageUrl(r.MAINIMAGE);
        return src
          ? <img src={src} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          : <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center' }}><Icon name="form" size={18} /></span>;
      },
    },
    { key: 'TITLE', label: 'Judul', width: 220, sortable: true },
    { key: 'CATNAME', label: 'Kategori', width: 120, sortable: false },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'DRAFT', label: 'DRAFT' }, { value: 'TERJADWAL', label: 'TERJADWAL' },
        { value: 'TERBIT', label: 'TERBIT' }, { value: 'DIARSIPKAN', label: 'DIARSIPKAN' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${badgeColor(s)}`}>{s || '-'}</span>;
      },
    },
    {
      key: 'PUBLISHEDAT', label: 'Terbit/Jadwal', width: 160, filter: false, sortable: true,
      render: (r) => formatTanggal(r.PUBLISHEDAT || r.SCHEDULEDAT),
    },
    { key: 'AUTHORLOGIN', label: 'Penulis', width: 110 },
    { key: 'VIEWCOUNT', label: 'Dibaca', width: 80, align: 'right', filter: false, sortable: true },
    ...(h.canWrite ? [actionsColumn<NewsRow>((r) => {
      const st = String(r.STATUS || '').toUpperCase();
      return (
        <>
          {(st === 'DRAFT' || st === 'TERBIT') && (
            <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah ${r.TITLE}`} aria-label={`Ubah ${r.TITLE}`} onClick={() => h.onEdit(r)} />
          )}
          {st === 'DRAFT' && (
            <Btn className="btn-sm" iconOnly icon="check" title={`Terbitkan ${r.TITLE}`} aria-label={`Terbitkan ${r.TITLE}`} onClick={() => h.onPublish(r)} />
          )}
          {st === 'TERBIT' && (
            <>
              <Btn className="btn-sm" iconOnly icon="arrowL" title={`Tarik ke draft ${r.TITLE}`} aria-label={`Tarik ke draft ${r.TITLE}`} onClick={() => h.onRetract(r)} />
              <Btn className="btn-sm" iconOnly icon="box" title={`Arsipkan ${r.TITLE}`} aria-label={`Arsipkan ${r.TITLE}`} onClick={() => h.onArchive(r)} />
            </>
          )}
          {st === 'DIARSIPKAN' && (
            <Btn className="btn-sm" iconOnly icon="arrowL" title={`Kembalikan ${r.TITLE}`} aria-label={`Kembalikan ${r.TITLE}`} onClick={() => h.onRestore(r)} />
          )}
          {st === 'DRAFT' && (
            <Btn className="danger btn-sm" iconOnly icon="del" title={`Hapus ${r.TITLE}`} aria-label={`Hapus ${r.TITLE}`} onClick={() => h.onRemove(r)} />
          )}
        </>
      );
    }, 190)] : []),
  ];
}

const GRIDmnewsdata = forwardRef<GridApi>(function GRIDmnewsdata(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [barCat, setBarCat] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string; cat: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bs = opts?.bar?.status ?? barStatus;
    const bc = opts?.bar?.cat ?? barCat;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined, status: bs, catcode: bc,
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
  }, [page, filters, sort, barQ, barStatus, barCat]);

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

  const reload = useCallback(() => {
    load({ page });
    loadSummary();
  }, [load, loadSummary, page]);

  const openNews = useCallback((r: NewsRow) => {
    if (r.NEWSID == null) return;
    open(<FRMmnewsdata isNew={false} newsId={Number(r.NEWSID)} onSaved={reload} />);
  }, [open, reload]);

  const create = useCallback(() => {
    open(<FRMmnewsdata isNew onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const act = useCallback(async (
    r: NewsRow, fn: (v: unknown) => Promise<any>, question: string, okText?: string,
  ) => {
    if (!await confirmDialog(okText ? { message: question, okText } : { message: question })) return;
    try {
      const res: any = await fn({ NEWSID: r.NEWSID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [reload]);

  const publish = useCallback((r: NewsRow) => act(r, proxy.process_publish, `Terbitkan "${r.TITLE}"?`), [act]);
  const retract = useCallback((r: NewsRow) => act(r, proxy.process_retract, `Tarik "${r.TITLE}" ke draft?`), [act]);
  const archive = useCallback((r: NewsRow) => act(r, proxy.process_archive, `Arsipkan "${r.TITLE}"?`), [act]);
  const restore = useCallback((r: NewsRow) => act(r, proxy.process_restore, `Kembalikan "${r.TITLE}" ke draft?`), [act]);
  const remove = useCallback((r: NewsRow) => act(r, proxy.process_delete, `Hapus "${r.TITLE}"?`, 'Ya, Hapus'), [act]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus(''); setBarCat('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: NewsRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.TITLE}`, icon: 'edit', onClick: () => openNews(r) },
      ],
    });
  }, [openNews]);

  const columns = useMemo(() => buildColumns({
    onEdit: openNews, onPublish: publish, onRetract: retract,
    onArchive: archive, onRestore: restore, onRemove: remove, canWrite,
  }), [openNews, publish, retract, archive, restore, remove, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create, edit: openNews, remove }), [refresh, create, openNews, remove]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('60020002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Draft', value: summary.DRAFT ?? 0 },
    { label: 'Terjadwal', value: summary.TERJADWAL ?? 0 },
    { label: 'Terbit', value: summary.TERBIT ?? 0 },
    { label: 'Diarsipkan', value: summary.DIARSIPKAN ?? 0 },
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
        <input className="input" placeholder="Cari judul" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['DRAFT', 'TERJADWAL', 'TERBIT', 'DIARSIPKAN'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Kode kategori" value={barCat} onChange={(e) => setBarCat(e.target.value)} style={{ width: 120 }} />
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
      <DataTable<NewsRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.NEWSID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmnewsdata;
