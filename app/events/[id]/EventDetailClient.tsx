'use client';

// =============================================================================
// DETAIL EVENT
// -----------------------------------------------------------------------------
// Poster, informasi inti (tanggal/jam/lokasi/penyelenggara), pemilih tipe
// tiket, dan bilah beli yang menempel di bawah layar ponsel.
// Panggilan API, pemilihan tipe, dan alur "beli -> login -> checkout" tetap sama.
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rp, rpShort, tanggalPanjang, tanggalJam } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon, { type PfIconName } from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfEmpty, PfQty,
} from '@/components/portal/ui';

type TType = {
  TICKETTYPEID: number; NAME: string; DESCR?: string; PRICE: number;
  QUOTA: number; SOLD: number; LEFT: number | null; MAXPERSON: number; ISACTIVE: boolean;
};
type Promo = { PROMOID: number; CODE: string; DESCR?: string; DISCOUNT: number; DISCTYPE?: string; ENDDATE?: string };

function InfoBox({ icon, label, value }: { icon: PfIconName; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="pf-infobox">
      <span className="pf-infobox-ico"><PfIcon name={icon} size={20} /></span>
      <span className="pf-infobox-body">
        <span className="pf-infobox-label">{label}</span>
        <span className="pf-infobox-value">{value}</span>
      </span>
    </div>
  );
}

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
        <div className="pf-card">
          <PfEmpty
            icon="search"
            title="Event tidak ditemukan"
            hint="Event mungkin sudah berakhir atau belum dipublikasikan."
            action={<PfButton icon="arrowLeft" onClick={() => router.push('/events')}>Katalog event</PfButton>}
          />
        </div>
      </PortalShell>
    );
  }

  const soldOutAll = types.length === 0 || types.every((t) => (t.LEFT !== null && t.LEFT <= 0) || !t.ISACTIVE);

  return (
    <PortalShell cities={cities}>
      <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Event', href: '/events' }, { label: ev.TITLE }]} />

      <div className="pf-col pf-gap-lg">
        {/* ---------------------------------------------------------- poster */}
        <div className="pf-card pf-rise">
          <div className="pf-ev-media" style={{ aspectRatio: '21 / 9' }}>
            {ev.POSTER ? (
              <img src={assetUrl(ev.POSTER)} alt={ev.TITLE} width={1200} height={514} />
            ) : (
              <div className="pf-ev-media-empty"><PfIcon name="photo" size={24} /></div>
            )}
            <div className="pf-ev-tag">
              {ev.CATNAME ? <PfBadge tone="accent">{ev.CATNAME}</PfBadge> : null}
              {ev.CITYNAME ? <PfBadge>{ev.CITYNAME}</PfBadge> : null}
              {soldOutAll ? <PfBadge tone="danger">Tiket habis</PfBadge> : null}
            </div>
          </div>

          <div className="pf-card-pad pf-col pf-gap-md">
            <h1 className="pf-display">{ev.TITLE}</h1>

            <div className="pf-infogrid">
              <InfoBox icon="calendar" label="Tanggal" value={tanggalPanjang(ev.STARTAT)} />
              <InfoBox icon="clock" label="Waktu" value={ev.STARTAT ? tanggalJam(ev.STARTAT).split(' ').slice(-1)[0] : undefined} />
              <InfoBox icon="location" label="Lokasi" value={ev.VENUE} />
              <InfoBox icon="locationCheck" label="Alamat" value={ev.ADDRESS} />
              <InfoBox icon="building" label="Penyelenggara" value={ev.ORGNAME} />
            </div>

            {ev.DESCR ? <p className="pf-body" style={{ lineHeight: 1.6 }}>{ev.DESCR}</p> : null}

            {ev.TERMS ? (
              <details className="pf-panel">
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 'var(--pf-fs-sm)' }}>
                  Syarat &amp; ketentuan
                </summary>
                <div className="pf-sm pf-dim" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{ev.TERMS}</div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="pf-columns">
          {/* ------------------------------------------------ pilih tiket */}
          <div className="pf-col pf-gap-md">
            <section className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="ticket" size={20} /> Pilih tiket</span>
                {chosen ? <span className="pf-price">{rp(chosen.PRICE)}</span> : null}
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                {types.length === 0 ? <PfEmpty icon="ticket" title="Belum ada tiket tersedia" /> : null}

                {types.map((t) => {
                  const soldOut = t.LEFT !== null && t.LEFT <= 0;
                  const off = soldOut || !t.ISACTIVE;
                  const on = t.TICKETTYPEID === typeId;
                  return (
                    <label key={t.TICKETTYPEID} className={`pf-choice${on ? ' is-active' : ''}`}>
                      <input
                        type="radio"
                        name="type"
                        checked={on}
                        disabled={off}
                        aria-label={`Pilih tipe tiket ${t.NAME}`}
                        onChange={() => { setTypeId(t.TICKETTYPEID); setQty(1); }}
                      />
                      <span className="pf-choice-body">
                        <span className="pf-choice-name">{t.NAME}</span>
                        {t.DESCR ? <span className="pf-choice-desc">{t.DESCR}</span> : null}
                        {t.MAXPERSON > 0 ? (
                          <span className="pf-choice-desc">Maks {t.MAXPERSON} tiket per orang</span>
                        ) : null}
                      </span>
                      <span className="pf-choice-side">
                        <span className="pf-price">{rp(t.PRICE)}</span>
                        {!t.ISACTIVE ? <PfBadge>Tidak aktif</PfBadge>
                          : soldOut ? <PfBadge tone="danger">Habis</PfBadge>
                          : t.LEFT !== null ? <PfBadge tone={t.LEFT <= 5 ? 'warn' : 'ok'}>Sisa {t.LEFT}</PfBadge>
                          : <PfBadge>Tanpa batas</PfBadge>}
                      </span>
                    </label>
                  );
                })}

                {chosen && !msg ? (
                  <div className="pf-row-between pf-wrapx pf-gap-sm">
                    <span className="pf-sm pf-strong">Jumlah tiket</span>
                    <PfQty value={qty} max={maxQty} onChange={setQty} />
                  </div>
                ) : null}

                {msg ? <PfAlert tone="error">{msg}</PfAlert> : null}

                <p className="pf-tiny">
                  Total akhir (termasuk biaya layanan &amp; promo) dihitung di halaman checkout.
                </p>
              </div>
            </section>

            {promos.length > 0 ? (
              <section className="pf-card">
                <div className="pf-card-head">
                  <span className="pf-card-title"><PfIcon name="discount" size={20} /> Promo untuk event ini</span>
                </div>
                <div className="pf-card-pad pf-col pf-gap-sm">
                  {promos.map((p) => (
                    <div key={p.PROMOID} className="pf-row-between">
                      <span className="pf-col pf-gap-xs" style={{ minWidth: 0 }}>
                        <strong className="pf-mono" style={{ fontSize: 'var(--pf-fs-body)' }}>{p.CODE}</strong>
                        {p.DESCR ? <span className="pf-tiny">{p.DESCR}</span> : null}
                      </span>
                      <PfBadge tone="accent">
                        {String(p.DISCTYPE).toUpperCase() === 'PERSEN' ? `${Number(p.DISCOUNT)}%` : rpShort(p.DISCOUNT)}
                      </PfBadge>
                    </div>
                  ))}
                  <span className="pf-tiny">Kode promo diisi di halaman checkout.</span>
                </div>
              </section>
            ) : null}
          </div>

          {/* --------------------------------------------- ringkasan (desktop) */}
          <aside className="pf-columns-aside pf-hide-mobile">
            <div className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title"><PfIcon name="receipt" size={20} /> Ringkasan</span>
              </div>
              <div className="pf-card-pad pf-col pf-gap-md">
                <div className="pf-sum">
                  <div className="pf-sum-row"><dt>{chosen ? chosen.NAME : 'Pilih tiket'}</dt><dd>{rp(chosen ? chosen.PRICE * qty : 0)}</dd></div>
                  <div className="pf-sum-row"><dt>Jumlah</dt><dd>{qty}</dd></div>
                  <div className="pf-sum-total">
                    <dt>Total</dt>
                    <dd className="pf-price pf-price-lg">{rp(chosen ? chosen.PRICE * qty : 0)}</dd>
                  </div>
                </div>
                <PfButton block size="lg" icon="ticket" disabled={!chosen || checking || soldOutAll}
                  busy={checking} busyLabel="Memeriksa…" onClick={buy}>
                  Beli tiket
                </PfButton>
                <span className="pf-tiny">Harga final termasuk biaya layanan &amp; promo dihitung saat checkout.</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Bilah beli menempel di bawah pada ponsel. */}
      <div className="pf-actionbar pf-only-mobile">
        <div className="pf-actionbar-total">
          <span className="pf-tiny">{chosen ? `${chosen.NAME} × ${qty}` : 'Pilih tiket'}</span>
          <strong>{rp(chosen ? chosen.PRICE * qty : 0)}</strong>
        </div>
        <PfButton size="lg" icon="ticket" disabled={!chosen || checking || soldOutAll}
          busy={checking} busyLabel="Memeriksa…" onClick={buy}>
          Beli tiket
        </PfButton>
      </div>
    </PortalShell>
  );
}