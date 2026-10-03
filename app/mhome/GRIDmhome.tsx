// GRIDmhome — beranda Discovery: banner, ringkasan angka, event terdekat/
// terlaris, berita terbaru, promo aktif. Tiap bagian punya status
// loading/ kosong/ error sendiri; satu bagian gagal tidak mematikan yang lain.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Btn, Icon } from '@/components/Icon';
import { formatRp, formatTanggal, SUMMARY_LABEL, useManageAccess } from './Cmhome';
import { setDetailEvent } from '../meventlist/Cmeventlist';
import { posterUrl } from '../meventlist/api';
import { newsImageUrl } from '../mnewslist/api';
import { DISPLAY_LABEL, formatNilai, formatKuota } from '../mpromocode/Cmpromocode';
import { promoBadge } from '../mpromolist/Cmpromolist';
import * as proxy from './api';

export type GridApi = { refresh: () => void };

type Banner = { CAMPAIGNID: number; TITLE: string; BANNER?: string; HREF?: string };

type HomeEvent = {
  EVENTID?: number; TITLE?: string; STARTAT?: string; ENDAT?: string; POSTER?: string;
  VENUE?: string; CATNAME?: string; CITYNAME?: string; SOLD?: number; QUOTA?: number; MINPRICE?: string;
};

// Pembungkus status satu bagian: loading / kosong / error / isi.
function Section({ title, loading, err, empty, onRetry, children, action }: {
  title: string; loading: boolean; err: string; empty: boolean;
  onRetry: () => void; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span className="loading-hint" style={{ fontWeight: 600 }}>{title}</span>
        {action}
      </div>
      {loading ? (
        <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={onRetry}>Coba lagi</Btn>
        </div>
      ) : empty ? (
        <div className="card-body"><span className="loading-hint"><Icon name="empty" size={16} /> Belum ada data.</span></div>
      ) : children}
    </div>
  );
}

const GRIDmhome = forwardRef<GridApi>(function GRIDmhome(_props, ref) {
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const access = useManageAccess();

  const [banners, setBanners] = useState<Banner[]>([]);
  const [sum, setSum] = useState<Record<string, number> | null>(null);
  const [near, setNear] = useState<HomeEvent[]>([]);
  const [hot, setHot] = useState<HomeEvent[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [st, setSt] = useState({ banner: 'L', sum: 'L', events: 'L', news: 'L', promos: 'L' });
  const [er, setEr] = useState({ banner: '', sum: '', events: '', news: '', promos: '' });

  const load = useCallback(async () => {
    // Setiap bagian dimuat terpisah: kegagalan satu tidak menggagalkan yang lain.
    proxy.read_banner('HOME_TOP', 3).then((res: any) => {
      if (parseBoolean(res?.success)) { setBanners(res.Rows || []); setSt((s) => ({ ...s, banner: 'D' })); }
      else { setEr((e) => ({ ...e, banner: res?.message || 'Gagal memuat banner.' })); setSt((s) => ({ ...s, banner: 'E' })); }
    }).catch((e: any) => { setEr((x) => ({ ...x, banner: e.message || 'Gagal memuat banner.' })); setSt((s) => ({ ...s, banner: 'E' })); });

    proxy.read_summary().then((res: any) => {
      if (parseBoolean(res?.success)) { setSum((res.Rows || [])[0] || null); setSt((s) => ({ ...s, sum: 'D' })); }
      else { setEr((x) => ({ ...x, sum: res?.message || 'Gagal memuat ringkasan.' })); setSt((s) => ({ ...s, sum: 'E' })); }
    }).catch((e: any) => { setEr((x) => ({ ...x, sum: e.message || 'Gagal memuat ringkasan.' })); setSt((s) => ({ ...s, sum: 'E' })); });

    proxy.read_events(6).then((res: any) => {
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        setNear(row.NEAR || []); setHot(row.HOT || []);
      } else { setEr((x) => ({ ...x, events: res?.message || 'Gagal memuat event.' })); setSt((s) => ({ ...s, events: 'E' })); return; }
      setSt((s) => ({ ...s, events: 'D' }));
    }).catch((e: any) => { setEr((x) => ({ ...x, events: e.message || 'Gagal memuat event.' })); setSt((s) => ({ ...s, events: 'E' })); });

    proxy.read_news(4).then((res: any) => {
      if (parseBoolean(res?.success)) { setNews(res.Rows || []); setSt((s) => ({ ...s, news: 'D' })); }
      else { setEr((x) => ({ ...x, news: res?.message || 'Gagal memuat berita.' })); setSt((s) => ({ ...s, news: 'E' })); }
    }).catch((e: any) => { setEr((x) => ({ ...x, news: e.message || 'Gagal memuat berita.' })); setSt((s) => ({ ...s, news: 'E' })); });

    proxy.read_promos(4).then((res: any) => {
      if (parseBoolean(res?.success)) { setPromos(res.Rows || []); setSt((s) => ({ ...s, promos: 'D' })); }
      else { setEr((x) => ({ ...x, promos: res?.message || 'Gagal memuat promo.' })); setSt((s) => ({ ...s, promos: 'E' })); }
    }).catch((e: any) => { setEr((x) => ({ ...x, promos: e.message || 'Gagal memuat promo.' })); setSt((s) => ({ ...s, promos: 'E' })); });
  }, []);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);
  useEffect(() => { load(); }, [load]);

  const goto = useCallback((mc: string, eventid?: number) => {
    if (eventid) setDetailEvent(eventid);
    openTab('/' + mc);
    navigate('/' + mc);
  }, [openTab, navigate]);

  const manage = [
    { show: access.canEvent, mc: 'meventdata', label: 'Kelola Event' },
    { show: access.canCategory, mc: 'cpeventcategory', label: 'Kelola Kategori' },
    { show: access.canCity, mc: 'cpcity', label: 'Kelola Kota' },
    { show: access.canNews, mc: 'mnewsdata', label: 'Kelola Berita' },
    { show: access.canPromo, mc: 'mpromocode', label: 'Kelola Promo' },
  ].filter((m) => m.show);

  return (
    <div className="grid-box" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Banner */}
      <Section
        title="Banner"
        loading={st.banner === 'L'}
        err={er.banner}
        empty={banners.length === 0}
        onRetry={load}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '0 8px 8px' }}>
          {banners.map((b) => (
            <a key={b.CAMPAIGNID} href={b.HREF || '#'} target="_blank" rel="noreferrer noopener"
              style={{ textDecoration: 'none', color: 'inherit' }}>
              {b.BANNER ? (
                <img src={b.BANNER} alt={b.TITLE} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="mod-card" style={{ padding: 12 }}>
                  <div className="mod-card-title">{b.TITLE}</div>
                  <div className="mod-card-sub">Klik untuk membuka tujuan banner</div>
                </div>
              )}
            </a>
          ))}
        </div>
      </Section>

      {/* Ringkasan angka */}
      <Section
        title="Ringkasan"
        loading={st.sum === 'L'}
        err={er.sum}
        empty={!sum}
        onRetry={load}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '0 8px 8px' }}>
          {SUMMARY_LABEL.map((s) => (
            <div key={s.key} className="toolbar" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <Icon name={s.icon as any} size={20} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{sum?.[s.key] ?? 0}</div>
                <div className="loading-hint">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Event terdekat */}
        <Section
          title="Event terdekat"
          loading={st.events === 'L'}
          err={er.events}
          empty={near.length === 0}
          onRetry={load}
          action={<Btn className="btn-sm" icon="arrowR" onClick={() => goto('meventlist')}>Event List</Btn>}
        >
          <div style={{ padding: '0 8px 8px' }}>
            {near.map((e) => (
              <button key={e.EVENTID} type="button" className="mod-card"
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', marginBottom: 8 }}
                onClick={() => goto('meventlist', Number(e.EVENTID))}>
                <span style={{ width: 64, height: 64, flex: 'none', borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)' }}>
                  {e.POSTER ? (
                    <img src={posterUrl(e.POSTER)} alt={e.TITLE || 'poster'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : <span className="mod-card-placeholder" style={{ display: 'flex', height: '100%' }}><Icon name="layout" size={20} /></span>}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="mod-card-title">{e.TITLE || '-'}</span>
                  <span className="mod-card-sub">{formatTanggal(e.STARTAT)} • {e.CITYNAME || '-'} • {e.CATNAME || '-'}</span>
                  <span className="mod-card-sub">Mulai {formatRp(e.MINPRICE)} • terjual {e.SOLD ?? 0}/{e.QUOTA ?? 0}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Event terlaris */}
        <Section
          title="Paling laris"
          loading={st.events === 'L'}
          err={er.events}
          empty={hot.length === 0}
          onRetry={load}
        >
          <div style={{ padding: '0 8px 8px' }}>
            {hot.map((e, i) => (
              <button key={e.EVENTID} type="button" className="mod-card"
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', marginBottom: 8 }}
                onClick={() => goto('meventlist', Number(e.EVENTID))}>
                <span style={{ width: 28, fontWeight: 700, textAlign: 'center' }}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="mod-card-title">{e.TITLE || '-'}</span>
                  <span className="mod-card-sub">{formatTanggal(e.STARTAT)} • terjual {e.SOLD ?? 0} dari {e.QUOTA ?? 0}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Berita terbaru */}
        <Section
          title="Berita terbaru"
          loading={st.news === 'L'}
          err={er.news}
          empty={news.length === 0}
          onRetry={load}
          action={<Btn className="btn-sm" icon="arrowR" onClick={() => goto('mnewslist')}>News List</Btn>}
        >
          <div style={{ padding: '0 8px 8px' }}>
            {news.map((n) => (
              <button key={n.NEWSID} type="button" className="mod-card"
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', marginBottom: 8 }}
                onClick={() => goto('mnewslist')}>
                <span style={{ width: 64, height: 48, flex: 'none', borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)' }}>
                  {n.MAINIMAGE ? (
                    <img src={newsImageUrl(n.MAINIMAGE)} alt={n.TITLE || 'gambar'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : <span className="mod-card-placeholder" style={{ display: 'flex', height: '100%' }}><Icon name="mail" size={18} /></span>}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="mod-card-title">{n.TITLE || '-'}</span>
                  <span className="mod-card-sub">{n.CATNAME || '-'} • {formatTanggal(n.PUBLISHEDAT)} • dibaca {n.VIEWCOUNT ?? 0}×</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Promo aktif */}
        <Section
          title="Promo tersedia"
          loading={st.promos === 'L'}
          err={er.promos}
          empty={promos.length === 0}
          onRetry={load}
          action={<Btn className="btn-sm" icon="arrowR" onClick={() => goto('mpromolist')}>Promo List</Btn>}
        >
          <div style={{ padding: '0 8px 8px' }}>
            {promos.map((p) => (
              <button key={p.PROMOID} type="button" className="mod-card"
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', marginBottom: 8 }}
                onClick={() => goto('mpromolist')}>
                <span style={{ minWidth: 0 }}>
                  <span className="mod-card-title">{p.PROMOCODE} — {formatNilai(p)}</span>
                  <span className="mod-card-sub">{p.DESCR || ''}</span>
                  <span className="mod-card-foot">
                    <span>Kuota {formatKuota(p)}</span>
                    <span className={`badge ${promoBadge(p.DISPLAYSTATUS)}`}>
                      {DISPLAY_LABEL[String(p.DISPLAYSTATUS || '')] || p.DISPLAYSTATUS}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>

      {/* Pintasan halaman Discovery + pengelola */}
      <div className="card">
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="loading-hint" style={{ fontWeight: 600 }}>Pintasan</span>
          <Btn className="btn-sm" icon="layout" onClick={() => goto('meventlist')}>Event List</Btn>
          <Btn className="btn-sm" icon="layout" onClick={() => goto('meventcategory')}>Event by Category</Btn>
          <Btn className="btn-sm" icon="layout" onClick={() => goto('meventcity')}>Event by City</Btn>
          <Btn className="btn-sm" icon="mail" onClick={() => goto('mnewslist')}>News List</Btn>
          <Btn className="btn-sm" icon="ticket" onClick={() => goto('mpromolist')}>Promo List</Btn>
          {manage.map((m) => (
            <Btn key={m.mc} className="btn-sm" icon="edit" onClick={() => goto(m.mc)}>{m.label}</Btn>
          ))}
        </div>
      </div>
    </div>
  );
});

export default GRIDmhome;