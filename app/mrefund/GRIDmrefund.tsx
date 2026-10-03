// GRIDmrefund — kartu ringkasan + tabel refund + ajukan + detail/keputusan.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err, summary, canWrite, barF
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMmrefund from './FRMmrefund';
import { formatIDR, formatTanggal } from './Cmrefund';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type RefundRow = {
  REFUNDID?: number;
  REFUNDNO?: string;
  TICKETCODE?: string;
  ATTNAME?: string;
  EVENTTITLE?: string;
  NOMINAL?: number | string;
  STATUS?: string;
  REQUESTTIME?: string;
  REQUESTBY?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
};

function badgeColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'DIAJUKAN': return '';
    case 'DISETUJUI': return 'ok';
    case 'DITOLAK': return 'err';
    case 'SELESAI': return 'ok';
    default: return '';
  }
}

function buildColumns(h: { onDetail: (r: RefundRow) => void }): Column<RefundRow>[] {
  return [
    noColumn,
    { key: 'REFUNDNO', label: 'Nomor', width: 140, sortable: true },
    {
      key: 'TICKETCODE', label: 'Tiket', width: 170, sortable: false,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}>{r.TICKETCODE || '-'}{r.ATTNAME ? ` (${r.ATTNAME})` : ''}</a>,
    },
    { key: 'EVENTTITLE', label: 'Event', width: 170, filter: false },
    {
      key: 'NOMINAL', label: 'Nominal', width: 120, align: 'right', sortable: true,
      render: (r) => formatIDR(r.NOMINAL),
    },
    {
      key: 'STATUS', label: 'Status', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'DIAJUKAN', label: 'DIAJUKAN' }, { value: 'DISETUJUI', label: 'DISETUJUI' },
        { value: 'DITOLAK', label: 'DITOLAK' }, { value: 'SELESAI', label: 'SELESAI' },
      ] as any,
      render: (r) => <span className={`badge ${badgeColor(String(r.STATUS || ''))}`}>{r.STATUS || '-'}</span>,
    },
    { key: 'REQUESTTIME', label: 'Diajukan', width: 150, filter: false, sortable: true, render: (r) => formatTanggal(r.REQUESTTIME) },
    actionsColumn<RefundRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="view"
        title={`Detail ${r.REFUNDNO}`} aria-label={`Detail ${r.REFUNDNO}`}
        onClick={() => h.onDetail(r)}
      />
    ), 48),
  ];
}

// Modal detail: data tiket + alasan + riwayat + keputusan.
function DetailModal({ refundid, canWrite, onChanged }: {
  refundid: number; canWrite: boolean; onChanged: () => void;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(refundid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [refundid]);

  useEffect(() => { load(); }, [load]);

  const act = async (kind: 'approve' | 'reject' | 'finish') => {
    if (kind === 'reject' && !note.trim()) { setNoteErr('Alasan penolakan wajib diisi.'); return; }
    const msg = kind === 'approve'
      ? 'Setujui refund ini? Tiket dibatalkan dan kuota kembali.'
      : kind === 'reject' ? 'Tolak refund ini?' : 'Tandai refund ini SELESAI (dana sudah dikembalikan di luar aplikasi)?';
    if (!await confirmDialog({ message: msg, okText: 'Ya', danger: kind !== 'finish' })) return;
    setBusy(true);
    try {
      const fn = kind === 'approve' ? proxy.process_approve : kind === 'reject' ? proxy.process_reject : proxy.process_finish;
      const res: any = await fn({ REFUNDID: refundid, NOTE: note.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Berhasil.', 'ok');
        onChanged();
        close();
      } else toast('Error', res?.message || 'Gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const st = String(detail?.STATUS || '').toUpperCase();
  const canDecide = canWrite && st === 'DIAJUKAN';
  const canFinish = canWrite && st === 'DISETUJUI';

  return (
    <Window
      title={`Refund ${detail?.REFUNDNO || ''}`}
      icon="refresh"
      width="560px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
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
      ) : detail ? (
        <>
          <FrmSet legend="Refund" icon="form" columns={2}>
            <FrmRow label="Nomor"><span><b>{detail.REFUNDNO}</b></span></FrmRow>
            <FrmRow label="Status">
              <span className={`badge ${badgeColor(st)}`}>{st}</span>
            </FrmRow>
            <FrmRow label="Tiket"><span>{detail.TICKETCODE} ({detail.ATTNAME || '-'})</span></FrmRow>
            <FrmRow label="Event"><span>{detail.EVENTTITLE || '-'}</span></FrmRow>
            <FrmRow label="Nominal"><span><b>{formatIDR(detail.NOMINAL)}</b></span></FrmRow>
            <FrmRow label="Alasan"><span>{detail.REASON || '-'}</span></FrmRow>
            <FrmRow label="Diajukan"><span>{formatTanggal(detail.REQUESTTIME)} oleh {detail.REQUESTBY || '-'}</span></FrmRow>
            {(detail.DECISIONBY || detail.DECISIONNOTE) && (
              <FrmRow label="Keputusan">
                <span>{formatTanggal(detail.DECISIONTIME)} oleh {detail.DECISIONBY || '-'} — {detail.DECISIONNOTE || '-'}</span>
              </FrmRow>
            )}
            {st === 'SELESAI' && (
              <FrmRow label="Selesai"><span>{formatTanggal(detail.DONETIME)} oleh {detail.DONEBY || '-'}</span></FrmRow>
            )}
          </FrmSet>
          {(canDecide || canFinish) && (
            <FrmSet legend="Keputusan" icon="check" columns={1}>
              {(canDecide) && (
                <FrmRow label="Catatan">
                  <div>
                    <input className="input" placeholder="Catatan/alasan (wajib untuk penolakan)" value={note} onChange={(e) => { setNote(e.target.value); setNoteErr(''); }} maxLength={200} />
                    {noteErr && <span className="field-err">{noteErr}</span>}
                  </div>
                </FrmRow>
              )}
              <div className="toolbar">
                {canDecide && (
                  <>
                    <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => act('approve')}>Setujui</Btn>
                    <Btn className="danger btn-sm" icon="close" disabled={busy} onClick={() => act('reject')}>Tolak</Btn>
                  </>
                )}
                {canFinish && (
                  <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => act('finish')}>Tandai Selesai</Btn>
                )}
              </div>
              {st === 'DISETUJUI' && (
                <p className="loading-hint">SELESAI hanya penanda dana dikembalikan di luar aplikasi (titik sambung Finance).</p>
              )}
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}

const GRIDmrefund = forwardRef<GridApi>(function GRIDmrefund(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bs = opts?.bar?.status ?? barStatus;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined, status: bs,
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
  }, [page, filters, sort, barQ, barStatus]);

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

  const openDetail = useCallback((r: RefundRow) => {
    if (r.REFUNDID == null) return;
    open(<DetailModal refundid={Number(r.REFUNDID)} canWrite={canWrite} onChanged={() => { load({ page }); loadSummary(); }} />);
  }, [open, canWrite, load, loadSummary, page]);

  const create = useCallback(() => {
    open(<FRMmrefund onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: RefundRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.REFUNDNO}`, icon: 'view', onClick: () => openDetail(r) },
      ],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail }), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh, create }), [refresh, create]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('40010003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Diajukan', value: summary.PENGAJUAN ?? 0 },
    { label: 'Disetujui', value: summary.SETUJU ?? 0 },
    { label: 'Ditolak', value: summary.TOLAK ?? 0 },
    { label: 'Selesai', value: summary.SELESAI ?? 0 },
    { label: 'Nominal menunggu', value: formatIDR(summary.TUNGGU ?? 0) },
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
        <input className="input" placeholder="Cari nomor/kode/nama" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'SELESAI'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
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
      <DataTable<RefundRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.REFUNDID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmrefund;
