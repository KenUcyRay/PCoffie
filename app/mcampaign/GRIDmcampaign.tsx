// GRIDmcampaign — kartu ringkasan + tabel kampanye + aksi status + tab posisi.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: tab, barF, rows, filters, sort, page, total, loading, err, summary,
// positions, canWrite
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
import FRMmcampaign from './FRMmcampaign';
import FRMpayrecord from '../mpayment/FRMpayrecord';
import { CAMP_STATUS_LABEL, PERIOD_LABEL, formatAdRp, formatAdTgl } from './Cmcampaign';
import * as proxy from './api';
import { bannerUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type CampaignRow = {
  CAMPAIGNID?: number;
  CAMPAIGNCODE?: string;
  TITLE?: string;
  ADVERTISER?: string;
  CONTACT?: string;
  BANNERIMAGE?: string;
  LINKTYPE?: string;
  EVENTID?: number;
  LINKURL?: string;
  POSITIONID?: number;
  POSCODE?: string;
  POSNAME?: string;
  STARTDATE?: string;
  ENDDATE?: string;
  RATEPERDAY?: number | string;
  DAYCOUNT?: number;
  TOTALCOST?: number | string;
  STATUS?: string;
  PAIDAT?: string;
  CANCELREASON?: string;
  PERIODSTATUS?: string;
  IMPRESSIONS?: number;
  CLICKS?: number;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: CampaignRow) => void;
};

function statusColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'AKTIF': return 'ok';
    case 'DIBATALKAN': return 'err';
    case 'DIJEDA': return 'off';
    default: return '';
  }
}

function periodColor(p: string): string {
  switch (String(p || '').toUpperCase()) {
    case 'TAYANG': return 'ok';
    case 'SELESAI': return 'off';
    default: return '';
  }
}

function buildColumns(h: {
  onDetail: (r: CampaignRow) => void;
  onEdit: (r: CampaignRow) => void;
  canWrite: boolean;
}): Column<CampaignRow>[] {
  return [
    noColumn,
    {
      key: 'BANNERIMAGE', label: 'Banner', width: 64, filter: false,
      render: (r) => {
        const src = bannerUrl(r.BANNERIMAGE);
        return src
          ? <img src={src} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          : <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center' }}><Icon name="form" size={18} /></span>;
      },
    },
    {
      key: 'CAMPAIGNCODE', label: 'Kode', width: 90, sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}><b style={{ fontFamily: 'monospace' }}>{r.CAMPAIGNCODE || '-'}</b></a>,
    },
    { key: 'TITLE', label: 'Judul', width: 180, sortable: true },
    { key: 'ADVERTISER', label: 'Pengiklan', width: 130 },
    { key: 'POSCODE', label: 'Posisi', width: 130, sortable: false },
    {
      key: 'STATUS', label: 'Status', width: 130, sortable: true,
      filter: 'select', options: [
        { value: 'DRAFT', label: 'Draft' }, { value: 'MENUNGGU_BAYAR', label: 'Menunggu bayar' },
        { value: 'AKTIF', label: 'Aktif' }, { value: 'DIJEDA', label: 'Dijeda' },
        { value: 'DIBATALKAN', label: 'Dibatalkan' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${statusColor(s)}`}>{CAMP_STATUS_LABEL[s] || s || '-'}</span>;
      },
    },
    {
      key: 'PERIODSTATUS', label: 'Periode', width: 100, filter: false,
      render: (r) => {
        const s = String(r.PERIODSTATUS || '').toUpperCase();
        return <span className={`badge ${periodColor(s)}`}>{PERIOD_LABEL[s] || s || '-'}</span>;
      },
    },
    {
      key: 'TOTALCOST', label: 'Total', width: 120, align: 'right', filter: false, sortable: true,
      render: (r) => formatAdRp(r.TOTALCOST),
    },
    {
      key: 'IMPRESSIONS', label: 'Tayang', width: 80, align: 'right', filter: false,
      render: (r) => Number(r.IMPRESSIONS) || 0,
    },
    {
      key: 'CLICKS', label: 'Klik', width: 70, align: 'right', filter: false,
      render: (r) => Number(r.CLICKS) || 0,
    },
    ...(h.canWrite ? [actionsColumn<CampaignRow>((r) => (
      <>
        <Btn className="btn-sm" iconOnly icon="view" title={`Detail ${r.CAMPAIGNCODE}`} aria-label={`Detail ${r.CAMPAIGNCODE}`} onClick={() => h.onDetail(r)} />
        {String(r.STATUS).toUpperCase() !== 'DIBATALKAN' && (
          <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah ${r.CAMPAIGNCODE}`} aria-label={`Ubah ${r.CAMPAIGNCODE}`} onClick={() => h.onEdit(r)} />
        )}
      </>
    ), 84)] : []),
  ];
}

// Modal detail: info + 30 hari statistik + aksi status.
function DetailModal({ campaignid, canWrite, onEdit, onChanged }: {
  campaignid: number; canWrite: boolean; onEdit: () => void; onChanged: () => void;
}) {
  const { open, close } = useModal();
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
      const res: any = await proxy.read_detail(campaignid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [campaignid]);

  useEffect(() => { load(); }, [load]);

  // Aksi status: AJUKAN/JEDA/LANJUT/BATAL (+catat bayar terpisah).
  const act = async (action: string) => {
    if (action === 'BATAL' && !reason.trim()) { setReasonErr('Alasan pembatalan wajib diisi.'); return; }
    const question = action === 'AJUKAN' ? 'Ajukan kampanye untuk pembayaran?'
      : action === 'JEDA' ? 'Jeda penayangan kampanye ini?'
      : action === 'LANJUT' ? 'Lanjutkan penayangan kampanye ini?'
      : 'Batalkan kampanye ini? Status final, tidak bisa diubah lagi.';
    if (!await confirmDialog(action === 'BATAL'
      ? { message: question, okText: 'Ya, Batalkan', danger: true }
      : { message: question })) return;
    setBusy(true);
    try {
      const res: any = await proxy.change_status({ CAMPAIGNID: campaignid, ACTION: action, CANCELREASON: reason.trim() });
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

  // Catat bayar via form pusat Finance (invoice ikut terbit).
  // Kampanye menjadi AKTIF bila slot tersedia (dicek backend).
  const pay = () => {
    open(
      <FRMpayrecord
        presetType="IKLAN"
        presetRefId={campaignid}
        presetLabel={`${detail?.CAMPAIGNCODE || ''} ${detail?.TITLE || ''}`}
        onSaved={() => { onChanged(); load(); }}
      />
    );
  };

  const st = String(detail?.STATUS || '').toUpperCase();
  const ps = String(detail?.PERIODSTATUS || '').toUpperCase();

  return (
    <Window
      title={`Iklan ${detail?.CAMPAIGNCODE || ''}`}
      icon="form"
      width="640px"
      footer={
        <>
          {canWrite && st !== 'DIBATALKAN' && (
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
          <FrmSet legend="Kampanye" icon="form" columns={2}>
            <FrmRow label="Kode"><span><b style={{ fontFamily: 'monospace' }}>{detail.CAMPAIGNCODE}</b></span></FrmRow>
            <FrmRow label="Status">
              <span className={`badge ${statusColor(st)}`}>{CAMP_STATUS_LABEL[st] || st}</span>
              {' '}
              <span className={`badge ${periodColor(ps)}`}>{PERIOD_LABEL[ps] || ps}</span>
            </FrmRow>
            <FrmRow label="Judul"><span>{detail.TITLE}</span></FrmRow>
            <FrmRow label="Pengiklan"><span>{detail.ADVERTISER}{detail.CONTACT ? ` (${detail.CONTACT})` : ''}</span></FrmRow>
            <FrmRow label="Posisi"><span>{detail.POSCODE} — {detail.POSNAME || '-'}</span></FrmRow>
            <FrmRow label="Tujuan">
              <span>{String(detail.LINKTYPE).toUpperCase() === 'EVENT' ? `Event #${detail.EVENTID ?? '-'}` : detail.LINKURL || '-'}</span>
            </FrmRow>
            <FrmRow label="Periode"><span>{formatAdTgl(detail.STARTDATE)} s/d {formatAdTgl(detail.ENDDATE)} ({detail.DAYCOUNT ?? '-'} hari)</span></FrmRow>
            <FrmRow label="Tarif/hari"><span>{formatAdRp(detail.RATEPERDAY)}</span></FrmRow>
            <FrmRow label="Total"><span><b>{formatAdRp(detail.TOTALCOST)}</b></span></FrmRow>
            {detail.PAIDAT && (
              <FrmRow label="Dibayar"><span>{String(detail.PAIDAT).slice(0, 16).replace('T', ' ')}</span></FrmRow>
            )}
            {detail.CANCELREASON && (
              <FrmRow label="Alasan batal"><span>{detail.CANCELREASON}</span></FrmRow>
            )}
            <FrmRow label="Tayang/Klik"><span>{detail.TOTALIMP ?? 0} / {detail.TOTALCLICK ?? 0}</span></FrmRow>
          </FrmSet>
          {canWrite && st !== 'DIBATALKAN' && (
            <FrmSet legend="Aksi" icon="check" columns={1}>
              <div className="toolbar">
                {st === 'DRAFT' && (
                  <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => act('AJUKAN')}>Ajukan Bayar</Btn>
                )}
                {st === 'MENUNGGU_BAYAR' && (
                  <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={pay}>Catat Bayar</Btn>
                )}
                {st === 'AKTIF' && (
                  <Btn className="btn-sm" icon="close" disabled={busy} onClick={() => act('JEDA')}>Jeda</Btn>
                )}
                {st === 'DIJEDA' && (
                  <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => act('LANJUT')}>Lanjutkan</Btn>
                )}
                <Btn className="danger btn-sm" icon="del" disabled={busy} onClick={() => act('BATAL')}>Batalkan</Btn>
              </div>
              <FrmRow label="Alasan batal">
                <div>
                  <input className="input" placeholder="wajib bila membatalkan" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} maxLength={200} />
                  {reasonErr && <span className="field-err">{reasonErr}</span>}
                </div>
              </FrmRow>
            </FrmSet>
          )}
          {Array.isArray(detail.DAILY) && detail.DAILY.length > 0 && (
            <FrmSet legend="30 hari terakhir" icon="form" columns={1}>
              <DataTable<any>
                columns={[
                  noColumn,
                  { key: 'STATDATE', label: 'Tanggal', width: 130, filter: false, render: (r) => formatAdTgl(r.STATDATE) },
                  { key: 'IMPRESSIONS', label: 'Tayang', width: 100, align: 'right', filter: false },
                  { key: 'CLICKS', label: 'Klik', width: 100, align: 'right', filter: false },
                ]}
                rows={detail.DAILY}
                filters={{}}
                onFilter={() => {}}
                rowKey={(r) => String(r.STATDATE ?? '')}
              />
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}

// Modal ubah posisi: hanya tarif/kapasitas/status (dimensi & kode terkunci).
function PositionModal({ pos, onSaved }: { pos: any; onSaved: () => void }) {
  const { close } = useModal();
  const [rate, setRate] = useState(String(pos.RATEPERDAY ?? '0'));
  const [cap, setCap] = useState(String(pos.CAPACITY ?? '1'));
  const [active, setActive] = useState(String(pos.ISACTIVE || 'YES'));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!await confirmDialog({ message: `Simpan posisi "${pos.POSCODE}"? Tarif baru hanya berlaku untuk kampanye berikutnya.` })) return;
    setBusy(true);
    try {
      const res: any = await proxy.position_update({
        POSITIONID: pos.POSITIONID, RATEPERDAY: rate.trim(), CAPACITY: cap.trim(), ISACTIVE: active,
      });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message, 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Posisi ${pos.POSCODE}`}
      icon="form"
      width="480px"
      footer={
        <>
          <Btn className="primary" icon="check" disabled={busy} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Slot" icon="form" columns={2}>
        <FrmRow label="Nama"><span>{pos.POSNAME} ({pos.WIDTH}×{pos.HEIGHT})</span></FrmRow>
        <FrmRow label="Tarif/hari (Rp)">
          <input className="input" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
        </FrmRow>
        <FrmRow label="Kapasitas">
          <input className="input" type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} />
        </FrmRow>
        <FrmRow label="Status">
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="YES">Aktif</option>
            <option value="NO">Nonaktif</option>
          </select>
        </FrmRow>
        <FrmRow label="Terisi hari ini"><span>{pos.TODAYCOUNT ?? 0}/{pos.CAPACITY ?? 1}</span></FrmRow>
      </FrmSet>
      <p className="loading-hint">Dimensi & kode posisi terkunci. Tarif baru hanya untuk kampanye berikutnya.</p>
    </Window>
  );
}

const GRIDmcampaign = forwardRef<GridApi>(function GRIDmcampaign(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [tab, setTab] = useState<'kampanye' | 'posisi'>('kampanye');
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [barPos, setBarPos] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [positions, setPositions] = useState<any[]>([]);
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string; pos: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bs = opts?.bar?.status ?? barStatus;
    const bp = opts?.bar?.pos ?? barPos;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined, status: bs, positionid: bp,
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
  }, [page, filters, sort, barQ, barStatus, barPos]);

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await proxy.read_summary();
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const res: any = await proxy.read_position();
      if (parseBoolean(res?.success)) setPositions(res.Rows || []);
    } catch { /* posisi gagal: tab kampanye tetap tampil */ }
  }, []);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    loadPositions();
  }, [load, loadSummary, loadPositions]);

  const reload = useCallback(() => {
    load({ page });
    loadSummary();
    loadPositions();
  }, [load, loadSummary, loadPositions, page]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openDetail = useCallback((r: CampaignRow) => {
    if (r.CAMPAIGNID == null) return;
    const id = Number(r.CAMPAIGNID);
    open(<DetailModal campaignid={id} canWrite={canWrite} onEdit={() => open(<FRMmcampaign isNew={false} campaignId={id} onSaved={reload} />)} onChanged={reload} />);
  }, [open, canWrite, reload]);

  const create = useCallback(() => {
    open(<FRMmcampaign isNew onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const edit = useCallback((r: CampaignRow) => {
    if (r.CAMPAIGNID == null) return;
    const id = Number(r.CAMPAIGNID);
    open(<FRMmcampaign isNew={false} campaignId={id} onSaved={reload} />);
  }, [open, reload]);

  const editPos = useCallback((pos: any) => {
    open(<PositionModal pos={pos} onSaved={() => { loadPositions(); }} />);
  }, [open, loadPositions]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus(''); setBarPos('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: CampaignRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.CAMPAIGNCODE}`, icon: 'view', onClick: () => openDetail(r) },
        ...(canWrite && String(r.STATUS).toUpperCase() !== 'DIBATALKAN'
          ? [{ label: `Ubah ${r.CAMPAIGNCODE}`, icon: 'edit', onClick: () => edit(r) }]
          : []),
      ] as CtxItem[],
    });
  }, [openDetail, edit, canWrite]);

  const columns = useMemo(() => buildColumns({
    onDetail: openDetail, onEdit: edit, canWrite,
  }), [openDetail, edit, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create, edit }), [refresh, create, edit]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    loadPositions();
    checkMenuAccess('60010003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Draft', value: summary.DRAFT ?? 0 },
    { label: 'Menunggu bayar', value: summary.MENUNGGU_BAYAR ?? 0 },
    { label: 'Aktif', value: summary.AKTIF ?? 0 },
    { label: 'Dijeda', value: summary.DIJEDA ?? 0 },
    { label: 'Dibatalkan', value: summary.DIBATALKAN ?? 0 },
    { label: 'Tayang hari ini', value: summary.TODAYIMP ?? 0 },
    { label: 'Klik hari ini', value: summary.TODAYCLICK ?? 0 },
    { label: 'Pendapatan bulan ini', value: formatAdRp(summary.MONTHREVENUE ?? 0) },
  ];

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <Btn className={tab === 'kampanye' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('kampanye')}>Kampanye</Btn>
        <Btn className={tab === 'posisi' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('posisi')}>Posisi</Btn>
      </div>
      {tab === 'kampanye' ? (
        <>
          <div className="stat-grid">
            {cards.map((c) => (
              <div key={c.label} className="stat-card">
                <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
              </div>
            ))}
          </div>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <input className="input" placeholder="Cari kode/judul/pengiklan" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 140 }}>
              <option value="">Semua status</option>
              <option value="DRAFT">Draft</option>
              <option value="MENUNGGU_BAYAR">Menunggu bayar</option>
              <option value="AKTIF">Aktif</option>
              <option value="DIJEDA">Dijeda</option>
              <option value="DIBATALKAN">Dibatalkan</option>
            </select>
            <select value={barPos} onChange={(e) => setBarPos(e.target.value)} style={{ width: 160 }}>
              <option value="">Semua posisi</option>
              {positions.map((p) => (
                <option key={p.POSITIONID} value={p.POSITIONID}>{p.POSCODE}</option>
              ))}
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
          <DataTable<CampaignRow>
            columns={columns}
            rows={rows}
            filters={filters}
            onFilter={onFilter}
            sort={sortDir}
            onSort={onSort}
            startRow={page * PAGE_SIZE}
            loading={loading}
            rowKey={(r) => String(r.CAMPAIGNID ?? '')}
            onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
          />
          <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
        </>
      ) : (
        <DataTable<any>
          columns={[
            noColumn,
            { key: 'POSCODE', label: 'Kode', width: 140, filter: false },
            { key: 'POSNAME', label: 'Nama', width: 200, filter: false },
            { key: 'WIDTH', label: 'Lebar', width: 70, align: 'right', filter: false },
            { key: 'HEIGHT', label: 'Tinggi', width: 70, align: 'right', filter: false },
            { key: 'RATEPERDAY', label: 'Tarif/hari', width: 130, align: 'right', filter: false, render: (r) => formatAdRp(r.RATEPERDAY) },
            { key: 'CAPACITY', label: 'Kap', width: 60, align: 'right', filter: false },
            { key: 'TODAYCOUNT', label: 'Terisi', width: 90, align: 'right', filter: false, render: (r) => `${r.TODAYCOUNT ?? 0}/${r.CAPACITY ?? 1}` },
            { key: 'ISACTIVE', label: 'Status', width: 90, filter: false, render: (r) => String(r.ISACTIVE).toUpperCase() === 'YES' ? 'Aktif' : 'Nonaktif' },
            ...(canWrite ? [actionsColumn<any>((r) => (
              <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah ${r.POSCODE}`} aria-label={`Ubah ${r.POSCODE}`} onClick={() => editPos(r)} />
            ), 48)] : []),
          ]}
          rows={positions}
          filters={{}}
          onFilter={() => {}}
          rowKey={(r) => String(r.POSITIONID ?? '')}
        />
      )}
    </div>
  );
});

export default GRIDmcampaign;
