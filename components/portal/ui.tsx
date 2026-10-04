'use client';

// =============================================================================
// KOMPONEN DASAR PORTAL PEMBELI
// -----------------------------------------------------------------------------
// Satu tempat untuk semua bagian UI yang dipakai berulang di portal:
// tombol, badge, form, kartu event/produk, skeleton, state kosong/error,
// modal, sheet, toast, tabel, langkah, dan reveal saat scroll.
//
// Aturan: komponen di sini hanya mengatur TAMPILAN dan struktur markup.
// Pemanggilan API, validasi, dan alur tetap di halaman masing-masing.
// =============================================================================

import Link from 'next/link';
import {
  useCallback, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { assetUrl, isOk, portalPost } from '@/lib/portal/api';
import { rpShort, tanggalPendek } from '@/lib/portal/format';
import PfIcon, { type PfIconName } from './PfIcon';

/* ============================================================== TOMBOL ==== */

type PfButtonProps = {
  variant?: 'primary' | 'ghost' | 'soft' | 'quiet' | 'danger' | 'dangerGhost';
  size?: 'sm' | 'md' | 'lg';
  icon?: PfIconName;
  iconRight?: PfIconName;
  block?: boolean;
  busy?: boolean;
  /** Teks yang tampil saat busy. Default: "Memuat…". */
  busyLabel?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function PfButton({
  variant, size, icon, iconRight, block, busy, busyLabel = 'Memuat…',
  children, className = '', disabled, ...rest
}: PfButtonProps) {
  const cls = [
    'pf-btn',
    variant ? `pf-btn-${variant}` : '',
    size && size !== 'md' ? `pf-btn-${size}` : '',
    block ? 'pf-btn-block' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      disabled={disabled || busy}
      data-busy={busy ? 'true' : undefined}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy
        ? <PfIcon name="refresh" size={size === 'lg' ? 20 : 16} className="pf-spin" />
        : icon ? <PfIcon name={icon} size={size === 'sm' ? 16 : 20} /> : null}
      <span>{busy ? busyLabel : children}</span>
      {!busy && iconRight ? <PfIcon name={iconRight} size={size === 'sm' ? 16 : 20} /> : null}
    </button>
  );
}

/* =============================================================== BADGE ==== */

export type PfTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';

export function PfBadge({
  children, tone, icon, size,
}: { children: ReactNode; tone?: PfTone; icon?: PfIconName; size?: 'lg' }) {
  const cls = ['pf-badge', tone && tone !== 'neutral' ? `pf-badge-${tone}` : '', size === 'lg' ? 'pf-badge-lg' : '']
    .filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {icon ? <PfIcon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}

/* ================================================================ FORM ==== */

export function PfField({
  label, required, hint, error, children, htmlFor, className = '',
}: {
  label?: string; required?: boolean; hint?: string; error?: string;
  children: ReactNode; htmlFor?: string; className?: string;
}) {
  return (
    <div className={`pf-field${error ? ' is-invalid' : ''} ${className}`.trim()}>
      {label ? (
        <label className="pf-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="pf-req" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="pf-error-text" role="alert">
          <PfIcon name="alert" size={16} />
          {error}
        </span>
      ) : hint ? (
        <span className="pf-hint">{hint}</span>
      ) : null}
    </div>
  );
}

/** Select dengan ikon panah yang konsisten (bukan hacks gradient CSS). */
export function PfSelectWrap({ children, ...rest }: { children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="pf-select-wrap">
      <select className="pf-select" {...rest}>{children}</select>
      <PfIcon name="chevronDown" size={20} className="pf-select-caret" />
    </span>
  );
}

export function PfLabeledSelect({
  label, value, onChange, options, required, hint, id, className = '',
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; hint?: string; id?: string; className?: string;
}) {
  const auto = useId();
  const fid = id || auto;
  return (
    <PfField label={label} required={required} hint={hint} htmlFor={fid} className={className}>
      <PfSelectWrap id={fid} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </PfSelectWrap>
    </PfField>
  );
}

/** Pengatur jumlah dengan tombol tambah/kurang yang nyaman disentuh. */
export function PfQty({
  value, min = 1, max = 10, onChange, label = 'Jumlah',
}: { value: number; min?: number; max?: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="pf-qty" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        aria-label="Kurangi jumlah">
        <PfIcon name="minus" size={20} />
      </button>
      <span aria-live="polite" aria-label={`${label}: ${value}`}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        aria-label="Tambah jumlah">
        <PfIcon name="plus" size={20} />
      </button>
    </div>
  );
}

/* ======================================================== STATE & SKELETON = */

export function PfSkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="pf-skel-card" aria-hidden="true">
      <div className="pf-skel pf-skel-media" />
      <div className="pf-skel-card-body">
        <div className="pf-skel pf-skel-title" style={{ width: '82%' }} />
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="pf-skel pf-skel-text" style={{ width: `${58 + i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Placeholder yang bentuknya meniru isi asli (bukan spinner besar). */
export function PfLoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="pf-grid pf-grid-auto" aria-busy="true" aria-live="polite">
      <span className="pf-sr">Memuat…</span>
      {Array.from({ length: count }).map((_, i) => <PfSkeletonCard key={i} />)}
    </div>
  );
}

export function PfLoading({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="pf-row pf-gap-sm pf-muted pf-sm pf-center" aria-busy="true" aria-live="polite"
      style={{ padding: 'var(--pf-s4) 0' }}>
      <PfIcon name="refresh" size={20} className="pf-spin" />
      {label}
    </div>
  );
}

export function PfState({
  icon = 'info', tone, title, text, action,
}: { icon?: PfIconName; tone?: 'ok' | 'danger' | 'accent'; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="pf-state">
      <div className={`pf-state-icon${tone ? ` is-${tone}` : ''}`}>
        <PfIcon name={icon} size={24} />
      </div>
      <div className="pf-state-title">{title}</div>
      {text ? <p className="pf-state-text">{text}</p> : null}
      {action ? <div className="pf-state-action">{action}</div> : null}
    </div>
  );
}

export function PfEmpty({
  title = 'Belum ada data', hint, action, icon = 'box',
}: { title?: string; hint?: string; action?: ReactNode; icon?: PfIconName }) {
  return <PfState icon={icon} title={title} text={hint} action={action} />;
}

export function PfError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <PfState
      icon="alert"
      tone="danger"
      title="Gagal memuat"
      text={message || 'Terjadi kesalahan. Silakan coba lagi.'}
      action={onRetry ? <PfButton variant="ghost" size="sm" icon="refresh" onClick={onRetry}>Coba lagi</PfButton> : undefined}
    />
  );
}

export function PfAlert({
  tone = 'info', children, icon,
}: { tone?: 'info' | 'ok' | 'warn' | 'error'; children: ReactNode; icon?: PfIconName }) {
  const ic = icon || (tone === 'error' ? 'alert' : tone === 'ok' ? 'checkCircle' : tone === 'warn' ? 'alert' : 'info');
  return (
    <div className={`pf-alert pf-alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <PfIcon name={ic} size={20} />
      <span>{children}</span>
    </div>
  );
}

/* ============================================================== KARTU ===== */

export type PortalEvent = {
  EVENTID: number; TITLE: string; SUMMARY?: string; SLUG?: string;
  CATCODE?: string; CITYCODE?: string; VENUE?: string; ADDRESS?: string;
  STARTAT?: string; ENDAT?: string; POSTER?: string; ORGNAME?: string;
  MINPRICE?: number; MAXPRICE?: number;
};

export function PfEventCard({ ev, badge }: { ev: PortalEvent; badge?: ReactNode }) {
  return (
    <Link href={`/events/${ev.EVENTID}`} className="pf-card pf-card-link pf-col">
      <div className="pf-ev-media">
        {ev.POSTER
          ? <img src={assetUrl(ev.POSTER)} alt="" loading="lazy" width={640} height={400} />
          : <div className="pf-ev-media-empty"><PfIcon name="photo" size={24} /></div>}
        {badge ? <div className="pf-ev-tag">{badge}</div> : null}
      </div>
      <div className="pf-ev-body pf-grow">
        <h3 className="pf-ev-title pf-clamp-2">{ev.TITLE}</h3>
        <div className="pf-ev-meta">
          <span className="pf-ev-meta-row">
            <PfIcon name="calendar" size={16} />
            <span>{tanggalPendek(ev.STARTAT)}</span>
          </span>
          {ev.VENUE ? (
            <span className="pf-ev-meta-row">
              <PfIcon name="location" size={16} />
              <span>{ev.VENUE}</span>
            </span>
          ) : null}
        </div>
        <div className="pf-ev-foot">
          <span className="pf-price">{rpShort(ev.MINPRICE)}</span>
          {ev.ORGNAME ? <span className="pf-ev-foot-org">{ev.ORGNAME}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export type PortalProduct = {
  PRODUCTID: number; NAME: string; CATEGORYNAME?: string; PICTURE?: string;
  PRICE?: number; STOCK?: number; SELLERID?: number; SELLERNAME?: string;
  DESCRIPTION?: string; ACTIVE?: string;
};

export function PfProductCard({
  p, action,
}: { p: PortalProduct; action?: ReactNode }) {
  const out = Number(p.STOCK || 0) <= 0;
  return (
    <div className="pf-card pf-col">
      <div className="pf-pr-media">
        {p.PICTURE
          ? <img src={assetUrl(p.PICTURE)} alt="" loading="lazy" width={400} height={400} />
          : <div className="pf-pr-media-empty"><PfIcon name="package" size={24} /></div>}
      </div>
      <div className="pf-pr-body pf-grow">
        <h3 className="pf-pr-title pf-clamp-2">{p.NAME}</h3>
        {p.CATEGORYNAME ? <span className="pf-pr-cat">{p.CATEGORYNAME}</span> : null}
        <div className="pf-pr-foot">
          <span className="pf-price" style={{ fontSize: 'var(--pf-fs-body)' }}>{rpShort(p.PRICE)}</span>
          {action ?? (
            <span className={`pf-pr-stock ${out ? '' : 'pf-muted'}`}>
              {out ? <PfBadge tone="danger">Stok habis</PfBadge> : <span className="pf-muted">Stok {p.STOCK}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================= SEKSI ===== */

export function PfSection({
  title, sub, action, children, id,
}: { title: string; sub?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="pf-section" id={id}>
      <div className="pf-section-head">
        <div className="pf-col pf-gap-xs">
          <h2 className="pf-section-title">{title}</h2>
          {sub ? <p className="pf-section-sub">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PfCrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="pf-crumbs" aria-label="Jejak navigasi">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="pf-row pf-gap-xs">
          {i > 0 ? <PfIcon name="chevronRight" size={16} className="pf-crumbs-sep" /> : null}
          {it.href
            ? <Link href={it.href}>{it.label}</Link>
            : <span className="pf-crumbs-current" aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ============================================================ REVEAL ====== */

/** Muncul perlahan saat elemen masuk viewport. Hormati "kurangi gerakan". */
export function PfReveal({
  children, delay = 0, className = '', as: As = 'div',
}: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' | 'li' | 'article' }) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <As
      ref={ref as never}
      className={`pf-reveal${seen ? ' is-in' : ''} ${className}`.trim()}
      data-stagger={delay ? '' : undefined}
      style={delay ? ({ '--pf-stagger': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </As>
  );
}

/* ============================================================= MODAL ====== */

/** Modal dengan fokus terkunci, tombol Escape, dan klik di luar. */
export function PfModal({
  open, onClose, title, children, footer, labelledBy,
}: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode; labelledBy?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const auto = useId();
  const titleId = labelledBy || `pfmodal-${auto}`;

  // Kunci gulir latar + fokus di dalam modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = box.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!f || f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    // Fokus masuk ke modal: coba kontrol pertama, kalau tidak ada fokus ke
    // dialog-nya sendiri (tabIndex -1) supaya fokus tetap di dalam modal.
    const t = window.setTimeout(() => {
      const el = box.current;
      if (!el) return;
      const first = el.querySelector<HTMLElement>(
        '[data-autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      );
      (first || el).focus();
    }, 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box} tabIndex={-1}>
        <div className="pf-modal-head">
          <h2 className="pf-modal-title" id={titleId}>{title}</h2>
          <button type="button" className="pf-iconbtn" onClick={onClose} aria-label="Tutup">
            <PfIcon name="close" size={20} />
          </button>
        </div>
        <div className="pf-modal-body">{children}</div>
        {footer ? <div className="pf-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Panel bawah untuk ponsel (filter, menu). */
export function PfSheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pf-overlay" style={{ alignItems: 'flex-end', padding: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pf-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="pf-sheet-grip" aria-hidden="true" />
        <div className="pf-sheet-head">
          <h2 className="pf-modal-title">{title}</h2>
          <button type="button" className="pf-iconbtn" onClick={onClose} aria-label="Tutup">
            <PfIcon name="close" size={20} />
          </button>
        </div>
        <div className="pf-sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================= TOAST ====== */

export type PfToastItem = { id: number; text: string; tone?: 'ok' | 'error' | 'info' };

export function PfToasts({ items, onClose }: { items: PfToastItem[]; onClose: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="pf-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`pf-toast${t.tone ? ` is-${t.tone}` : ''}`}>
          <PfIcon name={t.tone === 'error' ? 'alert' : t.tone === 'ok' ? 'checkCircle' : 'info'} size={20} />
          <span>{t.text}</span>
          <button type="button" className="pf-toast-close" onClick={() => onClose(t.id)} aria-label="Tutup notifikasi">
            <PfIcon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Toast minimal untuk satu halaman: panggil toast('Tersimpan') lalu hilang sendiri. */
export function useToast() {
  const [items, setItems] = useState<PfToastItem[]>([]);
  const push = useCallback((text: string, tone?: 'ok' | 'error' | 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    window.setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200);
  }, []);
  const close = useCallback((id: number) => setItems((s) => s.filter((x) => x.id !== id)), []);
  const node = <PfToasts items={items} onClose={close} />;
  return { toast: push, toastNode: node };
}

/* ============================================================== HOOK ====== */

/** Pemanggil data sisi klien dengan loading/kosong/error + tombol coba lagi. */
export function usePortalData<T = any>(
  path: string,
  body: Record<string, unknown>,
  deps: React.DependencyList = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setError('');
    portalPost(path, body, { auth: body.__auth !== false })
      .then((r) => {
        if (stop) return;
        if (isOk(r)) setData(r as T);
        else setError(String(r?.message || 'Permintaan ditolak.'));
      })
      .catch((e) => { if (!stop) setError(e?.message || 'Gagal terhubung ke server.'); })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload: () => setTick((n) => n + 1) };
}