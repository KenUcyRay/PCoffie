// GRIDmeventcity — filter + grafik batang + kartu kategori + daftar event
// kategori terseleksi (kartu/detail dari Event List dipakai bersama).
import { useCallback, useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { toast } from '@/components/toast'
import { useModal } from '@/components/Modal';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Btn, Icon } from '@/components/Icon';
import { EventCard, EventDetailModal, type EventRow } from '../meventlist/EventParts';
import { setPickedEvent } from '../meventdata/eventPick';
import { useEventAccess } from '../meventlist/Cmeventlist';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DEFAULT_VENTCITY, loadFilter, saveFilter } from './Cmeventcity';
import * as proxy from './api';
import * as eventProxy from '../meventlist/api';

type CityRow = {
  CITYCODE: string; CITYNAME: string; CITYPROV: string; CITYTZ: string; UPCOMING: number; TOTAL: number;
  SOLD: number; NEAR: number; SOLD_OUT: number; NEXTAT: string | null;
};

export default function GRIDmeventcity({ onRefreshRef }: { onRefreshRef?: React.MutableRefObject<(() => void) | undefined> }) {
  const { open } = useModal();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const access = useEventAccess();

  const [f, setF] = useState(loadFilter() as any);
  const [configCats, setConfigCats] = useState<any[]>([]);
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [sel, setSel] = useState(f.sel);
  const [selEvents, setSelEvents] = useState<EventRow[]>([]);
  const [selLoading, setSelLoading] = useState(false);
  const [selErr, setSelErr] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const res: any = await eventProxy.read_config();
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        setConfigCats(row.CATEGORIES || []);
      }
    } catch { /* abaikan */ }
  }, []);

  const loadSummary = useCallback(async (filt: typeof f) => {
    setLoading(true); setErr('');
    try {
      const res: any = await proxy.read_summary({ cat: filt.cat, datefrom: filt.from, dateto: filt.to });
      if (parseBoolean(res?.success)) setRows(res.Rows || []);
      else setErr(res?.message || 'Gagal memuat ringkasan.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat ringkasan.');
    } finally { setLoading(false); }
  }, []);

 const loadSel = useCallback(async (cat: string, filt: typeof f) => {
    if (!cat) { setSelEvents([]); return; }
    setSelLoading(true); setSelErr('');
    try {
      const res: any = await eventProxy.read_data({
        limit: 48, offset: 0, city: cat, cat: filt.cat, datefrom: filt.from, dateto: filt.to,
        status: 'PUBLISHED', sort: 'terdekat',
      });
      if (parseBoolean(res?.success)) setSelEvents(res.Rows || []);
      else setSelErr(res?.message || 'Gagal memuat event kategori.');
    } catch (e: any) {
      setSelErr(e.message || 'Gagal memuat event kategori.');
    } finally { setSelLoading(false); }
  }, []);

  const apply = useCallback((next: typeof f) => {
    setF(next); saveFilter(next); loadSummary(next);
    if (next.sel) loadSel(next.sel, next);
  }, [loadSummary, loadSel]);

  useEffect(() => {
    loadConfig(); loadSummary(f);
    if (f.sel) loadSel(f.sel, f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = () => { loadSummary(f); if (f.sel) loadSel(f.sel, f); };
  }, [onRefreshRef, f, loadSummary, loadSel]);

  const pickCat = useCallback((code: string) => {
    const next = { ...f, sel: code };
    setSel(code); setF(next); saveFilter(next); loadSel(code, next);
  }, [f, loadSel]);

  const openEventDetail = useCallback((e: EventRow) => {
    if (e.EVENTID == null) return;
    open(
      <EventDetailModal
        event={e}
        canManageEvent={access.canEvent}
        canManageAttendees={access.canAttendees}
        goto={(mc, payload) => {
          if (payload) setPickedEvent(payload);
          window.sessionStorage.setItem('tiket-app::vent-detail', String(payload || e.EVENTID));
          openTab('/' + mc);
          navigate('/' + mc);
        }}
      />,
    );
  }, [open, access]);

  const top = (rows || []).map((r) => ({ name: r.CITYNAME, Event: r.UPCOMING, Terjual: r.SOLD }));

  return (
    <div className="grid-box">
      {/* Filter */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
        <select value={f.city} onChange={(e) => apply({ ...f, city: e.target.value })}>
          <option value="">Semua kota</option>
          {configCats.map((c: any) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME}</option>)}
        </select>
        <input className="input" type="date" value={f.from} onChange={(e) => apply({ ...f, from: e.target.value })} />
        <input className="input" type="date" value={f.to} onChange={(e) => apply({ ...f, to: e.target.value })} />
        <Btn className="btn-sm" icon="refresh" onClick={() => apply({ ...DEFAULT_VENTCITY })}>Reset</Btn>
      </div>

      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => loadSummary(f)}>Coba lagi</Btn>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        <div className="card">
          <div className="loading-hint" style={{ padding: '6px 10px' }}>Event per kategori</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={top} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="Event" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="loading-hint" style={{ padding: '6px 10px' }}>Tiket terjual per kategori</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={top} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="Terjual" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Kartu kategori */}
      <div className="mod-cards" style={{ marginTop: 8 }}>
        {loading ? (
          <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
        ) : rows.length === 0 ? (
          <div className="card-body"><span className="loading-hint"><Icon name="empty" size={16} /> Belum ada kategori untuk filter ini.</span></div>
        ) : rows.map((r) => (
          <button key={r.CITYCODE} type="button" className={`mod-card ${sel === r.CITYCODE ? 'mod-card-active' : ''}`} onClick={() => pickCat(r.CITYCODE)}>
            <div className="mod-card-body">
              <div className="mod-card-title">{r.CITYNAME}</div>
              <div className="mod-card-sub">{r.CITYPROV || "-"} • {r.CITYTZ || "-"}</div>
              <div className="mod-card-sub">{r.UPCOMING} event • {r.SOLD} tiket terjual</div>
              <div className="mod-card-sub">Hampir habis {r.NEAR} • Sold out {r.SOLD_OUT}</div>
              <div className="mod-card-foot">
                <span>Terdekat {r.NEXTAT ? String(r.NEXTAT).slice(0, 10) : '-'}</span>
                {r.CITYCODE === sel && <span className="badge ok">Dipilih</span>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Event kategori terseleksi */}
      {sel && (
        <div style={{ marginTop: 8 }}>
          <h4 style={{ margin: '4px 0 8px' }}>Event: {rows.find((r) => r.CITYCODE === sel)?.CITYNAME || sel}</h4>
          {selErr && <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{selErr}</span></div>}
          <div className="mod-cards">
            {selLoading ? (
              <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
            ) : selEvents.length === 0 ? (
              <div className="card-body"><span className="loading-hint"><Icon name="empty" size={16} /> Belum ada event untuk kategori ini.</span></div>
            ) : selEvents.map((e) => (
              <EventCard key={e.EVENTID} e={e} onOpen={openEventDetail} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
