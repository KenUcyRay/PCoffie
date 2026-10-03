// GRIDmpayout — 2 tab: Siap Dicairkan + Riwayat Payout.
// Tab Siap Dicairkan: event ENDED + kelayakan; tombol Ajukan aktif bila layak.
// Tab Riwayat: tabel + aksi status + peringatan pasca-payout.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
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
import FRMpayout from './FRMpayout';
import { PO_STATUS_LABEL, downloadPoCSV, formatPoRp, formatPoTgl } from './Cmpayout';
import * as proxy from './api';
import { proofUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type ReadyRow = {
  EVENTID?: number;
  EVENTCODE?: string;
  TITLE?: string;
  ORGNAME?: string;
  ENDAT?: string;
  COUNT?: number;
  NET?: number | string;
  ELIGIBLE?: string;
  REASONS?: string[];
  ACCOUNTS?: number;
};

export type PayoutRow = {
  PAYOUTID?: number;
  PONO?: string;
  EVENTTITLE?: string;
  ORGNAME?: string;
  ACCTMASKED?: string;
  NETAMOUNT?: number | string;
  STATUS?: string;
  REQUESTAT?: string;
};

export type GridApi = {
  refresh: () => void;
};

function statusColor(s: string): string {
  switch (String(s || '').toUpperCase()) {
    case 'BERHASIL': return 'ok';
    case 'GAGAL': case 'DITOLAK': return 'err';
    case 'DIPROSES': return 'off';
    default: return '';
  }
}

// Kolom tabel "Siap Dicairkan".
function readyColumns(h: { onApply: (r: ReadyRow) => void; onPreview: (r: ReadyRow) => void; canWrite: boolean }): Column<ReadyRow>[] {
  return [
    noColumn,
    { key: 'EVENTCODE', label: 'Kode', width: 130, filter: false },
    { key: 'TITLE', label: 'Judul', width: 200 },
    { key: 'ORGNAME', label: 'Penyelenggara', width: 150 },
    { key: 'ENDAT', label: 'Selesai', width: 110, filter: false, render: (r) => formatPoTgl(r.ENDAT).slice(0, 10) },
    { key: 'COUNT', label: 'Tiket', width: 70, align: 'right', filter: false },
    { key: 'NET', label: 'Estimasi bersih', width: 140, align: 'right', filter: false, render: (r) => formatPoRp(r.NET) },
    {
      key: 'ELIGIBLE', label: 'Kelayakan', width: 160, filter: false,
      render: (r) => (
        r.ELIGIBLE === 'YES'
          ? <span className="badge ok">Siap dicairkan</span>
          : <span className="badge off">{(r.REASONS || []).join('; ') || 'Tidak layak'}</span>
      ),
    },
    ...(h.canWrite ? [actionsColumn<ReadyRow>((r) => (
      <>
        <Btn className="btn-sm" iconOnly icon="view" title={`Rincian ${r.EVENTCODE}`} aria-label="Rincian" onClick={() => h.onPreview(r)} />
        {r.ELIGIBLE === 'YES' && (
          <Btn className="primary btn-sm" icon="check" onClick={() => h.onApply(r)}>Ajukan</Btn>
        )}
      </>
    ), 130)] : []),
  ];
}

// Kolom tabel "Riwayat Payout".
function historyColumns(h: { onDetail: (r: PayoutRow) => void; canWrite: boolean }): Column<PayoutRow>[] {
  return [
    noColumn,
    {
      key: 'PONO', label: 'Nomor', width: 150, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b style={{ fontFamily: 'monospace' }}>{r.PONO || '-'}</b></a>,
    },
    { key: 'EVENTTITLE', label: 'Event', width: 180 },
    { key: 'ORGNAME', label: 'Penyelenggara', width: 150 },
    { key: 'NETAMOUNT', label: 'Bersih', width: 130, align: 'right', filter: false, sortable: true, render: (r) => formatPoRp(r.NETAMOUNT) },
    { key: 'ACCTMASKED', label: 'Rekening', width: 160, filter: false },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'DIAJUKAN', label: 'Diajukan' }, { value: 'DIPROSES', label: 'Diproses' },
        { value: 'BERHASIL', label: 'Berhasil' }, { value: 'GAGAL', label: 'Gagal' },
        { value: 'DITOLAK', label: 'Ditolak' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${statusColor(s)}`}>{PO_STATUS_LABEL[s] || s || '-'}</span>;
      },
    },
    { key: 'REQUESTAT', label: 'Diajukan', width: 150, filter: false, sortable: true, render: (r) => formatPoTgl(r.REQUESTAT) },
    ...(h.canWrite ? [actionsColumn<PayoutRow>((r) => (
      <Btn className="btn-sm" iconOnly icon="view" title={`Detail ${r.PONO}`} aria-label={`Detail ${r.PONO}`} onClick={() => h.onDetail(r)} />
    ), 48)] : []),
  ];
}

// Modal detail: rincian + aksi + peringatan pasca-payout.
function DetailModal({ payoutid, canWrite, onChanged }: {
  payoutid: number; canWrite: boolean; onChanged: () => void;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [tref, setTref] = useState('');
  const [tdate, setTdate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(payoutid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [payoutid]);

  useEffect(() => { load(); }, [load]);

  const act = async (kind: 'process' | 'settle' | 'fail' | 'reject') => {
    if ((kind === 'fail' || kind === 'reject') && !reason.trim()) {
      setReasonErr('Alasan wajib diisi.');
      return;
    }
    if (kind === 'settle' && (!tref.trim() || !tdate.trim())) {
      toast('Error', 'Nomor referensi dan tanggal transfer wajib diisi.', 'err');
      return;
    }
    const question = kind === 'process' ? 'Proses payout ini (transfer manual dimulai)?'
      : kind === 'settle' ? 'Selesaikan payout ini (BERHASIL)?'
      : kind === 'reject' ? 'Tolak payout ini?'
      : 'Tandai payout ini GAGAL?';
    if (!await confirmDialog(kind === 'reject' || kind === 'fail'
      ? { message: question, okText: 'Ya', danger: true }
      : { message: question, okText: 'Ya' })) return;
    setBusy(true);
    try {
      const fn = kind === 'process' ? proxy.process : kind === 'settle' ? proxy.settle : proxy.fail;
      const payload: any = { PAYOUTID: payoutid };
      if (kind === 'settle') { payload.TRANSFERREF = tref.trim(); payload.TRANSFERDATE = tdate.trim(); }
      if (kind === 'fail' || kind === 'reject') {
        payload.STATUS = kind === 'reject' ? 'DITOLAK' : 'GAGAL';
        payload.REASON = reason.trim();
      }
      const res: any = await fn(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message, 'ok');
        onChanged();
        load();
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res: any = await proxy.upload_proof(payoutid, file);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Bukti diupload.', 'ok');
        setFile(null);
        onChanged();
        load();
      } else toast('Error', res?.message || 'Upload gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setUploading(false);
    }
  };

  const st = String(detail?.STATUS || '').toUpperCase();
  const proof = proofUrl(detail?.PROOFIMAGE);
  const postRefunds = Array.isArray(detail?.POST_REFUNDS) ? detail.POST_REFUNDS : [];

  return (
    <Window
      title={`Payout ${detail?.PONO || ''}`}
      icon="form"
      width="640px"
      footer={<><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Tutup</Btn></>}
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load()}>Coba lagi</Btn>
        </div>
      ) : detail ? (
        <>
          <FrmSet legend="Payout" icon="form" columns={2}>
            <FrmRow label="Nomor"><span><b style={{ fontFamily: 'monospace' }}>{detail.PONO}</b></span></FrmRow>
            <FrmRow label="Status"><span className={`badge ${statusColor(st)}`}>{PO_STATUS_LABEL[st] || st}</span></FrmRow>
            <FrmRow label="Event"><span>{detail.EVENTTITLE} ({detail.EVENTCODE || '-'})</span></FrmRow>
            <FrmRow label="Penyelenggara"><span>{detail.ORGNAME}</span></FrmRow>
            <FrmRow label="Tiket"><span>{detail.TICKETCOUNT}</span></FrmRow>
            <FrmRow label="Kotor"><span>{formatPoRp(detail.GROSS)}</span></FrmRow>
            <FrmRow label="Diskon"><span>{formatPoRp(detail.DISCOUNT)}</span></FrmRow>
            <FrmRow label="Biaya platform"><span>{formatPoRp(detail.PLATFORMFEE)}</span></FrmRow>
            <FrmRow label="Refund"><span>{formatPoRp(detail.REFUND)}</span></FrmRow>
            <FrmRow label="Bersih"><span><b>{formatPoRp(detail.NETAMOUNT)}</b></span></FrmRow>
            <FrmRow label="Rekening"><span style={{ fontFamily: 'monospace' }}>{detail.ACCTMASKED}</span></FrmRow>
            <FrmRow label="Diajukan"><span>{formatPoTgl(detail.REQUESTAT)} ({detail.REQUESTBY || '-'})</span></FrmRow>
            {detail.DONEAT && (
              <FrmRow label="Selesai"><span>{formatPoTgl(detail.DONEAT)} ({detail.DONEBY || '-'})</span></FrmRow>
            )}
            {detail.TRANSFERREF && (
              <FrmRow label="Referensi"><span style={{ fontFamily: 'monospace' }}>{detail.TRANSFERREF}</span></FrmRow>
            )}
            {detail.REASON && (
              <FrmRow label="Alasan"><span>{detail.REASON}</span></FrmRow>
            )}
            {proof && (
              <FrmRow label="Bukti"><a href={proof} target="_blank" rel="noreferrer">Lihat bukti</a></FrmRow>
            )}
          </FrmSet>
          {postRefunds.length > 0 && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>
                Penyesuaian setelah payout: {postRefunds.map((f: any) => `${formatPoRp(f.AMOUNT)} (${formatPoTgl(f.REFUNDTIME)})`).join('; ')} — tidak mengubah payout ini.
              </span>
            </div>
          )}
          {canWrite && (st === 'DIAJUKAN' || st === 'DIPROSES') && (
            <FrmSet legend="Aksi" icon="check" columns={1}>
              {st === 'DIAJUKAN' && (
                <div className="toolbar">
                  <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => act('process')}>Proses</Btn>
                </div>
              )}
              {st === 'DIPROSES' && (
                <>
                  <FrmRow label="No. referensi">
                    <input className="input" style={{ fontFamily: 'monospace' }} placeholder="wajib untuk selesai" value={tref} onChange={(e) => setTref(e.target.value)} maxLength={100} />
                  </FrmRow>
                  <FrmRow label="Tgl transfer">
                    <input className="input" type="date" value={tdate} onChange={(e) => setTdate(e.target.value)} />
                  </FrmRow>
                  <FrmRow label="Bukti">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                      <Btn className="btn-sm" icon="check" disabled={!file || uploading} onClick={upload}>
                        {uploading ? 'Mengupload…' : 'Upload'}
                      </Btn>
                    </div>
                  </FrmRow>
                  <div className="toolbar">
                    <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => act('settle')}>Selesaikan</Btn>
                  </div>
                </>
              )}
              <FrmRow label="Alasan">
                <div>
                  <input className="input" placeholder="wajib untuk tolak/gagal" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} maxLength={200} />
                  {reasonErr && <span className="field-err">{reasonErr}</span>}
                </div>
              </FrmRow>
              <div className="toolbar">
                <Btn className="danger btn-sm" icon="close" disabled={busy} onClick={() => act('reject')}>Tolak</Btn>
                <Btn className="danger btn-sm" icon="del" disabled={busy} onClick={() => act('fail')}>Gagalkan</Btn>
              </div>
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}

const GRIDmpayout = forwardRef<GridApi>(function GRIDmpayout(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [tab, setTab] = useState<'siap' | 'riwayat'>('siap');
  // Siap Dicairkan
  const [ready, setReady] = useState<ReadyRow[]>([]);
  const [readyQ, setReadyQ] = useState('');
  const [readyLoading, setReadyLoading] = useState(false);
  const [readyErr, setReadyErr] = useState('');
  // Riwayat
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [canWrite, setCanWrite] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadReady = useCallback(async (q?: string) => {
    setReadyLoading(true);
    setReadyErr('');
    try {
      const res: any = await proxy.read_ready(q ?? readyQ);
      if (parseBoolean(res?.success)) setReady(res.Rows || []);
      else setReadyErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setReadyErr(e.message || 'Gagal memuat data.');
    } finally {
      setReadyLoading(false);
    }
  }, [readyQ]);

  const loadHistory = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string }> }) => {
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

  const refresh = useCallback(() => {
    loadReady(readyQ);
    setFilters({});
    loadHistory({ page: 0, filters: {}, sort: null });
  }, [loadReady, loadHistory, readyQ]);

  const onHistoryFilter = useCallback((next: Filters) => {
    setFilters(next);
    loadHistory({ page: 0, filters: next });
  }, [loadHistory]);

  const onHistorySort = useCallback((next: SortState) => {
    loadHistory({ page: 0, sort: next });
  }, [loadHistory]);

  const openDetail = useCallback((r: PayoutRow) => {
    if (r.PAYOUTID == null) return;
    open(<DetailModal payoutid={Number(r.PAYOUTID)} canWrite={canWrite} onChanged={() => loadHistory({ page })} />);
  }, [open, canWrite, loadHistory, page]);

  const applyPayout = useCallback((r: ReadyRow) => {
    if (r.EVENTID == null) return;
    open(<FRMpayout eventid={Number(r.EVENTID)} onSaved={() => { loadReady(); loadHistory({ page: 0 }); }} />);
  }, [open, loadReady, loadHistory]);

  const previewRow = useCallback((r: ReadyRow) => {
    if (r.EVENTID == null) return;
    applyPayout(r);
  }, [applyPayout]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export(barStatus);
      if (parseBoolean(res?.success) && res.csv_base64) {
        downloadPoCSV(res.csv_base64, res.filename || 'payout.csv');
        toast('Success', `Export ${res.total ?? ''} baris.${res.truncated ? ' (dipotong 10000)' : ''}`, 'ok');
      } else toast('Error', res?.message || 'Export gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [barStatus]);

  const applyHistoryBar = useCallback(() => { loadHistory({ page: 0 }); }, [loadHistory]);

  const clearHistoryBar = useCallback(() => {
    setBarQ(''); setBarStatus('');
    setFilters({});
    loadHistory({ page: 0, filters: {}, sort: null });
  }, [loadHistory]);

  const rowMenu = useCallback((r: PayoutRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [{ label: `Detail ${r.PONO}`, icon: 'view', onClick: () => openDetail(r) }] as CtxItem[],
    });
  }, [openDetail]);

  const readyCols = useMemo(() => readyColumns({ onApply: applyPayout, onPreview: previewRow, canWrite }), [applyPayout, previewRow, canWrite]);
  const historyCols = useMemo(() => historyColumns({ onDetail: openDetail, canWrite }), [openDetail, canWrite]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    loadReady('');
    loadHistory({ page: 0, filters: {}, sort: null });
    checkMenuAccess('70020003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <Btn className={tab === 'siap' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('siap')}>Siap Dicairkan</Btn>
        <Btn className={tab === 'riwayat' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('riwayat')}>Riwayat Payout</Btn>
      </div>
      {tab === 'siap' ? (
        <>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <input className="input" placeholder="Cari event/penyelenggara" value={readyQ} onChange={(e) => setReadyQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <Btn className="primary btn-sm" icon="search" onClick={() => loadReady(readyQ)}>Terapkan</Btn>
            <Btn className="btn-sm" icon="refresh" onClick={() => { setReadyQ(''); loadReady(''); }}>Reset</Btn>
          </div>
          {readyErr && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} /><span>{readyErr}</span>
              <Btn className="btn-sm" icon="refresh" onClick={() => loadReady(readyQ)}>Coba lagi</Btn>
            </div>
          )}
          <DataTable<ReadyRow>
            columns={readyCols}
            rows={ready}
            filters={{}}
            onFilter={() => {}}
            loading={readyLoading}
            rowKey={(r) => String(r.EVENTID ?? '')}
          />
        </>
      ) : (
        <>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <input className="input" placeholder="Cari nomor/event/penyelenggara" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 120 }}>
              <option value="">Semua status</option>
              <option value="DIAJUKAN">Diajukan</option>
              <option value="DIPROSES">Diproses</option>
              <option value="BERHASIL">Berhasil</option>
              <option value="GAGAL">Gagal</option>
              <option value="DITOLAK">Ditolak</option>
            </select>
            <Btn className="primary btn-sm" icon="search" onClick={applyHistoryBar}>Terapkan</Btn>
            <Btn className="btn-sm" icon="refresh" onClick={clearHistoryBar}>Reset</Btn>
            <span className="spacer" />
            <Btn className="btn-sm" icon="report" disabled={exporting} onClick={doExport}>
              {exporting ? 'Mengekspor…' : 'Export CSV'}
            </Btn>
          </div>
          {err && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} /><span>{err}</span>
              <Btn className="btn-sm" icon="refresh" onClick={() => loadHistory({ page: 0 })}>Coba lagi</Btn>
            </div>
          )}
          <DataTable<PayoutRow>
            columns={historyCols}
            rows={rows}
            filters={filters}
            onFilter={onHistoryFilter}
            sort={sortDir}
            onSort={onHistorySort}
            startRow={page * PAGE_SIZE}
            loading={loading}
            rowKey={(r) => String(r.PAYOUTID ?? '')}
            onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
          />
          <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => loadHistory({ page: p })} />
        </>
      )}
    </div>
  );
});

export default GRIDmpayout;
