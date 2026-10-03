// GRIDmpayment — kartu ringkasan + tabel pembayaran + detail/batal/export.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF(+range), rows, filters, sort, page, total, loading, err,
// summary, canWrite
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
import FRMpayrecord from './FRMpayrecord';
import { REFTYPE_LABEL, downloadPayCSV, formatPayRp, formatPayTgl } from './Cmpayment';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type PayRow = {
  PAYMENTID?: number;
  PAYNO?: string;
  REFTYPE?: string;
  REFID?: number;
  REFLABEL?: string;
  PAYNAME?: string;
  TOTALPAID?: number | string;
  REFUNDEDTOTAL?: number | string;
  REFUNDSTATUS?: string;
  STATUS?: string;
  SOURCE?: string;
  PAIDAT?: string;
  INVNO?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
};

function statusColor(s: string): string {
  switch (String(s || '').toUpperCase()) {
    case 'BERHASIL': return 'ok';
    case 'DIBATALKAN': return 'err';
    default: return '';
  }
}

function buildColumns(h: {
  onDetail: (r: PayRow) => void;
  canWrite: boolean;
}): Column<PayRow>[] {
  return [
    noColumn,
    {
      key: 'PAYNO', label: 'Nomor', width: 150, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b style={{ fontFamily: 'monospace' }}>{r.PAYNO || '-'}</b></a>,
    },
    { key: 'PAIDAT', label: 'Waktu bayar', width: 150, filter: false, sortable: true, render: (r) => formatPayTgl(r.PAIDAT) },
    {
      key: 'REFTYPE', label: 'Jenis', width: 110, sortable: false,
      filter: 'select', options: [
        { value: 'TIKET', label: 'Tiket' }, { value: 'MERCH', label: 'Merchandise' }, { value: 'IKLAN', label: 'Iklan' },
      ] as any,
      render: (r) => REFTYPE_LABEL[String(r.REFTYPE)] || r.REFTYPE,
    },
    { key: 'REFLABEL', label: 'Referensi', width: 200, filter: false },
    { key: 'PAYNAME', label: 'Metode', width: 110, filter: false },
    {
      key: 'TOTALPAID', label: 'Total', width: 120, align: 'right', filter: false, sortable: true,
      render: (r) => formatPayRp(r.TOTALPAID),
    },
    {
      key: 'REFUNDEDTOTAL', label: 'Kembali', width: 110, align: 'right', filter: false,
      render: (r) => {
        const v = Number(r.REFUNDEDTOTAL) || 0;
        if (v <= 0) return <span>-</span>;
        const st = String(r.REFUNDSTATUS || '');
        return <span>{formatPayRp(v)}{st && st !== '-' ? ` (${st === 'DIKEMBALIKAN' ? 'penuh' : 'sebagian'})` : ''}</span>;
      },
    },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'BERHASIL', label: 'Berhasil' }, { value: 'DIBATALKAN', label: 'Dibatalkan' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${statusColor(s)}`}>{s || '-'}</span>;
      },
    },
    ...(h.canWrite ? [actionsColumn<PayRow>((r) => (
      <Btn className="btn-sm" iconOnly icon="view" title={`Detail ${r.PAYNO}`} aria-label={`Detail ${r.PAYNO}`} onClick={() => h.onDetail(r)} />
    ), 48)] : []),
  ];
}

// Modal detail: rincian biaya + invoice + riwayat refund + batal.
function DetailModal({ paymentid, canWrite, onChanged }: {
  paymentid: number; canWrite: boolean; onChanged: () => void;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(paymentid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [paymentid]);

  useEffect(() => { load(); }, [load]);

  // Batalkan pembayaran (alasan wajib; syarat dicek backend).
  const cancel = async () => {
    if (!reason.trim()) { setReasonErr('Alasan pembatalan wajib diisi.'); return; }
    if (!await confirmDialog({ message: `Batalkan pembayaran ${detail?.PAYNO}? Status sumber kembali, invoice batal.`, okText: 'Ya, Batalkan', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_cancel({ PAYMENTID: paymentid, REASON: reason.trim() });
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

  const st = String(detail?.STATUS || '').toUpperCase();

  return (
    <Window
      title={`Pembayaran ${detail?.PAYNO || ''}`}
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
          <FrmSet legend="Rincian" icon="form" columns={2}>
            <FrmRow label="Nomor"><span><b style={{ fontFamily: 'monospace' }}>{detail.PAYNO}</b></span></FrmRow>
            <FrmRow label="Status">
              <span className={`badge ${statusColor(st)}`}>{st}</span>
            </FrmRow>
            <FrmRow label="Jenis"><span>{REFTYPE_LABEL[String(detail.REFTYPE)] || detail.REFTYPE} — {detail.REFLABEL}</span></FrmRow>
            <FrmRow label="Waktu"><span>{formatPayTgl(detail.PAIDAT)} ({detail.SOURCE})</span></FrmRow>
            <FrmRow label="Subtotal"><span>{formatPayRp(detail.SUBTOTAL)}</span></FrmRow>
            <FrmRow label="Diskon"><span>{formatPayRp(detail.DISCOUNT)}{detail.PROMOCODE ? ` (${detail.PROMOCODE})` : ''}</span></FrmRow>
            <FrmRow label="Biaya layanan"><span>{formatPayRp(detail.SERVICEFEE)}</span></FrmRow>
            {String(detail.REFTYPE) === 'MERCH' && (
              <FrmRow label="Ongkir"><span>{formatPayRp(detail.SHIPPING)}</span></FrmRow>
            )}
            <FrmRow label="Total dibayar"><span><b>{formatPayRp(detail.TOTALPAID)}</b></span></FrmRow>
            <FrmRow label="Metode"><span>{detail.PAYNAME || '-'} ({formatPayRp(detail.METHODFEE)})</span></FrmRow>
            <FrmRow label="Biaya platform"><span>{formatPayRp(detail.PLATFORMFEE)}</span></FrmRow>
            <FrmRow label="Bagian pemilik"><span>{formatPayRp(detail.OWNERAMT)}</span></FrmRow>
            <FrmRow label="Invoice"><span style={{ fontFamily: 'monospace' }}>{detail.INVNO || '-'} ({detail.INVSTATUS || '-'})</span></FrmRow>
            {detail.EXTREF && (
              <FrmRow label="Ref eksternal"><span>{detail.EXTREF}</span></FrmRow>
            )}
            {detail.CANCELREASON && (
              <FrmRow label="Alasan batal"><span>{detail.CANCELREASON} ({detail.CANCELBY || '-'})</span></FrmRow>
            )}
          </FrmSet>
          {Array.isArray(detail.REFUNDS) && detail.REFUNDS.length > 0 && (
            <FrmSet legend="Riwayat refund" icon="form" columns={1}>
              <DataTable<any>
                columns={[
                  noColumn,
                  { key: 'REFUNDTIME', label: 'Waktu', width: 150, filter: false, render: (r) => formatPayTgl(r.REFUNDTIME) },
                  { key: 'AMOUNT', label: 'Nominal', width: 120, align: 'right', filter: false, render: (r) => formatPayRp(r.AMOUNT) },
                  { key: 'REFUNDTYPE', label: 'Jenis', width: 120, filter: false },
                  { key: 'ACTOR', label: 'Pelaku', width: 100, filter: false },
                ]}
                rows={detail.REFUNDS}
                filters={{}}
                onFilter={() => {}}
                rowKey={(r) => String(r.REFUNDID ?? '')}
              />
            </FrmSet>
          )}
          {canWrite && st === 'BERHASIL' && (
            <FrmSet legend="Batalkan (koreksi salah catat)" icon="check" columns={1}>
              <FrmRow label="Alasan">
                <div>
                  <input className="input" placeholder="wajib diisi" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} maxLength={200} />
                  {reasonErr && <span className="field-err">{reasonErr}</span>}
                </div>
              </FrmRow>
              <div className="toolbar">
                <Btn className="danger btn-sm" icon="del" disabled={busy} onClick={cancel}>Batalkan Pembayaran</Btn>
              </div>
              <p className="loading-hint">Di luar syarat (mis. peserta sudah hadir) penolakan menyarankan proses refund.</p>
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}

// Modal hasil pemeriksaan konsistensi.
function ConsistencyModal({ result }: { result: any }) {
  const { close } = useModal();
  const healthy = (result.MISS_TIKET || 0) + (result.MISS_MERCH || 0) + (result.MISS_IKLAN || 0) + (result.ORPHAN || 0) === 0;
  return (
    <Window
      title="Pemeriksaan Data"
      icon="check"
      width="560px"
      footer={<><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Tutup</Btn></>}
    >
      <FrmSet legend="Hasil" icon="check" columns={2}>
        <FrmRow label="Tiket tanpa bayar"><span><b>{result.MISS_TIKET ?? 0}</b></span></FrmRow>
        <FrmRow label="Merch tanpa bayar"><span><b>{result.MISS_MERCH ?? 0}</b></span></FrmRow>
        <FrmRow label="Iklan tanpa bayar"><span><b>{result.MISS_IKLAN ?? 0}</b></span></FrmRow>
        <FrmRow label="Bayar yatim"><span><b>{result.ORPHAN ?? 0}</b></span></FrmRow>
      </FrmSet>
      {healthy ? (
        <p className="loading-hint">Sehat: semua sumber LUNAS punya pembayaran, semua pembayaran menunjuk sumber yang benar.</p>
      ) : (
        <>
          <p className="loading-hint">Ada selisih — periksa sampel berikut, lalu catat pembayaran yang kurang (sumber BACKFILL) atau perbaiki status sumber.</p>
          {(result.SAMPLE_A || []).map((s: any, i: number) => (
            <div key={`a${i}`} className="loading-hint">{s.TYPE} #{s.ID} ({s.CODE}) — sumber tanpa bayar</div>
          ))}
          {(result.SAMPLE_B || []).map((s: any, i: number) => (
            <div key={`b${i}`} className="loading-hint">{s.TYPE} #{s.ID} ({s.CODE}) — bayar tanpa sumber</div>
          ))}
        </>
      )}
    </Window>
  );
}

const GRIDmpayment = forwardRef<GridApi>(function GRIDmpayment(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const monthStart = new Date();
  monthStart.setDate(1);
  const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [rows, setRows] = useState<PayRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barFrom, setBarFrom] = useState(fmtD(monthStart));
  const [barTo, setBarTo] = useState(fmtD(new Date()));
  const [barType, setBarType] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [barSource, setBarSource] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; from: string; to: string; type: string; status: string; source: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    const by = opts?.bar?.type ?? barType;
    const bs = opts?.bar?.status ?? barStatus;
    const bc = opts?.bar?.source ?? barSource;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        paidfrom: bf, paidto: bt, reftype: by, status: bs, source: bc,
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
  }, [page, filters, sort, barQ, barFrom, barTo, barType, barStatus, barSource]);

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await proxy.read_summary(barFrom, barTo);
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, [barFrom, barTo]);

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

  const openDetail = useCallback((r: PayRow) => {
    if (r.PAYMENTID == null) return;
    open(<DetailModal paymentid={Number(r.PAYMENTID)} canWrite={canWrite} onChanged={reload} />);
  }, [open, canWrite, reload]);

  const create = useCallback(() => {
    open(<FRMpayrecord onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const check = useCallback(async () => {
    try {
      const res: any = await proxy.read_consistency();
      if (parseBoolean(res?.success)) open(<ConsistencyModal result={(res.Rows || [])[0] || {}} />);
      else toast('Error', res?.message || 'Gagal memeriksa.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [open]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export({
        paidfrom: barFrom, paidto: barTo, reftype: barType, status: barStatus,
      });
      if (parseBoolean(res?.success) && res.csv_base64) {
        downloadPayCSV(res.csv_base64, res.filename || 'payment.csv');
        toast('Success', `Export ${res.total ?? ''} baris.${res.truncated ? ' (dipotong 10000)' : ''}`, 'ok');
      } else toast('Error', res?.message || 'Export gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [barFrom, barTo, barType, barStatus]);

  const applyBar = useCallback(() => { load({ page: 0 }); loadSummary(); }, [load, loadSummary]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarType(''); setBarStatus(''); setBarSource('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
  }, [load, loadSummary]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: PayRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.PAYNO}`, icon: 'view', onClick: () => openDetail(r) },
      ] as CtxItem[],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail, canWrite }), [openDetail, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create }), [refresh, create]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('70010002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Total berhasil', value: formatPayRp(summary.TOTAL ?? 0) },
    { label: 'Transaksi', value: summary.COUNT ?? 0 },
    { label: 'Dikembalikan', value: formatPayRp(summary.REFUNDED ?? 0) },
    { label: 'Tiket', value: formatPayRp(summary.TIKET ?? 0) },
    { label: 'Merchandise', value: formatPayRp(summary.MERCH ?? 0) },
    { label: 'Iklan', value: formatPayRp(summary.IKLAN ?? 0) },
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
        <input className="input" type="date" value={barFrom} onChange={(e) => setBarFrom(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={barTo} onChange={(e) => setBarTo(e.target.value)} style={{ width: 140 }} />
        <input className="input" placeholder="Cari nomor/nama" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua jenis</option>
          <option value="TIKET">Tiket</option>
          <option value="MERCH">Merchandise</option>
          <option value="IKLAN">Iklan</option>
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua status</option>
          <option value="BERHASIL">Berhasil</option>
          <option value="DIBATALKAN">Dibatalkan</option>
        </select>
        <select value={barSource} onChange={(e) => setBarSource(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua sumber</option>
          <option value="MANUAL">Manual</option>
          <option value="IMPOR">Impor</option>
          <option value="BACKFILL">Backfill</option>
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <span className="spacer" />
        <Btn className="btn-sm" icon="check" onClick={check}>Periksa Data</Btn>
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
      <DataTable<PayRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.PAYMENTID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmpayment;
