// GRIDmwithdraw — kartu ringkasan + tabel penarikan + aksi status.
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
import type { CtxItem } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMmwithdraw from './FRMmwithdraw';
import { WD_STATUS_LABEL, downloadWdCSV, formatWdRp, formatWdTgl } from './Cmwithdraw';
import * as proxy from './api';
import { proofUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type WdRow = {
  WITHDRAWALID?: number;
  WDNO?: string;
  SHOPNAME?: string;
  ACCTMASKED?: string;
  AMOUNT?: number | string;
  WITHDRAWFEE?: number | string;
  NETRECEIVED?: number | string;
  STATUS?: string;
  REQUESTAT?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: WdRow) => void;
};

function statusColor(s: string): string {
  switch (String(s || '').toUpperCase()) {
    case 'BERHASIL': return 'ok';
    case 'GAGAL': case 'DITOLAK': return 'err';
    case 'DIPROSES': return 'off';
    default: return '';
  }
}

function buildColumns(h: {
  onDetail: (r: WdRow) => void;
  canWrite: boolean;
}): Column<WdRow>[] {
  return [
    noColumn,
    {
      key: 'WDNO', label: 'Nomor', width: 150, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b style={{ fontFamily: 'monospace' }}>{r.WDNO || '-'}</b></a>,
    },
    { key: 'SHOPNAME', label: 'Penjual', width: 160 },
    { key: 'ACCTMASKED', label: 'Rekening', width: 170, filter: false },
    {
      key: 'AMOUNT', label: 'Nominal', width: 120, align: 'right', filter: false, sortable: true,
      render: (r) => formatWdRp(r.AMOUNT),
    },
    {
      key: 'NETRECEIVED', label: 'Diterima', width: 120, align: 'right', filter: false,
      render: (r) => formatWdRp(r.NETRECEIVED),
    },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'DIAJUKAN', label: 'Diajukan' }, { value: 'DIPROSES', label: 'Diproses' },
        { value: 'BERHASIL', label: 'Berhasil' }, { value: 'GAGAL', label: 'Gagal' },
        { value: 'DITOLAK', label: 'Ditolak' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${statusColor(s)}`}>{WD_STATUS_LABEL[s] || s || '-'}</span>;
      },
    },
    { key: 'REQUESTAT', label: 'Diajukan', width: 150, filter: false, sortable: true, render: (r) => formatWdTgl(r.REQUESTAT) },
    ...(h.canWrite ? [actionsColumn<WdRow>((r) => (
      <Btn className="btn-sm" iconOnly icon="view" title={`Detail ${r.WDNO}`} aria-label={`Detail ${r.WDNO}`} onClick={() => h.onDetail(r)} />
    ), 48)] : []),
  ];
}

// Modal detail: rincian + riwayat status + aksi sesuai status.
function DetailModal({ withdrawalid, canWrite, onChanged }: {
  withdrawalid: number; canWrite: boolean; onChanged: () => void;
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
      const res: any = await proxy.read_detail(withdrawalid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [withdrawalid]);

  useEffect(() => { load(); }, [load]);

  // Aksi status: PROSES/SELESAIKAN/GAGALKAN/TOLAK.
  const act = async (kind: 'process' | 'settle' | 'fail' | 'reject') => {
    if ((kind === 'fail' || kind === 'reject') && !reason.trim()) {
      setReasonErr('Alasan wajib diisi.');
      return;
    }
    if (kind === 'settle' && (!tref.trim() || !tdate.trim())) {
      toast('Error', 'Nomor referensi dan tanggal transfer wajib diisi.', 'err');
      return;
    }
    const question = kind === 'process' ? 'Proses penarikan ini (transfer manual dimulai)?'
      : kind === 'settle' ? 'Selesaikan penarikan ini (BERHASIL)?'
      : kind === 'reject' ? 'Tolak penarikan ini? Dana kembali ke saldo tersedia.'
      : 'Tandai penarikan ini GAGAL? Dana kembali ke saldo tersedia.';
    if (!await confirmDialog(kind === 'reject' || kind === 'fail'
      ? { message: question, okText: 'Ya', danger: true }
      : { message: question, okText: 'Ya' })) return;
    setBusy(true);
    try {
      const fn = kind === 'process' ? proxy.process
        : kind === 'settle' ? proxy.settle : proxy.fail;
      const payload: any = { WITHDRAWALID: withdrawalid };
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

  // Upload bukti transfer (JPG/PNG/WEBP/PDF maks 2MB).
  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res: any = await proxy.upload_proof(withdrawalid, file);
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

  return (
    <Window
      title={`Penarikan ${detail?.WDNO || ''}`}
      icon="form"
      width="640px"
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
          <FrmSet legend="Penarikan" icon="form" columns={2}>
            <FrmRow label="Nomor"><span><b style={{ fontFamily: 'monospace' }}>{detail.WDNO}</b></span></FrmRow>
            <FrmRow label="Status">
              <span className={`badge ${statusColor(st)}`}>{WD_STATUS_LABEL[st] || st}</span>
            </FrmRow>
            <FrmRow label="Penjual"><span>{detail.SHOPNAME} ({detail.SELLERCODE || '-'})</span></FrmRow>
            <FrmRow label="Rekening"><span style={{ fontFamily: 'monospace' }}>{detail.ACCTMASKED}</span></FrmRow>
            <FrmRow label="Nominal"><span>{formatWdRp(detail.AMOUNT)}</span></FrmRow>
            <FrmRow label="Biaya"><span>{formatWdRp(detail.WITHDRAWFEE)}</span></FrmRow>
            <FrmRow label="Diterima"><span><b>{formatWdRp(detail.NETRECEIVED)}</b></span></FrmRow>
            <FrmRow label="Diajukan"><span>{formatWdTgl(detail.REQUESTAT)} ({detail.REQUESTBY || '-'})</span></FrmRow>
            {detail.PROCESSAT && (
              <FrmRow label="Diproses"><span>{formatWdTgl(detail.PROCESSAT)} ({detail.PROCESSBY || '-'})</span></FrmRow>
            )}
            {detail.DONEAT && (
              <FrmRow label="Selesai"><span>{formatWdTgl(detail.DONEAT)} ({detail.DONEBY || '-'})</span></FrmRow>
            )}
            {detail.TRANSFERREF && (
              <FrmRow label="Referensi"><span style={{ fontFamily: 'monospace' }}>{detail.TRANSFERREF}</span></FrmRow>
            )}
            {detail.REASON && (
              <FrmRow label="Alasan"><span>{detail.REASON}</span></FrmRow>
            )}
            {proof && (
              <FrmRow label="Bukti">
                <a href={proof} target="_blank" rel="noreferrer">Lihat bukti</a>
              </FrmRow>
            )}
          </FrmSet>
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

const GRIDmwithdraw = forwardRef<GridApi>(function GRIDmwithdraw(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<WdRow[]>([]);
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
  const [exporting, setExporting] = useState(false);

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

  const openDetail = useCallback((r: WdRow) => {
    if (r.WITHDRAWALID == null) return;
    open(<DetailModal withdrawalid={Number(r.WITHDRAWALID)} canWrite={canWrite} onChanged={reload} />);
  }, [open, canWrite, reload]);

  const create = useCallback(() => {
    open(<FRMmwithdraw onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const edit = useCallback((r: WdRow) => {
    openDetail(r);
  }, [openDetail]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export(barStatus);
      if (parseBoolean(res?.success) && res.csv_base64) {
        downloadWdCSV(res.csv_base64, res.filename || 'withdrawal.csv');
        toast('Success', `Export ${res.total ?? ''} baris.${res.truncated ? ' (dipotong 10000)' : ''}`, 'ok');
      } else toast('Error', res?.message || 'Export gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [barStatus]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: WdRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.WDNO}`, icon: 'view', onClick: () => openDetail(r) },
      ] as CtxItem[],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail, canWrite }), [openDetail, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create, edit }), [refresh, create, edit]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('70030003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Diajukan', value: summary.DIAJUKAN ?? 0 },
    { label: 'Diproses', value: summary.DIPROSES ?? 0 },
    { label: 'Berhasil', value: summary.BERHASIL ?? 0 },
    { label: 'Gagal', value: summary.GAGAL ?? 0 },
    { label: 'Ditolak', value: summary.DITOLAK ?? 0 },
    { label: 'Menunggu', value: formatWdRp(summary.WAITING ?? 0) },
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
        <input className="input" placeholder="Cari nomor/toko/referensi" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua status</option>
          <option value="DIAJUKAN">Diajukan</option>
          <option value="DIPROSES">Diproses</option>
          <option value="BERHASIL">Berhasil</option>
          <option value="GAGAL">Gagal</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <span className="spacer" />
        <Btn className="btn-sm" icon="report" disabled={exporting} onClick={doExport}>
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
      <DataTable<WdRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.WITHDRAWALID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmwithdraw;
