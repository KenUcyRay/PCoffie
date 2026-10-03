'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp, rpShort, tanggalPanjang, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfBadge, PfEmpty, PfLoading } from '@/components/portal/ui';

type TType = {
  TICKETTYPEID: number; NAME: string; DESCR?: string; PRICE: number;
  QUOTA: number; SOLD: number; LEFT: number | null; MAXPERSON: number; ISACTIVE: boolean;
};
type Promo = { PROMOID: number; CODE: string; DESCR?: string; DISCOUNT: number; DISCTYPE?: string; ENDDATE?: string };

export default function EventDetailClient({ initial, cities }: { initial: any | null; cities: { CITYCODE: string; CITYNAME: string }[] }) {
  const router = useRouter();
  const ev = initial?.event as any;
  const types = (initial?.types as TType[]) || [];
  const promos = (initial?.promos as Promo[]) || [];

  const [typeId, setTypeId] = useState<number>(types.find((t) => t.ISACTIVE && (t.LEFT === null || t.LEFT > 0))?.TICKETTYPEID || types[0]?.TICKETTYPEID || 0);
  const [qty, setQty] = useState(1);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState('');
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const chosen = useMemo(() => types.find((t) => t.TICKETTYPEID === typeId), [types, typeId]);
  const maxQty = Math.max(1, Math.min(
    chosen?.MAXPERSON && chosen.MAXPERSON > 0 ? chosen.MAXPERSON : 10,
    chosen?.LEFT !== null && chosen?.LEFT !== undefined ? chosen.LEFT : 10,
  ));

  const ensureLogin = async (): Promise<boolean> => {
    if (loggedIn !== null) return loggedIn;
    try {
      const me: any = await portalPost('portal/whoami', {});
      const ok = isOk(me);
      setLoggedIn(ok);
      return ok;
    } catch {
      setLoggedIn(false);
      return false;
    }
  };

  // Beli -> butuh login -> kembali ke event yang sama setelah masuk.
  const buy = async () => {
    setMsg('');
    setChecking(true);
    const ok = await ensureLogin();
    setChecking(false);
    if (!ok) {
      router.push(`/login/?next=${encodeURIComponent(`/events/${ev.EVENTID}`)}`);
      return;
    }
    router.push(`/checkout/?eventid=${ev.EVENTID}&typeid=${typeId}&qty=${qty}`);
  };

  if (!ev) {
    return (
      <PortalShell cities={cities}>
        <PfEmpty title="Event tidak ditemukan" hint="Event mungkin sudah berakhir atau belum dipublikasikan." action={<Link href={`/events`} className="pf-btn pf-btn-sm">Katalog event</Link>} />
      </PortalShell>
    );
  }

  return (
    <PortalShell cities={cities}>
      <div className="pf-col" style={{ gap: 14 }}>
        {ev.POSTER ? <img src={assetUrl(ev.POSTER)} alt={ev.TITLE} style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 16 }} /> : null}

        <div className="pf-card">
          <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
            <div className="pf-row pf-wrapx pf-gap-sm">
              {ev.CATNAME ? <PfBadge tone="accent">{ev.CATNAME}</PfBadge> : null}
              {ev.CITYNAME ? <PfBadge>{ev.CITYNAME}</PfBadge> : null}
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 850, letterSpacing: '-.02em', lineHeight: 1.2 }}>{ev.TITLE}</h1>
            <div className="pf-dim">{tanggalPanjang(ev.STARTAT)}{ev.STARTAT && ev.ENDAT ? ` · ${tanggalJam(ev.ENDAT)}` : ''}</div>
            <div className="pf-dim">
              {[ev.VENUE, ev.ADDRESS, ev.ORGNAME].filter(Boolean).map((x, i) => (
                <div key={i}>{x}</div>
              ))}
            </div>
            {ev.DESCR ? <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>{ev.DESCR}</div> : null}
            {ev.TERMS ? (
              <details style={{ fontSize: 13.5 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Syarat & ketentuan</summary>
                <div className="pf-dim" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{ev.TERMS}</div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="pf-card">
          <div className="pf-card-head">
            <span className="pf-card-title">Pilih tiket</span>
            {chosen ? <span className="pf-price">{rp(chosen.PRICE)}</span> : null}
          </div>
          <div className="pf-card-pad pf-col" style={{ gap: 12 }}>
            {types.length === 0 ? <PfEmpty title="Belum ada tiket tersedia" /> : null}

            {types.map((t) => {
              const soldOut = t.LEFT !== null && t.LEFT <= 0;
              const on = t.TICKETTYPEID === typeId;
              return (
                <label
                  key={t.TICKETTYPEID}
                  className="pf-card"
                  style={{
                    padding: 12, cursor: soldOut || !t.ISACTIVE ? 'not-allowed' : 'pointer',
                    borderColor: on ? 'var(--pf-accent)' : undefined,
                    boxShadow: on ? '0 0 0 2px var(--pf-accent-weak)' : undefined,
                    opacity: soldOut || !t.ISACTIVE ? .55 : 1,
                  }}
                >
                  <div className="pf-row-between">
                    <div className="pf-col" style={{ gap: 3 }}>
                      <input
                        type="radio"
                        name="type"
                        checked={on}
                        disabled={soldOut || !t.ISACTIVE}
                        onChange={() => { setTypeId(t.TICKETTYPEID); setQty(1); }}
                      />
                      <strong style={{ fontSize: 14.5 }}>{t.NAME}</strong>
                      {t.DESCR ? <span className="pf-tiny">{t.DESCR}</span> : null}
                    </div>
                    <div className="pf-col" style={{ alignItems: 'flex-end', gap: 4 }}>
                      <span className="pf-price">{rp(t.PRICE)}</span>
                      {soldOut
                        ? <PfBadge tone="danger">Habis</PfBadge>
                        : t.LEFT !== null
                          ? <PfBadge tone={t.LEFT <= 5 ? 'warn' : undefined}>Sisa {t.LEFT}</PfBadge>
                          : <PfBadge>Tanpa batas</PfBadge>}
                    </div>
                  </div>
                </label>
              );
            })}

            {chosen && !msg ? (
              <div className="pf-row pf-gap-sm pf-wrapx">
                <span className="pf-dim">Jumlah</span>
                <div className="pf-qty">
                  <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Kurangi">−</button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => setQty((n) => Math.min(maxQty, n + 1))} aria-label="Tambah">+</button>
                </div>
                <span className="pf-tiny">
                  Total {rp(chosen.PRICE * qty)}
                  {chosen.MAXPERSON > 0 ? ` · maks ${chosen.MAXPERSON}/orang` : ''}
                </span>
              </div>
            ) : null}

            {msg ? <div className="pf-alert pf-alert-error">{msg}</div> : null}

            <button className="pf-btn pf-btn-block" type="button" disabled={!chosen || checking} onClick={buy}>
              {checking ? 'Memeriksa…' : 'Beli Tiket'}
            </button>
            <span className="pf-tiny">Total akhir (termasuk biaya layanan & promo) dihitung di halaman checkout.</span>
          </div>
        </div>

        {promos.length > 0 && (
          <div className="pf-card">
            <div className="pf-card-head"><span className="pf-card-title">Promo untuk event ini</span></div>
            <div className="pf-card-pad pf-col" style={{ gap: 8 }}>
              {promos.map((p) => (
                <div key={p.PROMOID} className="pf-row-between">
                  <div className="pf-col" style={{ gap: 2 }}>
                    <strong style={{ fontSize: 14 }}>{p.CODE}</strong>
                    {p.DESCR ? <span className="pf-tiny">{p.DESCR}</span> : null}
                  </div>
                  <PfBadge tone="accent">
                    {String(p.DISCTYPE).toUpperCase() === 'PERSEN' ? `${Number(p.DISCOUNT)}%` : rpShort(p.DISCOUNT)}
                  </PfBadge>
                </div>
              ))}
              <span className="pf-tiny">Kode promo diisi di halaman checkout.</span>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}