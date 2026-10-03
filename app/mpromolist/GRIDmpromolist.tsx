// GRIDmpromolist — kartu ringkasan status promo, filter, daftar promo
// (kode, nilai diskon, masa berlaku, kuota, cakupan) + modal detail.
// Hanya baca: tidak ada tombol pakai/simpan promo.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Btn, Icon } from '@/components/Icon';
import { Window } from '@/components/Window';
import { GridPager } from '@/components/DataTable';
import { DISPLAY_LABEL, formatNilai, formatKuota } from '../mpromocode/Cmpromocode';
import {
  DEFAULT_PROMO_FILTER, formatPromoTgl, loadFilter, promoBadge, saveFilter,
  usePromoAccess, type PromoFilter,
} from './Cmpromolist';
import * as proxy from './api';

const PAGE_SIZE = 12;

export type GridApi = { refresh: () => void };

type PromoRow = {
  PROMOID?: number; PROMOCODE?: string; DESCR?: string; DISCTYPE?: string; DISCVALUE?: string;
  MAXDISC?: string | null; MINPURCHASE?: string | null; QUOTA?: number | null; MAXPERBUYER?: number | null;
  STARTAT?: string | null; ENDAT?: string | null; SCOPETYPE?: string; ISACTIVE?: string;
  USEDCOUNT?: number; REMAIN?: number | null; DISPLAYSTATUS?: string;
  SCOPES?: { TARGETTYPE: string; TARGETCODE: string; TARGETNAME?: string }[];
};

type Summary = { BERLAKU: number; AKAN_DATANG: number; KEDALUWARSA: number; KUOTA_HABIS: number; NONAKTIF: number; TOTAL: number };

const GRIDmpromolist = forwardRef<GridApi>(function GRIDmpromolist(_props, ref) {
  const { open } = useModal();
  const [f, setF] = useState<PromoFilter>(() => loadFilter());
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [sumErr, setSumErr] = useState('');
  const { canPromo } = usePromoAccess();

  const loadSummary = useCallback(async () => {
    setSumErr('');
    try {
      const res: any = await proxy.read_summary();
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || null);
      else setSumErr(res?.message || 'Gagal memuat ringkasan promo.');
    } catch (e: any) {
      setSumErr(e.message || 'Gagal memuat ringkasan promo.');
    }
  }, []);

  const load = useCallback(async (next: PromoFilter) => {
    setLoading(true); setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: next.page * PAGE_SIZE, q: next.q, status: next.status,
        disctype: next.disctype, scopetype: next.scopetype, sort: next.sort,
      });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
      } else setErr(res?.message || 'Gagal memuat promo.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat promo.');
    } finally { setLoading(false); }
  }, []);

  const apply = useCallback((next: PromoFilter) => {
    setF(next); saveFilter(next); load(next);
  }, [load]);

  const refresh = useCallback(() => { loadSummary(); load(f); }, [load, loadSummary, f]);
  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => { loadSummary(); load(loadFilter()); /* eslint-disable-next-line */ }, []);

  const openDetail = useCallback((promoid?: number) => {
    if (!promoid) return;
    open(<PromoDetail promoid={promoid} canPromo={canPromo} />);
  }, [open, canPromo]);

  const cards: { key: keyof Summary; label: string; status: string }[] = [
    { key: 'BERLAKU', label: 'Berlaku', status: 'BERLAKU' },
    { key: 'AKAN_DATANG', label: 'Akan datang', status: 'AKAN_DATANG' },
    { key: 'KUOTA_HABIS', label: 'Kuota habis', status: 'KUOTA_HABIS' },
    { key: 'KEDALUWARSA', label: 'Kedaluwarsa', status: 'KEDALUWARSA' },
  ];

  return (
    <div className="grid-box">
      {/* Ringkasan per status; klik = filter status tersebut. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
        {cards.map((c) => (
          <button key={c.key} type="button"
            className={`card ${f.status === c.status ? 'mod-card-active' : ''}`}
            style={{ textAlign: 'left', cursor: 'pointer' }}
            onClick={() => apply({ ...f, status: f.status === c.status ? 'PUBLIK' : c.status, page: 0 })}>
            <div className="loading-hint">{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{summary ? summary[c.key] : '-'}</div>
          </button>
        ))}
      </div>
      {sumErr && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{sumErr}</span>
          <Btn className="btn-sm" icon="refresh" onClick={loadSummary}>Coba lagi</Btn>
        </div>
      )}

      {/* Filter */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
        <input className="input" placeholder="Cari kode/deskripsi" value={f.q}
          onChange={(e) => apply({ ...f, q: e.target.value, page: 0 })} style={{ flex: 1, minWidth: 160 }} />
        <select value={f.status} onChange={(e) => apply({ ...f, status: e.target.value, page: 0 })} title="Status promo">
          <option value="PUBLIK">Bisa dipakai (berlaku + akan datang)</option>
          <option value="BERLAKU">Berlaku</option>
          <option value="AKAN_DATANG">Akan datang</option>
          <option value="KUOTA_HABIS">Kuota habis</option>
          <option value="KEDALUWARSA">Kedaluwarsa</option>
          <option value="NONAKTIF">Nonaktif (pratinjau)</option>
        </select>
        <select value={f.disctype} onChange={(e) => apply({ ...f, disctype: e.target.value, page: 0 })}>
          <option value="">Semua jenis diskon</option>
          <option value="PERSEN">Persen</option>
          <option value="NOMINAL">Nominal</option>
        </select>
        <select value={f.scopetype} onChange={(e) => apply({ ...f, scopetype: e.target.value, page: 0 })}>
          <option value="">Semua cakupan</option>
          <option value="SEMUA">Semua event</option>
          <option value="KATEGORI">Per kategori</option>
          <option value="EVENT">Per event</option>
        </select>
        <select value={f.sort} onChange={(e) => apply({ ...f, sort: e.target.value, page: 0 })}>
          <option value="terbaru">Paling baru</option>
          <option value="terpopuler">Paling banyak dipakai</option>
          <option value="berakhir">Segera berakhir</option>
          <option value="kuota">Kuota terkecil</option>
          <option value="kode">Kode promo</option>
        </select>
        <Btn className="btn-sm" icon="refresh" onClick={() => apply({ ...DEFAULT_PROMO_FILTER })}>Reset</Btn>
      </div>

      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load(f)}>Coba lagi</Btn>
        </div>
      )}

      <div className="mod-cards" style={{ marginTop: 8 }}>
        {loading ? (
          <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
        ) : rows.length === 0 ? (
          <div className="card-body"><span className="loading-hint"><Icon name="empty" size={16} /> Belum ada promo untuk filter ini.</span></div>
        ) : rows.map((r) => (
          <button key={r.PROMOID} type="button" className="mod-card" onClick={() => openDetail(r.PROMOID)}>
            <div className="mod-card-body">
              <div className="mod-card-title">{r.PROMOCODE || '-'}</div>
              <div className="mod-card-sub">{formatNilai(r)} • min. belanja {formatNilai({ DISCTYPE: 'NOMINAL', DISCVALUE: r.MINPURCHASE })}</div>
              <div className="mod-card-sub">{formatPromoTgl(r.STARTAT)} — {r.ENDAT ? formatPromoTgl(r.ENDAT) : 'tanpa batas'}</div>
              <div className="mod-card-sub">{r.DESCR || ''}</div>
              <div className="mod-card-foot">
                <span>Kuota {formatKuota(r)}</span>
                <span className={`badge ${promoBadge(r.DISPLAYSTATUS)}`}>
                  {DISPLAY_LABEL[String(r.DISPLAYSTATUS || '')] || r.DISPLAYSTATUS || '-'}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <GridPager total={total} page={f.page} pageSize={PAGE_SIZE} onPage={(p) => apply({ ...f, page: p })} />
    </div>
  );
});

// Detail promo: nilai, masa berlaku, kuota terpakai, cakupan (baca saja).
function PromoDetail({ promoid, canPromo }: { promoid: number; canPromo: boolean }) {
  const { close } = useModal();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const [row, setRow] = useState<PromoRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res: any = await proxy.read_detail(promoid);
      if (parseBoolean(res?.success)) setRow((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Promo tidak ditemukan.');
    } catch (e: any) { setErr(e.message || 'Gagal memuat detail.'); }
    finally { setLoading(false); }
  }, [promoid]);

  useEffect(() => { load(); }, [load]);

  const used = Number(row?.USEDCOUNT) || 0;
  const quota = row?.QUOTA ?? null;
  const pct = quota && quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  return (
    <Window
      title={`Promo ${row?.PROMOCODE || ''}`}
      icon="ticket"
      width="620px"
      footer={
        <>
          {canPromo && (
            <Btn className="primary btn-sm" icon="edit"
              onClick={() => { openTab('/mpromocode'); navigate('/mpromocode'); }}>
              Kelola Promo
            </Btn>
          )}
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      {loading ? (
        <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={load}>Coba lagi</Btn>
        </div>
      ) : row ? (
        <>
          <div className="toolbar" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 150 }}>
              <h3 style={{ margin: 0 }}>{row.PROMOCODE}</h3>
              <div className="loading-hint">{formatNilai(row)}</div>
            </div>
            <span className={`badge ${promoBadge(row.DISPLAYSTATUS)}`}>
              {DISPLAY_LABEL[String(row.DISPLAYSTATUS || '')] || row.DISPLAYSTATUS}
            </span>
          </div>
          {row.DESCR && <div className="loading-hint">{row.DESCR}</div>}
          <div className="loading-hint">
            Berlaku {formatPromoTgl(row.STARTAT)} — {row.ENDAT ? formatPromoTgl(row.ENDAT) : 'tanpa batas akhir'}
          </div>
          <div className="loading-hint">
            Min. belanja {formatNilai({ DISCTYPE: 'NOMINAL', DISCVALUE: row.MINPURCHASE })}
            {row.MAXPERBUYER ? ` • maks ${row.MAXPERBUYER}× per pembeli` : ''}
          </div>
          {row.DISCTYPE === 'PERSEN' && row.MAXDISC && (
            <div className="loading-hint">Potongan maksimal {formatNilai({ DISCTYPE: 'NOMINAL', DISCVALUE: row.MAXDISC })}</div>
          )}
          <div className="loading-hint">
            Kuota {formatKuota(row)}
            {quota && quota > 0 ? ` (${pct}%)` : ''}
          </div>
          <div className="loading-hint">
            Cakupan: {String(row.SCOPETYPE || 'SEMUA').toUpperCase()}
            {Array.isArray(row.SCOPES) && row.SCOPES.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {row.SCOPES.map((s) => (
                  <li key={`${s.TARGETTYPE}-${s.TARGETCODE}`}>
                    {s.TARGETTYPE}: {s.TARGETNAME || s.TARGETCODE}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {row.DISPLAYSTATUS !== 'BERLAKU' && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Promo ini belum bisa dipakai (status: {DISPLAY_LABEL[String(row.DISPLAYSTATUS)] || row.DISPLAYSTATUS}).</span>
            </div>
          )}
          <div className="loading-hint" style={{ marginTop: 8 }}>
            Halaman ini hanya menampilkan informasi promo; tidak ada pemakaian atau pencatatan di sini.
          </div>
        </>
      ) : null}
    </Window>
  );
}

export default GRIDmpromolist;