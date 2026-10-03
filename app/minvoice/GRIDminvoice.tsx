// GRIDminvoice — kartu ringkasan + tabel invoice + detail siap cetak.
// Read-only: tanpa tambah/ubah/hapus. Cetak via window.print() (pola project).
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF(+range), rows, filters, sort, page, total, loading, err, summary
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import type { CtxItem } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { downloadInvCSV, formatInvRp, formatInvTgl } from './Cminvoice';
import * as proxy from './api';
import { logoUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type InvoiceRow = {
  INVOICEID?: number;
  INVNO?: string;
  PAYMENTID?: number;
  REFTYPE?: string;
  ISSUEDATE?: string;
  RECIPIENT?: string;
  TOTAL?: number | string;
  STATUS?: string;
  PAYNO?: string;
};

export type GridApi = {
  refresh: () => void;
};

function statusColor(s: string): string {
  switch (String(s || '').toUpperCase()) {
    case 'TERBIT': return 'ok';
    case 'DIBATALKAN': return 'err';
    default: return '';
  }
}

function buildColumns(h: {
  onDetail: (r: InvoiceRow) => void;
}): Column<InvoiceRow>[] {
  return [
    noColumn,
    {
      key: 'INVNO', label: 'Nomor', width: 160, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b style={{ fontFamily: 'monospace' }}>{r.INVNO || '-'}</b></a>,
    },
    { key: 'ISSUEDATE', label: 'Tanggal', width: 110, filter: false, sortable: true, render: (r) => formatInvTgl(r.ISSUEDATE) },
    {
      key: 'REFTYPE', label: 'Jenis', width: 110, sortable: false,
      filter: 'select', options: [
        { value: 'TIKET', label: 'Tiket' }, { value: 'MERCH', label: 'Merchandise' }, { value: 'IKLAN', label: 'Iklan' },
      ] as any,
    },
    { key: 'RECIPIENT', label: 'Penerima', width: 180 },
    {
      key: 'TOTAL', label: 'Total', width: 120, align: 'right', filter: false, sortable: true,
      render: (r) => formatInvRp(r.TOTAL),
    },
    {
      key: 'STATUS', label: 'Status', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'TERBIT', label: 'Terbit' }, { value: 'DIBATALKAN', label: 'Dibatalkan' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${statusColor(s)}`}>{s || '-'}</span>;
      },
    },
    actionsColumn<InvoiceRow>((r) => (
      <Btn className="btn-sm" iconOnly icon="view" title={`Detail ${r.INVNO}`} aria-label={`Detail ${r.INVNO}`} onClick={() => h.onDetail(r)} />
    ), 48),
  ];
}

// Modal detail: tampilan invoice siap cetak (kop + penerima + rincian).
function InvoiceModal({ invoiceid }: { invoiceid: number }) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [identity, setIdentity] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [d, idn] = await Promise.all([
        proxy.read_detail(invoiceid),
        proxy.read_identity(),
      ]);
      if (parseBoolean((d as any)?.success)) setDetail(((d as any).Rows || [])[0] || null);
      else setErr((d as any)?.message || 'Gagal memuat data.');
      if (parseBoolean((idn as any)?.success)) setIdentity(((idn as any).Rows || [])[0] || {});
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [invoiceid]);

  useEffect(() => { load(); }, [load]);

  const st = String(detail?.STATUS || '').toUpperCase();
  const lines = Array.isArray(detail?.LINES) ? detail.LINES : [];
  const refunds = Array.isArray(detail?.REFUNDS) ? detail.REFUNDS : [];
  const logo = logoUrl(identity.LOGO);

  return (
    <Window
      title={`Invoice ${detail?.INVNO || ''}`}
      icon="report"
      width="640px"
      footer={
        <>
          <Btn className="primary" icon="report" onClick={() => window.print()}>Cetak</Btn>
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
        <div className="inv-sheet">
          {st === 'DIBATALKAN' && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span><b>DIBATALKAN</b>{detail.CANCELREASON ? ` — ${detail.CANCELREASON}` : ''}</span>
            </div>
          )}
          <div className="toolbar" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {logo && <img src={logo} alt="logo" width={44} height={44} style={{ objectFit: 'contain' }} />}
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{identity.APPNAME || 'Tiket APP'}</div>
                {identity.ADDRESS && <div className="loading-hint">{identity.ADDRESS}</div>}
                {(identity.CONTACTEMAIL || identity.CONTACTPHONE || identity.CONTACTWA) && (
                  <div className="loading-hint">
                    {[identity.CONTACTEMAIL, identity.CONTACTPHONE, identity.CONTACTWA].filter(Boolean).join(' • ')}
                  </div>
                )}
              </div>
            </div>
            <span className="spacer" />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{detail.INVNO}</div>
              <div className="loading-hint">{formatInvTgl(detail.ISSUEDATE)}</div>
            </div>
          </div>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="loading-hint">Diterima oleh</div>
              <div><b>{detail.RECIPIENT}</b></div>
              {detail.RECIPIENTEMAIL && <div className="loading-hint">{detail.RECIPIENTEMAIL}</div>}
              {detail.RECIPIENTADDR && <div className="loading-hint">{detail.RECIPIENTADDR}</div>}
            </div>
            <span className="spacer" />
            <div style={{ textAlign: 'right' }}>
              <div className="loading-hint">Pembayaran</div>
              <div style={{ fontFamily: 'monospace' }}>{detail.PAYNO || '-'} ({detail.PAYNAME || 'manual'})</div>
            </div>
          </div>
          <DataTable<any>
            columns={[
              noColumn,
              { key: 'desc', label: 'Uraian', width: 260, filter: false },
              { key: 'qty', label: 'Jml', width: 50, align: 'right', filter: false },
              { key: 'price', label: 'Harga', width: 110, align: 'right', filter: false, render: (r) => formatInvRp(r.price) },
              { key: 'amount', label: 'Jumlah', width: 120, align: 'right', filter: false, render: (r) => formatInvRp(r.amount) },
            ]}
            rows={lines}
            filters={{}}
            onFilter={() => {}}
            rowKey={(_r, i) => String(i)}
          />
          <div style={{ textAlign: 'right', marginTop: 8, lineHeight: 1.9 }}>
            <div>Subtotal: {formatInvRp(detail.SUBTOTAL)}</div>
            <div>Diskon{detail.PROMOCODE ? ` (${detail.PROMOCODE})` : ''}: {formatInvRp(detail.DISCOUNT)}</div>
            <div>Biaya layanan: {formatInvRp(detail.SERVICEFEE)}</div>
            {String(detail.REFTYPE) === 'MERCH' && (
              <div>Ongkir: {formatInvRp(detail.SHIPPING)}</div>
            )}
            <div style={{ fontSize: 16 }}><b>Total: {formatInvRp(detail.TOTAL)}</b></div>
          </div>
          {refunds.length > 0 && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>
                Refund: {refunds.map((f: any) => `${formatInvRp(f.AMOUNT)} (${formatInvTgl(f.REFUNDTIME)})`).join('; ')}.
                Isi invoice tidak berubah.
              </span>
            </div>
          )}
        </div>
      ) : null}
    </Window>
  );
}

const GRIDminvoice = forwardRef<GridApi>(function GRIDminvoice(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const monthStart = new Date();
  monthStart.setDate(1);
  const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [rows, setRows] = useState<InvoiceRow[]>([]);
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
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; from: string; to: string; type: string; status: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    const by = opts?.bar?.type ?? barType;
    const bs = opts?.bar?.status ?? barStatus;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        datefrom: bf, dateto: bt, reftype: by, status: bs,
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
  }, [page, filters, sort, barQ, barFrom, barTo, barType, barStatus]);

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

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openDetail = useCallback((r: InvoiceRow) => {
    if (r.INVOICEID == null) return;
    open(<InvoiceModal invoiceid={Number(r.INVOICEID)} />);
  }, [open]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const res: any = await proxy.read_export({
        datefrom: barFrom, dateto: barTo, reftype: barType, status: barStatus,
      });
      if (parseBoolean(res?.success) && res.csv_base64) {
        downloadInvCSV(res.csv_base64, res.filename || 'invoice.csv');
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
    setBarQ(''); setBarType(''); setBarStatus('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
  }, [load, loadSummary]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: InvoiceRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.INVNO}`, icon: 'view', onClick: () => openDetail(r) },
      ] as CtxItem[],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail }), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Terbit', value: summary.ISSUED ?? 0 },
    { label: 'Nilai terbit', value: formatInvRp(summary.ISSUED_AMT ?? 0) },
    { label: 'Dibatalkan', value: summary.CANCELLED ?? 0 },
    { label: 'Nilai batal', value: formatInvRp(summary.CANCELLED_AMT ?? 0) },
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
        <input className="input" placeholder="Cari nomor/penerima" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua jenis</option>
          <option value="TIKET">Tiket</option>
          <option value="MERCH">Merchandise</option>
          <option value="IKLAN">Iklan</option>
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua status</option>
          <option value="TERBIT">Terbit</option>
          <option value="DIBATALKAN">Dibatalkan</option>
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
      <DataTable<InvoiceRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.INVOICEID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDminvoice;
