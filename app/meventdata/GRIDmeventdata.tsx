// GRIDmeventdata — tabel event + aksi status + pintasan ke tiket/peserta.
// Poster kecil, progress terjual/kuota, badge status, modal kurang-syarat
// publish dan modal alasan batal. Pakai komponen reusable DataTable.
//
// State: barF, rows, filters, sort, page, total, loading, err, canWrite, cats, cities
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMmeventdata, { type EventForm } from './FRMmeventdata';
import { formatTanggal } from './Cmeventdata';
import { setPickedEvent } from './eventPick';
import * as proxy from './api';
import { posterUrl } from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type EventRow = {
  EVENTID?: number;
  EVENTCODE?: string;
  TITLE?: string;
  CATCODE?: string;
  CATNAME?: string;
  CITYCODE?: string;
  CITYNAME?: string;
  VENUE?: string;
  STARTAT?: string;
  ENDAT?: string;
  POSTER?: string;
  ORGNAME?: string;
  STATUS?: string;
  QUOTA?: number | string;
  SOLD?: number | string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: EventRow) => void;
};

function badgeColor(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'PUBLISHED': return 'ok';
    case 'DRAFT': return '';
    case 'ENDED': return 'off';
    case 'CANCELLED': return 'err';
    default: return '';
  }
}

function Progress({ sold, quota }: { sold: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((sold * 100) / quota)) : 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
      <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--brand)' }} />
      </span>
      <span className="loading-hint">{sold}/{quota}</span>
    </span>
  );
}

function buildColumns(h: {
  onEdit: (r: EventRow) => void;
  onPublish: (r: EventRow) => void;
  onUnpublish: (r: EventRow) => void;
  onCancel: (r: EventRow) => void;
  onDuplicate: (r: EventRow) => void;
  onRemove: (r: EventRow) => void;
  onTickets: (r: EventRow) => void;
  onAttendees: (r: EventRow) => void;
}): Column<EventRow>[] {
  return [
    noColumn,
    {
      key: 'POSTER', label: 'Poster', width: 64, filter: false,
      render: (r) => {
        const src = posterUrl(r.POSTER);
        return src
          ? <img src={src} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          : <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center' }}><Icon name="form" size={18} /></span>;
      },
    },
    { key: 'EVENTCODE', label: 'Kode', width: 130, sortable: true },
    { key: 'TITLE', label: 'Judul', width: 200, sortable: true },
    { key: 'CATNAME', label: 'Kategori', width: 110, sortable: true },
    { key: 'CITYNAME', label: 'Kota', width: 110, sortable: true },
    { key: 'STARTAT', label: 'Mulai', width: 150, filter: false, sortable: true, render: (r) => formatTanggal(r.STARTAT) },
    {
      key: 'STATUS', label: 'Status', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'DRAFT', label: 'DRAFT' }, { value: 'PUBLISHED', label: 'PUBLISHED' },
        { value: 'ENDED', label: 'ENDED' }, { value: 'CANCELLED', label: 'CANCELLED' },
      ] as any,
      render: (r) => {
        const s = String(r.STATUS || '').toUpperCase();
        return <span className={`badge ${badgeColor(s)}`}>{s || '-'}</span>;
      },
    },
    {
      key: 'SOLD', label: 'Terjual/Kuota', width: 150, filter: false,
      render: (r) => <Progress sold={Number(r.SOLD) || 0} quota={Number(r.QUOTA) || 0} />,
    },
    actionsColumn<EventRow>((r) => {
      const st = String(r.STATUS || '').toUpperCase();
      return (
        <>
          {(st === 'DRAFT' || st === 'PUBLISHED') && (
            <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah ${r.EVENTCODE}`} aria-label={`Ubah ${r.EVENTCODE}`} onClick={() => h.onEdit(r)} />
          )}
          {st === 'DRAFT' && (
            <Btn className="btn-sm" iconOnly icon="check" title={`Publish ${r.EVENTCODE}`} aria-label={`Publish ${r.EVENTCODE}`} onClick={() => h.onPublish(r)} />
          )}
          {st === 'PUBLISHED' && (
            <Btn className="btn-sm" iconOnly icon="arrowL" title={`Unpublish ${r.EVENTCODE}`} aria-label={`Unpublish ${r.EVENTCODE}`} onClick={() => h.onUnpublish(r)} />
          )}
          {st === 'PUBLISHED' && (
            <Btn className="danger btn-sm" iconOnly icon="close" title={`Batalkan ${r.EVENTCODE}`} aria-label={`Batalkan ${r.EVENTCODE}`} onClick={() => h.onCancel(r)} />
          )}
          <Btn className="btn-sm" iconOnly icon="add" title={`Duplikat ${r.EVENTCODE}`} aria-label={`Duplikat ${r.EVENTCODE}`} onClick={() => h.onDuplicate(r)} />
          {st === 'DRAFT' && (
            <Btn className="danger btn-sm" iconOnly icon="del" title={`Hapus ${r.EVENTCODE}`} aria-label={`Hapus ${r.EVENTCODE}`} onClick={() => h.onRemove(r)} />
          )}
          <Btn className="btn-sm" iconOnly icon="ticket" title={`Tipe tiket ${r.EVENTCODE}`} aria-label={`Tipe tiket ${r.EVENTCODE}`} onClick={() => h.onTickets(r)} />
          <Btn className="btn-sm" iconOnly icon="users" title={`Peserta ${r.EVENTCODE}`} aria-label={`Peserta ${r.EVENTCODE}`} onClick={() => h.onAttendees(r)} />
        </>
      );
    }, 230),
  ];
}

const toForm = (r: EventRow): EventForm => ({
  EVENTID: r.EVENTID,
  TITLE: r.TITLE || '',
  CATCODE: r.CATCODE || '',
  CITYCODE: r.CITYCODE || '',
  VENUE: (r as any).VENUE || '',
  ADDRESS: (r as any).ADDRESS || '',
  LATITUDE: String((r as any).LATITUDE ?? ''),
  LONGITUDE: String((r as any).LONGITUDE ?? ''),
  STARTAT: '',
  ENDAT: '',
  POSTER: r.POSTER || '',
  ORGNAME: r.ORGNAME || '',
  ORGCONTACT: String((r as any).ORGCONTACT || ''),
  DESCR: String((r as any).DESCR || ''),
  TERMS: String((r as any).TERMS || ''),
});

// Modal daftar syarat publish yang belum terpenuhi.
function MissingModal({ items }: { items: string[] }) {
  const { close } = useModal();
  return (
    <Window
      title="Belum Bisa Publish"
      icon="alertCircle"
      width="440px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      <p className="empty-hint"><Icon name="info" size={16} /> Lengkapi dulu syarat berikut:</p>
      <ul>
        {items.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </Window>
  );
}

// Modal batalkan event (alasan wajib).
function CancelModal({ code, eventId, onDone }: { code: string; eventId: number; onDone: () => void }) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan pembatalan wajib diisi.'); return; }
    if (reason.trim().length > 200) { setReasonErr('Alasan maksimal 200 karakter.'); return; }
    if (!await confirmDialog({ message: `Batalkan event ${code}?`, okText: 'Ya, Batalkan', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_cancel({ EVENTID: eventId, REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Event dibatalkan.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal membatalkan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Batalkan ${code}`}
      icon="close"
      width="440px"
      footer={
        <>
          <Btn className="danger" icon="close" disabled={busy} onClick={submit}>Batalkan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      <FrmRow label="Alasan">
        <div>
          <input className="input" placeholder="Alasan pembatalan (wajib)" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} />
          {reasonErr && <span className="field-err">{reasonErr}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

const GRIDmeventdata = forwardRef<GridApi>(function GRIDmeventdata(_props, ref) {  const { open } = useModal();
  const { layoutMode } = useAuth();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [barCat, setBarCat] = useState('');
  const [barCity, setBarCity] = useState('');
  const [barFrom, setBarFrom] = useState('');
  const [barTo, setBarTo] = useState('');

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string; cat: string; city: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bs = opts?.bar?.status ?? barStatus;
    const bc = opts?.bar?.cat ?? barCat;
    const bci = opts?.bar?.city ?? barCity;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        status: bs, catcode: bc, citycode: bci, date_from: bf, date_to: bt,
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
  }, [page, filters, sort, barQ, barStatus, barCat, barCity, barFrom, barTo]);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openEvent = useCallback((r: EventRow) => {
    open(<FRMmeventdata isNew={false} initial={toForm(r)} eventId={r.EVENTID} onSaved={() => load({ page })} />);
  }, [open, load, page]);

  const create = useCallback(() => {
    open(<FRMmeventdata isNew onSaved={() => load({ page: 0 })} />);
  }, [open, load]);

  const publish = useCallback(async (r: EventRow) => {
    if (!await confirmDialog({ message: `Publish event ${r.EVENTCODE}?` })) return;
    try {
      const res: any = await proxy.process_publish({ EVENTID: r.EVENTID });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Event dipublish.', 'ok');
        load({ page });
      } else {
        const missing = (res?.Rows || [])[0]?.MISSING as string[] | undefined;
        if (missing && missing.length) {
          open(<MissingModal items={missing} />);
        } else toast('Error', res?.message || 'Gagal publish.', 'err');
      }
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [open, load, page]);

  const unpublish = useCallback(async (r: EventRow) => {
    if (!await confirmDialog({ message: `Kembalikan event ${r.EVENTCODE} ke DRAFT?` })) return;
    try {
      const res: any = await proxy.process_unpublish({ EVENTID: r.EVENTID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, page]);

  const cancel = useCallback((r: EventRow) => {
    open(<CancelModal code={String(r.EVENTCODE || '')} eventId={Number(r.EVENTID)} onDone={() => load({ page })} />);
  }, [open, load, page]);

  const duplicate = useCallback(async (r: EventRow) => {
    if (!await confirmDialog({ message: `Duplikat event ${r.EVENTCODE} sebagai DRAFT baru?` })) return;
    try {
      const res: any = await proxy.process_duplicate({ EVENTID: r.EVENTID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page: 0 }); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load]);

  const remove = useCallback(async (r: EventRow) => {
    if (!await confirmDialog({ message: `Hapus event ${r.EVENTCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    try {
      const res: any = await proxy.process_delete({ EVENTID: r.EVENTID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, page]);

  const gotoTickets = useCallback((r: EventRow) => {
    if (r.EVENTID == null) return;
    setPickedEvent(Number(r.EVENTID));
    openTab('/mtickettype');
    navigate('/mtickettype');
  }, [navigate, openTab]);

  const gotoAttendees = useCallback((r: EventRow) => {
    if (r.EVENTID == null) return;
    setPickedEvent(Number(r.EVENTID));
    openTab('/mattendee');
    navigate('/mattendee');
  }, [navigate, openTab]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus(''); setBarCat(''); setBarCity(''); setBarFrom(''); setBarTo('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: EventRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.EVENTCODE}`, icon: 'edit', onClick: () => openEvent(r) },
        { label: `Tipe tiket ${r.EVENTCODE}`, icon: 'ticket', onClick: () => gotoTickets(r) },
        { label: `Peserta ${r.EVENTCODE}`, icon: 'users', onClick: () => gotoAttendees(r) },
      ],
    });
  }, [openEvent, gotoTickets, gotoAttendees]);

  const columns = useMemo(() => buildColumns({
    onEdit: openEvent, onPublish: publish, onUnpublish: unpublish,
    onCancel: cancel, onDuplicate: duplicate, onRemove: remove,
    onTickets: gotoTickets, onAttendees: gotoAttendees,
  }), [openEvent, publish, unpublish, cancel, duplicate, remove, gotoTickets, gotoAttendees]);

  useImperativeHandle(ref, () => ({ refresh, create, edit: openEvent }), [refresh, create, openEvent]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input className="input" placeholder="Cari judul/kode/venue" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" placeholder="Kode kategori" value={barCat} onChange={(e) => setBarCat(e.target.value)} style={{ width: 110 }} />
        <input className="input" placeholder="Kode kota" value={barCity} onChange={(e) => setBarCity(e.target.value)} style={{ width: 110 }} />
        <input className="input" type="date" value={barFrom} onChange={(e) => setBarFrom(e.target.value)} style={{ width: 150 }} />
        <input className="input" type="date" value={barTo} onChange={(e) => setBarTo(e.target.value)} style={{ width: 150 }} />
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
      <DataTable<EventRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.EVENTID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmeventdata;
