// GRIDmeventlist — filter bar + pencarian + tampilan kartu/tabel + paginasi,
// detail event (tipe tiket + promo), tombol pintasan ke halaman pengelola.
// Hanya baca; tidak ada tombol beli/checkout.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useModal } from '@/components/Modal';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { EventCard, EventDetailModal, type EventRow, badgeFor } from './EventParts';
import { setPickedEvent } from '../meventdata/eventPick';
import {
  DEFAULT_FILTER, EVENT_STATUS_LABEL, FLAG_LABEL, TYPE_STATUS_LABEL,
  formatVentRp, formatVentTgl, loadFilter, loadPref, saveFilter, savePref,
  takeDetailEvent, type VentFilter,
} from './Cmeventlist';
import * as proxy from './api';
import { posterUrl } from './api';

const PAGE_SIZE = 24;

export type GridApi = { refresh: () => void };



const GRIDmeventlist = forwardRef<GridApi>(function GRIDmeventlist(_props, ref) {
  const { open } = useModal();
  const { checkMenuAccess, menus } = useAuth();
  const { navigate } = useRoute();
  const { openTab } = useTabs();

  const [mode, setMode] = useState<'cards' | 'table'>(loadPref().mode);
  const [f, setF] = useState<VentFilter>(() => loadFilter());
  const [config, setConfig] = useState<{ CATEGORIES: any[]; CITIES: any[] }>({ CATEGORIES: [], CITIES: [] });
  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // Pintasan: akses ke menu lain.
  const [canManageEvent, setCanManageEvent] = useState(false);
  const [canManageAttendees, setCanManageAttendees] = useState(false);

  const activeCats = config.CATEGORIES;
  const activeCities = config.CITIES;

  const loadConfig = useCallback(async () => {
    try {
      const res: any = await proxy.read_config();
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        setConfig({ CATEGORIES: row.CATEGORIES || [], CITIES: row.CITIES || [] });
      }
    } catch { /* konfig gagal: filter tetap jalan tanpa opsi */ }
  }, []);

  const load = useCallback(async (filt: VentFilter) => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: filt.page * PAGE_SIZE,
        q: filt.q, status: filt.status, cat: filt.cat, city: filt.city,
        datefrom: filt.from, dateto: filt.to,
        price_min: filt.pmin, price_max: filt.pmax,
        sales: filt.sales, sort: filt.sort as any,
      });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
      } else setErr(res?.message || 'Gagal memuat event.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat event.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { load(f); }, [load, f]);

  // Set state dari filter + simpan session + reload.
  const apply = useCallback((next: VentFilter) => {
    setF(next);
    saveFilter(next);
    load(next);
  }, [load]);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_FILTER };
    setF(next);
    saveFilter(next);
    // setTimeout 0 agar state sempat ditulis sebelum load.
    setTimeout(() => load(next), 0);
  }, [load]);

  const toggleMode = useCallback((m: 'cards' | 'table') => {
    setMode(m);
    savePref({ mode: m });
  }, []);

  useEffect(() => { loadConfig(); load(f); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    // Pintasan hanya tampil bila punya akses menu tujuan.
    const get = (mc: string) => (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    const ev = get('meventdata');
    const at = get('mattendee');
    if (ev) checkMenuAccess(String(ev.MCODE)).then(setCanManageEvent).catch(() => setCanManageEvent(false));
    if (at) checkMenuAccess(String(at.MCODE)).then(setCanManageAttendees).catch(() => setCanManageAttendees(false));
    // eslint-disable-next-line
  }, []);

  // Buka detail event dari penanda session (halaman lain menavigasi ke sini).
  useEffect(() => {
    const id = takeDetailEvent();
    if (id) openDetail({ EVENTID: id } as EventRow);
    // eslint-disable-next-line
  }, []);

  const goto = useCallback((mc: string, payload?: number) => {
    // pola pindah antar-menu via payload sessionStorage (sudah ada di project).
    if (payload) setPickedEvent(payload);
    openTab('/' + mc);
    navigate('/' + mc);
  }, [navigate, openTab]);

  const openDetail = useCallback((e: EventRow) => {
    if (e.EVENTID == null) return;
    open(
      <EventDetailModal event={e} canManageEvent={canManageEvent} canManageAttendees={canManageAttendees} goto={goto} />,
    );
  }, [open, canManageEvent, canManageAttendees, goto]);

  const tableColumns: Column<EventRow>[] = useMemo(() => ([
    noColumn,
    {
      key: 'TITLE', label: 'Event', width: 220,
      sortable: true,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); openDetail(r); }}><b>{r.TITLE || '-'}</b></a>,
    },
    { key: 'CATNAME', label: 'Kategori', width: 130 },
    { key: 'CITYNAME', label: 'Kota', width: 120 },
    { key: 'STARTAT', label: 'Mulai', width: 140, sortable: true, render: (r) => formatVentTgl(r.STARTAT) },
    { key: 'MINPRICE', label: 'Mulai harga', width: 130, align: 'right', render: (r) => formatVentRp(r.MINPRICE) },
    {
      key: 'SOLD', label: 'Terjual/Kuota', width: 140, filter: false, align: 'right',
      render: (r) => `${Number(r.SOLD) || 0}/${Number(r.QUOTA) || 0}`,
    },
    {
      key: 'FLAG', label: 'Status jual', width: 110,
      render: (r) => r.FLAG
        ? <span className={`badge ${badgeFor(r.FLAG)}`}>{FLAG_LABEL[r.FLAG] || r.FLAG}</span>
        : <span className="badge ok">Tersedia</span>,
    },
    {
      key: 'STATUS', label: 'Status', width: 100,
      render: (r) => (
        (r.STATUS || '').toUpperCase() === 'PUBLISHED'
          ? <span className="badge ok">Published</span>
          : <span className="badge off">{EVENT_STATUS_LABEL[String(r.STATUS || '').toUpperCase()] || r.STATUS}</span>
      ),
    },
  ]), [openDetail]);

  return (
    <div className="grid-box">
      {/* Filter bar */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
        <input className="input" placeholder="Cari nama/venue/penyelenggara" value={f.q} style={{ flex: 1, minWidth: 180 }}
          onChange={(e) => apply({ ...f, q: e.target.value, page: 0 })} />
        <select value={f.status} onChange={(e) => apply({ ...f, status: e.target.value, page: 0 })}>
          <option value="PUBLISHED">Published (belum berakhir)</option>
          <option value="DRAFT">Draft</option>
          <option value="ENDED">Ended</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          multiple value={f.cat ? f.cat.split(',').filter(Boolean) : []}
          onChange={(e) => apply({ ...f, cat: Array.from(e.target.selectedOptions).map((o) => o.value).join(','), page: 0 })}
          title="Tahan Ctrl untuk multi kategori"
        >
          {activeCats.map((c: any) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME}</option>)}
        </select>
        <select value={f.city} onChange={(e) => apply({ ...f, city: e.target.value, page: 0 })}>
          <option value="">Semua kota</option>
          {activeCities.map((c: any) => <option key={c.CITYCODE} value={c.CITYCODE}>{c.CITYNAME}</option>)}
        </select>
        <input className="input" type="date" value={f.from} onChange={(e) => apply({ ...f, from: e.target.value, page: 0 })} />
        <input className="input" type="date" value={f.to} onChange={(e) => apply({ ...f, to: e.target.value, page: 0 })} />
        <input className="input" style={{ width: 110 }} inputMode="numeric" placeholder="Min harga" value={f.pmin}
          onChange={(e) => apply({ ...f, pmin: e.target.value.replace(/[^0-9]/g, ''), page: 0 })} />
        <input className="input" style={{ width: 110 }} inputMode="numeric" placeholder="Maks harga" value={f.pmax}
          onChange={(e) => apply({ ...f, pmax: e.target.value.replace(/[^0-9]/g, ''), page: 0 })} />
        <select value={f.sales} onChange={(e) => apply({ ...f, sales: e.target.value, page: 0 })}>
          <option value="">Semua status jual</option>
          <option value="TERSEDIA">Tersedia</option>
          <option value="HAMPIR_HABIS">Hampir habis</option>
          <option value="SOLD_OUT">Sold out</option>
        </select>
        <select value={f.sort} onChange={(e) => apply({ ...f, sort: e.target.value, page: 0 })}>
          <option value="terdekat">Terdekat</option>
          <option value="terpopuler">Terpopuler</option>
          <option value="termurah">Harga terendah</option>
          <option value="termahal">Harga tertinggi</option>
        </select>
        <Btn className="btn-sm" icon="refresh" onClick={reset}>Reset</Btn>
        <span className="spacer" />
        <Btn className={mode === 'cards' ? 'primary btn-sm' : 'btn-sm'} icon="grid" onClick={() => toggleMode('cards')}>Kartu</Btn>
        <Btn className={mode === 'table' ? 'primary btn-sm' : 'btn-sm'} icon="layout" onClick={() => toggleMode('table')}>Tabel</Btn>
      </div>

      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load(f)}>Coba lagi</Btn>
        </div>
      )}

      {mode === 'cards' ? (
        <div className="mod-cards">
          {loading ? (
            <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
          ) : rows.length === 0 ? (
            <div className="card-body"><span className="loading-hint"><Icon name="empty" size={16} /> Belum ada event untuk filter ini.</span></div>
          ) : rows.map((e) => (
            <EventCard key={e.EVENTID} e={e} onOpen={openDetail} />
          ))}
        </div>
      ) : (
        <DataTable<EventRow>
          columns={tableColumns}
          rows={rows}
          filters={{}}
          onFilter={() => {}}
          startRow={f.page * PAGE_SIZE}
          loading={loading}
          rowKey={(r) => String(r.EVENTID ?? '')}
        />
      )}

      <GridPager total={total} page={f.page} pageSize={PAGE_SIZE} onPage={(p) => apply({ ...f, page: p })} />
    </div>
  );
});


export default GRIDmeventlist;
