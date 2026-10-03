// GRIDmtickettype — pilih event + kartu ringkasan + tabel tipe + aksi.
// Kalau dibuka dari pintasan Event Data, event langsung terpilih.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: eventId, events, eventQ, rows, filters, sort, page, total, loading, err, summary, canWrite
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
import FRMmtickettype, { type TicketForm } from './FRMmtickettype';
import { formatIDR } from './Cmtickettype';
import { takePickedEvent } from '../meventdata/eventPick';
import * as proxy from './api';
import * as eventProxy from '../meventdata/api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type TicketRow = {
  TICKETTYPEID?: number;
  EVENTID?: number;
  NAME?: string;
  DESCR?: string;
  PRICE?: number | string;
  QUOTA?: number | string;
  MAXPERSON?: number | string;
  SALESTART?: string;
  SALEEND?: string;
  SORTORDER?: number | string;
  ISACTIVE?: string;
  SOLD?: number | string;
  REMAIN?: number | string;
};

export type EventOpt = {
  EVENTID: number;
  EVENTCODE?: string;
  TITLE?: string;
  STATUS?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: TicketRow) => void;
  remove: (r: TicketRow) => void;
};

const toForm = (r: TicketRow): TicketForm => ({
  TICKETTYPEID: r.TICKETTYPEID,
  EVENTID: r.EVENTID,
  NAME: r.NAME || '',
  DESCR: String(r.DESCR || ''),
  PRICE: String(r.PRICE ?? ''),
  QUOTA: String(r.QUOTA ?? ''),
  MAXPERSON: String(r.MAXPERSON ?? '1'),
  SALESTART: r.SALESTART ? String(r.SALESTART).replace(' ', 'T').slice(0, 16) : '',
  SALEEND: r.SALEEND ? String(r.SALEEND).replace(' ', 'T').slice(0, 16) : '',
  SORTORDER: String(r.SORTORDER ?? '0'),
  ISACTIVE: r.ISACTIVE || 'YES',
});

function buildColumns(h: {
  onEdit: (r: TicketRow) => void;
  onRemove: (r: TicketRow) => void;
  onToggle: (r: TicketRow) => void;
}): Column<TicketRow>[] {
  return [
    noColumn,
    actionsColumn<TicketRow>((r) => {
      const on = String(r.ISACTIVE || '').toUpperCase() === 'YES';
      return (
        <>
          <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah ${r.NAME}`} aria-label={`Ubah ${r.NAME}`} onClick={() => h.onEdit(r)} />
          <Btn
            className="btn-sm" iconOnly icon={on ? 'close' : 'check'}
            title={on ? `Nonaktifkan ${r.NAME}` : `Aktifkan ${r.NAME}`}
            aria-label={on ? `Nonaktifkan ${r.NAME}` : `Aktifkan ${r.NAME}`}
            onClick={() => h.onToggle(r)}
          />
          <Btn className="danger btn-sm" iconOnly icon="del" title={`Hapus ${r.NAME}`} aria-label={`Hapus ${r.NAME}`} onClick={() => h.onRemove(r)} />
        </>
      );
    }, 120),
    { key: 'SORTORDER', label: 'Urutan', width: 70, align: 'right', sortable: true },
    { key: 'NAME', label: 'Nama', width: 140, sortable: true },
    { key: 'DESCR', label: 'Benefit', width: 200, render: (r) => String(r.DESCR || '-').slice(0, 80) },
    {
      key: 'PRICE', label: 'Harga', width: 120, align: 'right', sortable: true,
      render: (r) => formatIDR(r.PRICE),
    },
    { key: 'QUOTA', label: 'Kuota', width: 80, align: 'right', sortable: true },
    {
      key: 'SOLD', label: 'Terjual', width: 130, align: 'right', filter: false,
      render: (r) => {
        const sold = Number(r.SOLD) || 0;
        const quota = Number(r.QUOTA) || 0;
        const pct = quota > 0 ? Math.min(100, Math.round((sold * 100) / quota)) : 0;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
            <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--brand)' }} />
            </span>
            <span className="loading-hint">{sold}/{quota}</span>
          </span>
        );
      },
    },
    { key: 'MAXPERSON', label: 'Batas/org', width: 80, align: 'right' },
    {
      key: 'ISACTIVE', label: 'Status', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'YES', label: 'Aktif' }, { value: 'NO', label: 'Nonaktif' },
      ] as any,
      render: (r) => {
        const on = String(r.ISACTIVE || '').toUpperCase() === 'YES';
        return <span className={`badge ${on ? 'ok' : ''}`}>{on ? 'Aktif' : 'Nonaktif'}</span>;
      },
    },
  ];
}

const GRIDmtickettype = forwardRef<GridApi>(function GRIDmtickettype(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [eventId, setEventId] = useState<number | null>(null);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [eventQ, setEventQ] = useState('');
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});

  const loadEvents = useCallback(async (q?: string) => {
    try {
      const res: any = await eventProxy.read_dropdown({ q: q || '' });
      if (parseBoolean(res?.success)) setEvents(res.Rows || []);
    } catch { /* daftar event gagal: biarkan kosong */ }
  }, []);

  const load = useCallback(async (opts?: { event?: number | null; page?: number; filters?: Filters; sort?: SortState }) => {
    const ev = opts?.event !== undefined ? opts.event : eventId;
    if (!ev) return;
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({ eventid: ev, limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f, sort: s ?? undefined });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
        setSort(s);
        setEventId(ev);
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [eventId, page, filters, sort]);

  const loadSummary = useCallback(async (ev: number | null) => {
    if (!ev) return;
    try {
      const res: any = await proxy.read_summary(ev);
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary(eventId);
  }, [load, loadSummary, eventId]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const pickEvent = useCallback((ev: number | null) => {
    setFilters({});
    setRows([]);
    setSummary({});
    if (ev) {
      load({ event: ev, page: 0, filters: {}, sort: null });
      loadSummary(ev);
    } else {
      setEventId(null);
      setTotal(0);
    }
  }, [load, loadSummary]);

  const openTicket = useCallback((r: TicketRow) => {
    if (!eventId) return;
    open(<FRMmtickettype isNew={false} initial={toForm(r)} eventId={eventId} onSaved={() => { load({ page }); loadSummary(eventId); }} />);
  }, [open, eventId, load, loadSummary, page]);

  const create = useCallback(() => {
    if (!eventId) { toast('Error', 'Pilih event dulu.', 'err'); return; }
    open(<FRMmtickettype isNew eventId={eventId} onSaved={() => { load({ page: 0 }); loadSummary(eventId); }} />);
  }, [open, eventId, load, loadSummary]);

  const toggleStatus = useCallback(async (r: TicketRow) => {
    const active = String(r.ISACTIVE || '').toUpperCase() === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} tipe ${r.NAME}?` })) return;
    try {
      const res: any = await proxy.change_status({ TICKETTYPEID: r.TICKETTYPEID, ISACTIVE: active ? 'NO' : 'YES' });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message, 'ok');
        load({ page });
        if (eventId) loadSummary(eventId);
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, loadSummary, eventId, page]);

  const removeTicket = useCallback(async (r: TicketRow) => {
    if (!await confirmDialog({ message: `Hapus tipe ${r.NAME}?`, okText: 'Ya, Hapus', danger: true })) return;
    try {
      const res: any = await proxy.process_delete({ TICKETTYPEID: r.TICKETTYPEID });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message, 'ok');
        load({ page });
        if (eventId) loadSummary(eventId);
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, loadSummary, eventId, page]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: TicketRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.NAME}`, icon: 'edit', onClick: () => openTicket(r) },
        { label: `Hapus ${r.NAME}`, icon: 'del', danger: true, onClick: () => removeTicket(r) },
      ],
    });
  }, [openTicket, removeTicket]);

  const columns = useMemo(() => buildColumns({ onEdit: openTicket, onRemove: removeTicket, onToggle: toggleStatus }), [openTicket, removeTicket, toggleStatus]);

  useImperativeHandle(ref, () => ({ refresh, create, edit: openTicket, remove: removeTicket }), [refresh, create, openTicket, removeTicket]);

  useEffect(() => {
    (async () => {
      await loadEvents('');
      const picked = takePickedEvent();
      if (picked) {
        pickEvent(picked);
        return;
      }
      try {
        const res: any = await eventProxy.read_dropdown({});
        const list = (parseBoolean(res?.success) ? res.Rows || [] : []) as EventOpt[];
        if (list.length) pickEvent(Number(list[0].EVENTID));
      } catch { /* tanpa event terpilih */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Total kuota', value: summary.QUOTA ?? 0 },
    { label: 'Terjual', value: summary.SOLD ?? 0 },
    { label: 'Sisa', value: summary.REMAIN ?? 0 },
    { label: 'Potensi pendapatan', value: formatIDR(summary.REVENUE ?? 0) },
  ];

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Event</span>
        <select
          value={eventId ?? ''} onChange={(e) => pickEvent(e.target.value ? Number(e.target.value) : null)}
          style={{ flex: 1, minWidth: 200 }}
        >
          <option value="">Pilih event</option>
          {events.map((e) => (
            <option key={e.EVENTID} value={e.EVENTID}>
              {e.EVENTCODE} — {e.TITLE} ({e.STATUS})
            </option>
          ))}
        </select>
        <input
          className="input" placeholder="Cari event…" value={eventQ}
          onChange={(e) => { setEventQ(e.target.value); loadEvents(e.target.value); }}
          style={{ width: 160 }}
        />
      </div>
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
          </div>
        ))}
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      {!eventId && !loading && (
        <div className="card-body">
          <p className="empty-hint"><Icon name="ticket" size={16} /> Pilih event dulu untuk melihat tipe tiketnya.</p>
        </div>
      )}
      {eventId ? (
        <>
          <DataTable<TicketRow>
            columns={columns}
            rows={rows}
            filters={filters}
            onFilter={onFilter}
            sort={sortDir}
            onSort={onSort}
            startRow={page * PAGE_SIZE}
            loading={loading}
            rowKey={(r) => String(r.TICKETTYPEID ?? '')}
            onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
          />
          <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
        </>
      ) : null}
    </div>
  );
});

export default GRIDmtickettype;
