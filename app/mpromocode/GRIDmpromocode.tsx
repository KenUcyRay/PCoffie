// GRIDmpromocode — kartu ringkasan + tabel promo + detail/uji/hapus.
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
import FRMmpromocode from './FRMmpromocode';
import { DISPLAY_LABEL, formatKuota, formatNilai, formatPromoRp, formatTgl } from './Cmpromocode';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type PromoRow = {
  PROMOID?: number;
  PROMOCODE?: string;
  DESCR?: string;
  DISCTYPE?: string;
  DISCVALUE?: number | string;
  MAXDISC?: number | string | null;
  MINPURCHASE?: number | string;
  QUOTA?: number | null;
  MAXPERBUYER?: number;
  STARTAT?: string;
  ENDAT?: string;
  SCOPETYPE?: string;
  ISACTIVE?: string;
  USEDCOUNT?: number;
  DISPLAYSTATUS?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: PromoRow) => void;
  remove: (r: PromoRow) => void;
};

function badgeColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'BERLAKU': return 'ok';
    case 'NONAKTIF': return 'off';
    case 'KUOTA_HABIS': case 'KEDALUWARSA': return 'err';
    default: return '';
  }
}

function buildColumns(h: {
  onDetail: (r: PromoRow) => void;
  onEdit: (r: PromoRow) => void;
  onToggle: (r: PromoRow) => void;
  onRemove: (r: PromoRow) => void;
  canWrite: boolean;
}): Column<PromoRow>[] {
  return [
    noColumn,
    {
      key: 'PROMOCODE', label: 'Kode', width: 130, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b style={{ fontFamily: 'monospace' }}>{r.PROMOCODE || '-'}</b></a>,
    },
    {
      key: 'DISCTYPE', label: 'Nilai', width: 170, sortable: false,
      render: (r) => formatNilai(r as any),
    },
    {
      key: 'QUOTA', label: 'Pakai/Kuota', width: 130, filter: false,
      render: (r) => formatKuota(r as any),
    },
    { key: 'STARTAT', label: 'Mulai', width: 110, filter: false, sortable: true, render: (r) => formatTgl(r.STARTAT) },
    { key: 'ENDAT', label: 'Selesai', width: 110, filter: false, sortable: true, render: (r) => formatTgl(r.ENDAT) },
    {
      key: 'SCOPETYPE', label: 'Cakupan', width: 100, sortable: false,
      filter: 'select', options: [
        { value: 'SEMUA', label: 'SEMUA' }, { value: 'KATEGORI', label: 'KATEGORI' }, { value: 'EVENT', label: 'EVENT' },
      ] as any,
    },
    {
      key: 'ISACTIVE', label: 'Status', width: 120, sortable: true,
      filter: 'select', options: [
        { value: 'BERLAKU', label: 'Berlaku' }, { value: 'AKAN_DATANG', label: 'Akan datang' },
        { value: 'KEDALUWARSA', label: 'Kedaluwarsa' }, { value: 'KUOTA_HABIS', label: 'Kuota habis' },
        { value: 'NONAKTIF', label: 'Nonaktif' },
      ] as any,
      render: (r) => {
        const s = String(r.DISPLAYSTATUS || '').toUpperCase();
        return <span className={`badge ${badgeColor(s)}`}>{DISPLAY_LABEL[s] || s || '-'}</span>;
      },
    },
    ...(h.canWrite ? [actionsColumn<PromoRow>((r) => (
      <>
        <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah ${r.PROMOCODE}`} aria-label={`Ubah ${r.PROMOCODE}`} onClick={() => h.onEdit(r)} />
        <Btn className="btn-sm" iconOnly icon={r.ISACTIVE === 'YES' ? 'close' : 'check'} title={r.ISACTIVE === 'YES' ? `Nonaktifkan ${r.PROMOCODE}` : `Aktifkan ${r.PROMOCODE}`} aria-label={r.ISACTIVE === 'YES' ? `Nonaktifkan ${r.PROMOCODE}` : `Aktifkan ${r.PROMOCODE}`} onClick={() => h.onToggle(r)} />
        {(Number(r.USEDCOUNT) || 0) === 0 && (
          <Btn className="danger btn-sm" iconOnly icon="del" title={`Hapus ${r.PROMOCODE}`} aria-label={`Hapus ${r.PROMOCODE}`} onClick={() => h.onRemove(r)} />
        )}
      </>
    ), 120)] : []),
  ];
}

// Modal detail: info promo + cakupan + riwayat pemakaian (paging).
function DetailModal({ promoid, canWrite, onEdit, onChanged }: {
  promoid: number; canWrite: boolean; onEdit: () => void; onChanged: () => void;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'info' | 'usage'>('info');
  const [usage, setUsage] = useState<any[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usagePage, setUsagePage] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(promoid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [promoid]);

  const loadUsage = useCallback(async (p: number) => {
    setUsageLoading(true);
    try {
      const res: any = await proxy.read_usage(promoid, PAGE_SIZE, p * PAGE_SIZE);
      if (parseBoolean(res?.success)) {
        setUsage(res.Rows || []);
        setUsageTotal(Number(res.TotalRows) || 0);
        setUsagePage(p);
      }
    } catch { /* riwayat gagal: tab info tetap tampil */ }
    finally {
      setUsageLoading(false);
    }
  }, [promoid]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'usage') loadUsage(0); }, [tab, loadUsage]);

  const st = String(detail?.DISPLAYSTATUS || '').toUpperCase();

  return (
    <Window
      title={`Promo ${detail?.PROMOCODE || ''}`}
      icon="form"
      width="640px"
      footer={
        <>
          {canWrite && (
            <Btn className="primary btn-sm" icon="edit" onClick={() => { close(); onEdit(); }}>Ubah</Btn>
          )}
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
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <Btn className={tab === 'info' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('info')}>Info</Btn>
            <Btn className={tab === 'usage' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('usage')}>Pemakaian ({detail.USEDCOUNT ?? 0})</Btn>
          </div>
          {tab === 'info' ? (
            <FrmSet legend="Promo" icon="form" columns={2}>
              <FrmRow label="Kode"><span><b style={{ fontFamily: 'monospace' }}>{detail.PROMOCODE}</b></span></FrmRow>
              <FrmRow label="Status">
                <span className={`badge ${badgeColor(st)}`}>{DISPLAY_LABEL[st] || st}</span>
              </FrmRow>
              <FrmRow label="Nilai"><span>{formatNilai(detail)}</span></FrmRow>
              <FrmRow label="Min beli"><span>{formatPromoRp(detail.MINPURCHASE)}</span></FrmRow>
              <FrmRow label="Pakai/Kuota"><span>{formatKuota(detail)}</span></FrmRow>
              <FrmRow label="Periode"><span>{formatTgl(detail.STARTAT)} s/d {formatTgl(detail.ENDAT)}</span></FrmRow>
              <FrmRow label="Batas/pembeli"><span>{detail.MAXPERBUYER ?? '-'}× per event</span></FrmRow>
              <FrmRow label="Cakupan"><span>{detail.SCOPETYPE}</span></FrmRow>
              {Array.isArray(detail.SCOPES) && detail.SCOPES.length > 0 && (
                <FrmRow label="Target">
                  <span style={{ fontFamily: 'monospace' }}>{detail.SCOPES.map((s: any) => s.TARGETCODE).join(', ')}</span>
                </FrmRow>
              )}
              {detail.DESCR && (
                <FrmRow label="Deskripsi"><span>{detail.DESCR}</span></FrmRow>
              )}
            </FrmSet>
          ) : (
            <>
              <DataTable<any>
                columns={[
                  noColumn,
                  { key: 'USEDATETIME', label: 'Waktu', width: 150, filter: false },
                  { key: 'BUYEREMAIL', label: 'Pembeli', width: 170, filter: false },
                  { key: 'EVENTID', label: 'Event', width: 70, filter: false },
                  { key: 'BEFOREAMOUNT', label: 'Nominal', width: 110, align: 'right', filter: false, render: (r) => formatPromoRp(r.BEFOREAMOUNT) },
                  { key: 'DISCAMOUNT', label: 'Potongan', width: 110, align: 'right', filter: false, render: (r) => formatPromoRp(r.DISCAMOUNT) },
                  { key: 'STATUS', label: 'Status', width: 100, filter: false },
                ]}
                rows={usage}
                filters={{}}
                onFilter={() => {}}
                loading={usageLoading}
                rowKey={(r) => String(r.USAGEID ?? '')}
                startRow={usagePage * PAGE_SIZE}
              />
              <GridPager total={usageTotal} page={usagePage} pageSize={PAGE_SIZE} onPage={(p) => loadUsage(p)} />
            </>
          )}
        </>
      ) : null}
    </Window>
  );
}

// Modal uji kode: simulasi tanpa mencatat pemakaian.
function TestModal() {
  const { close } = useModal();
  const [code, setCode] = useState('');
  const [eventid, setEventid] = useState('');
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!code.trim() || !amount.trim()) {
      setResult({ VALID: 'NO', REASON: 'Kode dan nominal wajib diisi.', DISCOUNT: '0' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res: any = await proxy.test_code({
        CODE: code.trim(), EVENTID: eventid.trim(), AMOUNT: amount.trim(), EMAIL: email.trim(),
      });
      if (parseBoolean(res?.success)) setResult((res.Rows || [])[0] || null);
      else setResult({ VALID: 'NO', REASON: res?.message || 'Gagal.', DISCOUNT: '0' });
    } catch (e: any) {
      setResult({ VALID: 'NO', REASON: e.message, DISCOUNT: '0' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Uji Kode Promo"
      icon="search"
      width="480px"
      footer={
        <>
          <Btn className="primary" icon="check" disabled={busy} onClick={run}>Uji</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      <FrmSet legend="Simulasi" icon="search" columns={2}>
        <FrmRow label="Kode">
          <input className="input" style={{ fontFamily: 'monospace' }} placeholder="HEMAT10" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
        </FrmRow>
        <FrmRow label="ID Event">
          <input className="input" type="number" min={1} placeholder="mis. 1" value={eventid} onChange={(e) => setEventid(e.target.value)} />
        </FrmRow>
        <FrmRow label="Nominal (Rp)">
          <input className="input" type="number" min={0} placeholder="mis. 200000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FrmRow>
        <FrmRow label="Email">
          <input className="input" placeholder="opsional" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={100} />
        </FrmRow>
      </FrmSet>
      {result && (
        <div className={result.VALID === 'YES' ? 'toast-ok alert-inline' : 'toast-err alert-inline'}>
          <Icon name={result.VALID === 'YES' ? 'check' : 'alertCircle'} size={17} />
          <span>
            {result.VALID === 'YES'
              ? `Berlaku — potongan ${formatPromoRp(result.DISCOUNT)}.`
              : `Tidak berlaku (${result.REASON}).`}
          </span>
        </div>
      )}
      <p className="loading-hint">Uji coba tidak mencatat pemakaian (simulasi murni).</p>
    </Window>
  );
}

const GRIDmpromocode = forwardRef<GridApi>(function GRIDmpromocode(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barType, setBarType] = useState('');
  const [barScope, setBarScope] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; type: string; scope: string; status: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bt = opts?.bar?.type ?? barType;
    const bc = opts?.bar?.scope ?? barScope;
    const bs = opts?.bar?.status ?? barStatus;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined, disctype: bt, scopetype: bc, status: bs,
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
  }, [page, filters, sort, barQ, barType, barScope, barStatus]);

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

  const openDetail = useCallback((r: PromoRow) => {
    if (r.PROMOID == null) return;
    const id = Number(r.PROMOID);
    open(<DetailModal promoid={id} canWrite={canWrite} onEdit={() => open(<FRMmpromocode isNew={false} promoId={id} onSaved={reload} />)} onChanged={reload} />);
  }, [open, canWrite, reload]);

  const create = useCallback(() => {
    open(<FRMmpromocode isNew onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const edit = useCallback((r: PromoRow) => {
    if (r.PROMOID == null) return;
    const id = Number(r.PROMOID);
    open(<FRMmpromocode isNew={false} promoId={id} onSaved={reload} />);
  }, [open, reload]);

  const toggle = useCallback(async (r: PromoRow) => {
    const toActive = r.ISACTIVE !== 'YES';
    if (!await confirmDialog({ message: `${toActive ? 'Aktifkan' : 'Nonaktifkan'} promo "${r.PROMOCODE}"?` })) return;
    try {
      const res: any = await proxy.change_status({ PROMOID: r.PROMOID, ISACTIVE: toActive ? 'YES' : 'NO' });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [reload]);

  const remove = useCallback(async (r: PromoRow) => {
    if (!await confirmDialog({ message: `Hapus promo "${r.PROMOCODE}"?`, okText: 'Ya, Hapus', danger: true })) return;
    try {
      const res: any = await proxy.process_delete({ PROMOID: r.PROMOID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [reload]);

  const test = useCallback(() => {
    open(<TestModal />);
  }, [open]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarType(''); setBarScope(''); setBarStatus('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: PromoRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.PROMOCODE}`, icon: 'view', onClick: () => openDetail(r) },
        ...(canWrite ? [{ label: `Ubah ${r.PROMOCODE}`, icon: 'edit', onClick: () => edit(r) }] : []),
      ] as CtxItem[],
    });
  }, [openDetail, edit, canWrite]);

  const columns = useMemo(() => buildColumns({
    onDetail: openDetail, onEdit: edit, onToggle: toggle, onRemove: remove, canWrite,
  }), [openDetail, edit, toggle, remove, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create, edit, remove }), [refresh, create, edit, remove]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('60010002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Berlaku', value: summary.BERLAKU ?? 0 },
    { label: 'Akan datang', value: summary.AKAN_DATANG ?? 0 },
    { label: 'Kedaluwarsa', value: summary.KEDALUWARSA ?? 0 },
    { label: 'Kuota habis', value: summary.KUOTA_HABIS ?? 0 },
    { label: 'Nonaktif', value: summary.NONAKTIF ?? 0 },
    { label: 'Potongan diberikan', value: formatPromoRp(summary.TOTALDISC ?? 0) },
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
        <input className="input" placeholder="Cari kode/deskripsi" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua jenis</option>
          <option value="PERSEN">Persen</option>
          <option value="NOMINAL">Nominal</option>
        </select>
        <select value={barScope} onChange={(e) => setBarScope(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua cakupan</option>
          <option value="SEMUA">Semua</option>
          <option value="KATEGORI">Kategori</option>
          <option value="EVENT">Event</option>
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          <option value="YES">Aktif</option>
          <option value="NO">Nonaktif</option>
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <span className="spacer" />
        <Btn className="btn-sm" icon="search" onClick={test}>Uji Kode</Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<PromoRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.PROMOID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmpromocode;
