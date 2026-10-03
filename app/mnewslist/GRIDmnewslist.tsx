// GRIDmnewslist — daftar berita (kartu) + filter + pencarian + urutan
// + paginasi, dan modal baca berita (tanpa menambah jumlah dibaca).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Btn, Icon } from '@/components/Icon';
import { Window } from '@/components/Window';
import { GridPager } from '@/components/DataTable';
import {
  DEFAULT_NEWS_FILTER, NEWS_STATUS_LABEL, formatTanggal, loadFilter, sanitizeNewsHtml,
  saveFilter, useNewsAccess, type NewsFilter,
} from './Cmnewslist';
import { setDetailEvent } from '../meventlist/Cmeventlist';
import * as proxy from './api';
import { newsImageUrl } from './api';

const PAGE_SIZE = 12;

export type GridApi = { refresh: () => void };

type Row = {
  NEWSID?: number; TITLE?: string; SLUG?: string; SUMMARY?: string; MAINIMAGE?: string;
  NEWSCATCODE?: string; CATNAME?: string; EVENTCATCODE?: string; EVENTID?: number | null;
  STATUS?: string; PUBLISHEDAT?: string; VIEWCOUNT?: number; AUTHORLOGIN?: string;
};

const GRIDmnewslist = forwardRef<GridApi>(function GRIDmnewslist(_props, ref) {
  const { open } = useModal();
  const [f, setF] = useState<NewsFilter>(() => loadFilter());
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [facets, setFacets] = useState<{ NEWS_CATS: { CODE: string; NAME: string }[]; EVENT_CATS: { CODE: string }[] }>(
    { NEWS_CATS: [], EVENT_CATS: [] },
  );
  const { canNews } = useNewsAccess();

  const loadFacets = useCallback(async () => {
    try {
      const res: any = await proxy.read_facets();
      if (parseBoolean(res?.success) && res.Rows?.[0]) {
        setFacets({ NEWS_CATS: res.Rows[0].NEWS_CATS || [], EVENT_CATS: res.Rows[0].EVENT_CATS || [] });
      }
    } catch { /* abaikan */ }
  }, []);

  const load = useCallback(async (next: NewsFilter) => {
    setLoading(true); setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: next.page * PAGE_SIZE,
        q: next.q, status: next.status, cat: next.cat, eventcat: next.ecat, sort: next.sort,
      });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
      } else setErr(res?.message || 'Gagal memuat berita.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat berita.');
    } finally { setLoading(false); }
  }, []);

  const apply = useCallback((next: NewsFilter) => {
    setF(next); saveFilter(next); load(next);
  }, [load]);

  const refresh = useCallback(() => { load(f); }, [load, f]);
  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => { loadFacets(); load(loadFilter()); /* eslint-disable-next-line */ }, []);

  const openDetail = useCallback((slug?: string) => {
    if (!slug) return;
    open(<NewsDetail slug={slug} canNews={canNews} />);
  }, [open, canNews]);

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
        <select value={f.status} onChange={(e) => apply({ ...f, status: e.target.value, page: 0 })}
          title="Status berita">
          <option value="TERBIT">Terbit</option>
          <option value="TERJADWAL">Terjadwal</option>
          <option value="DRAFT">Draft</option>
          <option value="DIARSIPKAN">Diarsipkan</option>
        </select>
        <select value={f.cat} onChange={(e) => apply({ ...f, cat: e.target.value, page: 0 })}>
          <option value="">Semua kategori berita</option>
          {facets.NEWS_CATS.map((c) => <option key={c.CODE} value={c.CODE}>{c.NAME}</option>)}
        </select>
        <select value={f.ecat} onChange={(e) => apply({ ...f, ecat: e.target.value, page: 0 })}>
          <option value="">Semua kategori event</option>
          {facets.EVENT_CATS.map((c) => <option key={c.CODE} value={c.CODE}>{c.CODE}</option>)}
        </select>
        <input className="input" placeholder="Cari judul/ringkasan" value={f.q}
          onChange={(e) => apply({ ...f, q: e.target.value, page: 0 })} style={{ flex: 1, minWidth: 160 }} />
        <select value={f.sort} onChange={(e) => apply({ ...f, sort: e.target.value, page: 0 })}>
          <option value="terbaru">Terbaru</option>
          <option value="terpopuler">Terpopuler (dibaca)</option>
        </select>
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
          <div className="card-body"><span className="loading-hint"><Icon name="empty" size={16} /> Belum ada berita untuk filter ini.</span></div>
        ) : rows.map((r) => (
          <button key={r.NEWSID} type="button" className="mod-card" onClick={() => openDetail(r.SLUG)}>
            <div className="mod-card-img" aria-hidden>
              {r.MAINIMAGE ? (
                <img src={newsImageUrl(r.MAINIMAGE)} alt={r.TITLE || 'gambar'} loading="lazy"
                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
              ) : <span className="mod-card-placeholder"><Icon name="layout" size={28} /></span>}
            </div>
            <div className="mod-card-body">
              <div className="mod-card-title">{r.TITLE || '-'}</div>
              <div className="mod-card-sub">{r.CATNAME || '-'} • {formatTanggal(r.PUBLISHEDAT)}</div>
              <div className="mod-card-sub">{r.SUMMARY || ''}</div>
              <div className="mod-card-foot">
                <span>Dibaca {r.VIEWCOUNT ?? 0}×</span>
                {r.STATUS !== 'TERBIT' && (
                  <span className="badge off">{NEWS_STATUS_LABEL[String(r.STATUS || '')] || r.STATUS}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <GridPager total={total} page={f.page} pageSize={PAGE_SIZE} onPage={(p) => apply({ ...f, page: p })} />
    </div>
  );
});

// Modal baca: isi disanitasi (aturan sama News Data), jumlah dibaca
// hanya ditampilkan — tidak calling hitView.
function NewsDetail({ slug, canNews }: { slug: string; canNews: boolean }) {
  const { close } = useModal();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const [cur, setCur] = useState(slug);
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res: any = await proxy.read_detail(cur);
      if (parseBoolean(res?.success)) setRow((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Berita tidak ditemukan.');
    } catch (e: any) { setErr(e.message || 'Gagal memuat.'); }
    finally { setLoading(false); }
  }, [cur]);

  useEffect(() => { load(); }, [load]);

  return (
    <Window
      title={row?.TITLE ? `Berita — ${row.TITLE}` : 'Baca Berita'}
      icon="layout"
      width="760px"
      footer={
        <>
          {canNews && row && (
            <Btn className="primary btn-sm" icon="edit"
              onClick={() => { openTab('/mnewsdata'); navigate('/mnewsdata'); }}>
              Ubah di News Data
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
          <div className="loading-hint">
            {NEWS_STATUS_LABEL[String(row.STATUS)] || row.STATUS} • {formatTanggal(row.PUBLISHEDAT)}
            {row.AUTHORLOGIN ? ` • oleh ${row.AUTHORLOGIN}` : ''}
          </div>
          {row.STATUS !== 'TERBIT' && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Pratinjau {NEWS_STATUS_LABEL[String(row.STATUS)] || row.STATUS} — belum tampil ke pembaca.</span>
            </div>
          )}
          {row.MAINIMAGE && (
            <div style={{ width: '100%', maxHeight: 320, overflow: 'hidden', borderRadius: 8, margin: '6px 0' }}>
              <img src={newsImageUrl(row.MAINIMAGE)} alt={row.TITLE || 'gambar'} loading="lazy"
                style={{ width: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          <div className="news-body"
            dangerouslySetInnerHTML={{ __html: sanitizeNewsHtml(row.BODY) }} />
          <div className="loading-hint">
            Dibaca {row.VIEWCOUNT ?? 0}× (hanya ditampilkan, tidak bertambah saat dibaca di Discovery).
          </div>

          {row.EVENT && (
            <div className="toolbar" style={{ marginTop: 8 }}>
              <Icon name="layout" size={14} />
              <span>
                Event terkait: <b>{row.EVENT.TITLE}</b> ({formatTanggal(row.EVENT.STARTAT)}).{' '}
                <a href="#" onClick={(e) => {
                  e.preventDefault();
                  setDetailEvent(Number(row.EVENT.EVENTID));
                  openTab('/meventlist'); navigate('/meventlist');
                }}>Buka di Event List</a>
              </span>
            </div>
          )}

          {Array.isArray(row.RELATED) && row.RELATED.length > 0 && (
            <>
              <div className="loading-hint" style={{ marginTop: 8 }}>Berita terkait</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {row.RELATED.map((r: any) => (
                  <li key={r.NEWSID}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setCur(r.SLUG); }}>
                      {r.TITLE}
                    </a>{' '}
                    <span className="loading-hint">({formatTanggal(r.PUBLISHEDAT)})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}
    </Window>
  );
}

export default GRIDmnewslist;