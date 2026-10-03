// GRIDmbalance — kartu total + tabel penjual + mutasi + rekonsiliasi.
// Read-only: tanpa tambah/ubah/koreksi saldo.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, summary
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import type { CtxItem } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { ENTRY_LABEL, downloadBalCSV, formatBalRp, formatBalTgl } from './Cmbalance';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type SellerRow = {
  SELLERID?: number;
  SELLERCODE?: string;
  SHOPNAME?: string;
  OWNERNAME?: string;
  PENDING?: number | string;
  AVAILABLE?: number | string;
  INFLIGHT?: number | string;
  WITHDRAWN?: number | string;
};

export type GridApi = {
  refresh: () => void;
};

function buildColumns(h: {
  onDetail: (r: SellerRow) => void;
}): Column<SellerRow>[] {
  const money = (v: unknown) => formatBalRp(v);
  return [
    noColumn,
    {
      key: 'SHOPNAME', label: 'Toko', width: 200, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b>{r.SHOPNAME || '-'}</b></a>,
    },
    { key: 'SELLERCODE', label: 'Kode', width: 100, sortable: true },
    {
      key: 'PENDING', label: 'Tertahan', width: 130, align: 'right', filter: false,
      render: (r) => money(r.PENDING),
    },
    {
      key: 'AVAILABLE', label: 'Tersedia', width: 130, align: 'right', filter: false,
      render: (r) => {
        const v = Number(r.AVAILABLE) || 0;
        return v < 0
          ? <span className="badge err">{money(v)} (minus)</span>
          : <span>{money(v)}</span>;
      },
    },
    {
      key: 'INFLIGHT', label: 'Ditarik proses', width: 130, align: 'right', filter: false,
      render: (r) => money(r.INFLIGHT),
    },
    {
      key: 'WITHDRAWN', label: 'Sudah ditarik', width: 130, align: 'right', filter: false,
      render: (r) => money(r.WITHDRAWN),
    },
    actionsColumn<SellerRow>((r) => (
      <Btn className="btn-sm" iconOnly icon="view" title={`Mutasi ${r.SHOPNAME}`} aria-label={`Mutasi ${r.SHOPNAME}`} onClick={() => h.onDetail(r)} />
    ), 48),
  ];
}

// Modal detail: kartu saldo + tabel mutasi + export + rekonsiliasi.
function DetailModal({ seller, onChanged }: {
  seller: SellerRow; onChanged: () => void;
}) {
  const { close } = useModal();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barType, setBarType] = useState('');
  const [balance, setBalance] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);
  const [recon, setRecon] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const sid = Number(seller.SELLERID);

  const load = useCallback(async (p: number, type: string) => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_ledger(sid, { limit: PAGE_SIZE, offset: p * PAGE_SIZE, entrytype: type });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setBalance(res.Balance || {});
        setPage(p);
      } else setErr(res?.message || 'Gagal memuat mutasi.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat mutasi.');
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => { load(0, ''); }, [load]);

  const applyBar = useCallback(() => { load(0, barType); }, [load, barType]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export(sid, barType);
      if (parseBoolean(res?.success) && res.csv_base64) {
        downloadBalCSV(res.csv_base64, res.filename || 'ledger.csv');
        toast('Success', `Export ${res.total ?? ''} baris.${res.truncated ? ' (dipotong 10000)' : ''}`, 'ok');
        onChanged();
      } else toast('Error', res?.message || 'Export gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [sid, barType, onChanged]);

  const doReconcile = useCallback(async () => {
    setReconLoading(true);
    try {
      const res: any = await proxy.read_reconcile(sid);
      if (parseBoolean(res?.success)) setRecon((res.Rows || [])[0] || null);
      else toast('Error', res?.message || 'Rekonsiliasi gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setReconLoading(false);
    }
  }, [sid]);

  return (
    <Window
      title={`Saldo ${seller.SHOPNAME || ''}`}
      icon="form"
      width="720px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      <FrmSet legend="Saldo" icon="form" columns={2}>
        <FrmRow label="Tertahan"><span><b>{formatBalRp(balance.PENDING ?? seller.PENDING)}</b></span></FrmRow>
        <FrmRow label="Tersedia">
          <span><b>{formatBalRp(balance.AVAILABLE ?? seller.AVAILABLE)}</b>
            {(Number(balance.AVAILABLE ?? seller.AVAILABLE) || 0) < 0 ? ' (minus — pengembalian melebihi saldo)' : ''}
          </span>
        </FrmRow>
        <FrmRow label="Ditarik proses"><span>{formatBalRp(balance.INFLIGHT ?? seller.INFLIGHT)}</span></FrmRow>
        <FrmRow label="Sudah ditarik"><span>{formatBalRp(balance.WITHDRAWN ?? seller.WITHDRAWN)}</span></FrmRow>
      </FrmSet>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 170 }}>
          <option value="">Semua jenis</option>
          {Object.entries(ENTRY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <span className="spacer" />
        <Btn className="btn-sm" icon="check" disabled={reconLoading} onClick={doReconcile}>
          {reconLoading ? 'Memeriksa…' : 'Rekonsiliasi'}
        </Btn>
        <Btn className="btn-sm" icon="report" disabled={exporting} onClick={doExport}>
          {exporting ? 'Mengekspor…' : 'Export CSV'}
        </Btn>
      </div>
      {recon && (
        <div className={recon.DIFF === 0 ? 'toast-ok alert-inline' : 'toast-err alert-inline'}>
          <Icon name={recon.DIFF === 0 ? 'check' : 'alertCircle'} size={17} />
          <span>
            {recon.DIFF === 0
              ? 'Sehat: buku besar cocok dengan status pembayaran/pesanan/refund.'
              : `Selisih: ${(recon.VIOLATIONS || []).join(' | ')}`}
          </span>
        </div>
      )}
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load(0, barType)}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<any>
        columns={[
          noColumn,
          { key: 'LEDGERTIME', label: 'Waktu', width: 150, filter: false, render: (r) => formatBalTgl(r.LEDGERTIME) },
          {
            key: 'ENTRYTYPE', label: 'Jenis', width: 130, filter: false,
            render: (r) => ENTRY_LABEL[String(r.ENTRYTYPE)] || r.ENTRYTYPE,
          },
          { key: 'BUCKET', label: 'Bucket', width: 90, filter: false },
          { key: 'AMOUNT', label: 'Jumlah', width: 120, align: 'right', filter: false, render: (r) => formatBalRp(r.AMOUNT) },
          {
            key: 'REFID', label: 'Referensi', width: 130, filter: false,
            render: (r) => `${r.REFTYPE || ''} #${r.REFID ?? ''}`,
          },
          { key: 'NOTE', label: 'Keterangan', width: 200, filter: false },
        ]}
        rows={rows}
        filters={{}}
        onFilter={() => {}}
        loading={loading}
        rowKey={(r) => String(r.LEDGERID ?? '')}
        startRow={page * PAGE_SIZE}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load(p, barType)} />
    </Window>
  );
}

// Modal rekonsiliasi semua penjual.
function ReconcileAllModal() {
  const { close } = useModal();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_reconcile(0);
      if (parseBoolean(res?.success)) setRows(res.Rows || []);
      else setErr(res?.message || 'Gagal memeriksa.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memeriksa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bad = rows.filter((r) => (r.DIFF || 0) !== 0);

  return (
    <Window
      title="Rekonsiliasi Semua Penjual"
      icon="check"
      width="640px"
      footer={<><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Tutup</Btn></>}
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load()}>Coba lagi</Btn>
        </div>
      ) : (
        <>
          <div className={bad.length === 0 ? 'toast-ok alert-inline' : 'toast-err alert-inline'}>
            <Icon name={bad.length === 0 ? 'check' : 'alertCircle'} size={17} />
            <span>
              {bad.length === 0
                ? `Sehat: ${rows.length} penjual, selisih nol semua.`
                : `${bad.length} penjual berselisih (lihat rincian).`}
            </span>
          </div>
          {bad.map((r: any) => (
            <div key={r.SELLERID} className="loading-hint">
              {r.SHOPNAME}: {(r.VIOLATIONS || []).join(' | ')}
            </div>
          ))}
        </>
      )}
    </Window>
  );
}

const GRIDmbalance = forwardRef<GridApi>(function GRIDmbalance(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
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
  }, [page, filters, sort, barQ]);

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

  const reload = useCallback(() => {
    load({ page });
    loadSummary();
  }, [load, loadSummary, page]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openDetail = useCallback((r: SellerRow) => {
    if (r.SELLERID == null) return;
    open(<DetailModal seller={r} onChanged={reload} />);
  }, [open, reload]);

  const reconcileAll = useCallback(() => {
    open(<ReconcileAllModal />);
  }, [open]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: SellerRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Mutasi ${r.SHOPNAME}`, icon: 'view', onClick: () => openDetail(r) },
      ] as CtxItem[],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail }), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('70030002');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Tertahan semua', value: formatBalRp(summary.PENDING ?? 0) },
    { label: 'Tersedia semua', value: formatBalRp(summary.AVAILABLE ?? 0) },
    { label: 'Sudah ditarik', value: formatBalRp(summary.WITHDRAWN ?? 0) },
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
        <input className="input" placeholder="Cari toko/kode" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <span className="spacer" />
        <Btn className="btn-sm" icon="check" onClick={reconcileAll}>Rekonsiliasi</Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<SellerRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.SELLERID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmbalance;
