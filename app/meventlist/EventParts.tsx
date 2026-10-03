// Komponen kartu event + modal detail. Dipakai bersama Event List,
// Event by Category, dan Event by City agar rumus/tampilan identik.
import { useCallback, useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { FLAG_LABEL, EVENT_STATUS_LABEL, TYPE_STATUS_LABEL, formatVentRp, formatVentTgl } from './Cmeventlist';
import * as proxy from './api';
import { posterUrl } from './api';

export type EventRow = {
  EVENTID?: number; EVENTCODE?: string; SLUG?: string; TITLE?: string;
  CATCODE?: string; CATNAME?: string; CITYCODE?: string; CITYNAME?: string; CITYPROV?: string;
  VENUE?: string; ADDRESS?: string; STARTAT?: string; ENDAT?: string;
  POSTER?: string; ORGNAME?: string; STATUS?: string;
  QUOTA?: number; SOLD?: number; REMAIN?: number; FLAG?: string | null;
  MINPRICE?: string; MAXPRICE?: string;
};

export function badgeFor(flag?: string | null): string {
  if (flag === 'SOLD_OUT') return 'err';
  if (flag === 'HAMPIR_HABIS') return 'warn';
  return 'ok';
}

// Kartu poster + judul + info ringkas.
export function EventCard({ e, onOpen }: { e: EventRow; onOpen: (e: EventRow) => void }) {
  const publishedLabel = EVENT_STATUS_LABEL[String(e.STATUS || '').toUpperCase()] || e.STATUS || '';
  return (
    <button type="button" className="mod-card" onClick={() => onOpen(e)}>
      <div className="mod-card-img" aria-hidden>
        {e.POSTER ? (
          <img src={posterUrl(e.POSTER)} alt={e.TITLE || 'poster'} loading="lazy"
            onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <span className="mod-card-placeholder"><Icon name="layout" size={28} /></span>
        )}
      </div>
      <div className="mod-card-body">
        <div className="mod-card-title">{e.TITLE || '-'}</div>
        <div className="mod-card-sub">{e.CATNAME || '-'} • {e.CITYNAME || '-'}</div>
        <div className="mod-card-sub">{e.VENUE || '-'} • {formatVentTgl(e.STARTAT, false)}</div>
        <div className="mod-card-foot">
          <span>Mulai {formatVentRp(e.MINPRICE)}</span>
          <span className={`badge ${badgeFor(e.FLAG)}`}>{e.FLAG ? FLAG_LABEL[e.FLAG] || e.FLAG : 'Tersedia'}</span>
        </div>
        {e.STATUS && e.STATUS !== 'PUBLISHED' && (
          <div className="mod-card-sub"><span className="badge off">{publishedLabel}</span></div>
        )}
      </div>
    </button>
  );
}

// Modal detail event: poster besar, info lengkap, tipe tiket, promo.
export function EventDetailModal({ event, canManageEvent, canManageAttendees, goto }: {
  event: EventRow; canManageEvent: boolean; canManageAttendees: boolean;
  goto: (mc: string, payload?: number) => void;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res: any = await proxy.read_detail(Number(event.EVENTID));
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Event tidak ditemukan.');
    } catch (e: any) { setErr(e.message || 'Gagal memuat detail.'); }
    finally { setLoading(false); }
  }, [event.EVENTID]);

  useEffect(() => { load(); }, [load]);

  const d = detail || event;
  const types: any[] = Array.isArray(d?.TYPES) ? d.TYPES : [];

  return (
    <Window
      title={`Detail ${d?.TITLE || ''}`}
      icon="layout"
      width="760px"
      footer={
        <>
          {canManageEvent && (
            <Btn className="primary btn-sm" icon="edit" onClick={() => goto('meventdata', Number(event.EVENTID))}>Kelola Event</Btn>
          )}
          {canManageAttendees && (
            <Btn className="btn-sm" icon="users" onClick={() => goto('mattendee', Number(event.EVENTID))}>Lihat Peserta</Btn>
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
      ) : detail ? (
        <>
          <div className="toolbar" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 160, height: 110, flex: 'none', overflow: 'hidden', borderRadius: 8, background: 'var(--surface-2)' }}>
              {detail.POSTER ? (
                <img src={posterUrl(detail.POSTER)} alt="poster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : <span className="mod-card-placeholder" style={{ display: 'flex', height: '100%' }}><Icon name="layout" size={28} /></span>}
            </div>
            <div>
              <h3 style={{ margin: 0 }}>{detail.TITLE}</h3>
              <div className="loading-hint">{detail.CATNAME} • {detail.CITYNAME}{detail.CITYPROV ? `, ${detail.CITYPROV}` : ''}</div>
              <div className="loading-hint">{formatVentTgl(detail.STARTAT)} — {formatVentTgl(detail.ENDAT)} {detail.CITYTZ ? `(${detail.CITYTZ})` : ''}</div>
              <div className="loading-hint">{detail.VENUE}{detail.ADDRESS ? `, ${detail.ADDRESS}` : ''}</div>
              <div className="loading-hint">Oleh {detail.ORGNAME || '-'}</div>
              {detail.STATUS && detail.STATUS !== 'PUBLISHED' && (
                <div className="loading-hint"><span className="badge off">{EVENT_STATUS_LABEL[String(detail.STATUS).toUpperCase()] || detail.STATUS}</span></div>
              )}
            </div>
          </div>

          <FrmSet legend="Tiket" icon="ticket" columns={1}>
            {types.length === 0 ? (
              <div className="loading-hint">Belum ada tipe tiket.</div>
            ) : types.map((t: any) => (
              <FrmRow key={t.TICKETTYPEID} label={`${t.NAME} — ${formatVentRp(t.PRICE)}`}>
                <div>
                  <div className="progress" aria-hidden>
                    <div className="progress-bar" style={{ width: `${Math.min(100, Math.round(((Number(t.SOLD) || 0) / Math.max(1, Number(t.QUOTA) || 1)) * 100))}%` }} />
                  </div>
                  <div className="loading-hint">
                    Terjual {t.SOLD}/{t.QUOTA} • Sisa {t.REMAIN} • <b>{TYPE_STATUS_LABEL[t.STATUS] || t.STATUS}</b>
                  </div>
                  {t.DESCR && <div className="loading-hint">{t.DESCR}</div>}
                </div>
              </FrmRow>
            ))}
          </FrmSet>

          {Array.isArray(detail.PROMOS) && detail.PROMOS.length > 0 && (
            <FrmSet legend="Promo berlaku" icon="cash" columns={1}>
              {detail.PROMOS.map((p: any) => (
                <FrmRow key={p.PROMOID} label={p.PROMOCODE}>
                  <div className="loading-hint">
                    {p.DISCTYPE === 'PERSEN' ? `Diskon ${p.DISCVALUE}%${p.MAXDISC ? ` (maks ${formatVentRp(p.MAXDISC)})` : ''}` : `Diskon ${formatVentRp(p.DISCVALUE)}`}
                    {' '}• min beli {formatVentRp(p.MINPURCHASE)} • kuota tersisa {p.REMAIN === null ? '∞' : p.REMAIN}
                  </div>
                  {p.DESCR && <div className="loading-hint">{p.DESCR}</div>}
                </FrmRow>
              ))}
            </FrmSet>
          )}

          {detail.DESCR && (
            <FrmSet legend="Deskripsi" icon="form" columns={1}>
              <div style={{ whiteSpace: 'pre-wrap' }} className="loading-hint">{detail.DESCR}</div>
            </FrmSet>
          )}
          {detail.TERMS && (
            <FrmSet legend="Syarat & ketentuan" icon="alertCircle" columns={1}>
              <div style={{ whiteSpace: 'pre-wrap' }} className="loading-hint">{detail.TERMS}</div>
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}
