// Inbox pesan milik user (ikon lonceng di header + banner DARURAT).
// Dipakai DUA layout tanpa mengubah bagian lain:
//   - mode standard: <InboxBell variant="tab" /> di tabbar (Shells.tsx)
//   - mode desktop: <InboxBell variant="tray" /> di tray (OsDesktop.tsx)
//   - banner: <UrgentBanner /> di atas konten kedua shell.
// Identitas selalu dari sesi (VUSERLOGIN backend), bukan parameter.
// Tanpa hak akses menu (milik tiap user yang login).
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost, parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from './Icon';

const SEGMENT = 'home/cpmessageinbox/cpmessageinbox';

// Event agar banner "Lihat" bisa membuka panel inbox terdekat.
const OPEN_EVENT = 'appcore:inbox-open';

async function inboxCount() {
  return apiPost(SEGMENT, { method: 'read_unread_count' });
}

async function inboxList(opts: { limit?: number; offset?: number; q?: string; unread_only?: boolean } = {}) {
  return apiPost(SEGMENT, {
    method: 'read_data',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    unread_only: opts.unread_only ? 'YES' : undefined,
  });
}

async function inboxRead(msgid: number) {
  return apiPost(SEGMENT, {
    method: 'mark_read',
    vdata: JSON.stringify({ MSGID: msgid }),
  });
}

async function inboxReadAll() {
  return apiPost(SEGMENT, { method: 'mark_all_read' });
}

// Format datetime ke lokal Indonesia lengkap dengan detik.
export function formatTanggalInbox(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export type InboxMsg = {
  MSGID: number;
  TITLE?: string;
  BODY?: string;
  PRIORITY?: string;
  SENTAT?: string;
  EXPIRESAT?: string;
  SENDERLOGIN?: string;
  READSTATUS?: string;
  READTIME?: string;
};

function snippet(body?: string): string {
  const s = String(body || '').replace(/\s+/g, ' ').trim();
  return s.length > 80 ? s.slice(0, 80) + '…' : s || '-';
}

// Daftar + detail pesan (dipakai kedua varian panel).
function InboxList({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<InboxMsg[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<InboxMsg | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await inboxList({ limit: 20, unread_only: onlyUnread });
      if (parseBoolean(res?.success)) {
        setItems(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
      } else setErr(res?.message || 'Gagal memuat pesan.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat pesan.');
    } finally {
      setLoading(false);
    }
  }, [onlyUnread]);

  useEffect(() => { load(); }, [load]);

  const openMsg = useCallback(async (m: InboxMsg) => {
    setSel(m);
    if (String(m.READSTATUS || '').toUpperCase() !== 'DIBACA') {
      try {
        const res: any = await inboxRead(Number(m.MSGID));
        if (parseBoolean(res?.success)) {
          setItems((prev) => prev.map((x) => (x.MSGID === m.MSGID ? { ...x, READSTATUS: 'DIBACA' } : x)));
          onChanged();
        }
      } catch { /* tetap tampil walau tandai gagal */ }
    }
  }, [onChanged]);

  const readAll = useCallback(async () => {
    try {
      const res: any = await inboxReadAll();
      if (parseBoolean(res?.success)) {
        setItems((prev) => prev.map((x) => ({ ...x, READSTATUS: 'DIBACA' })));
        onChanged();
      }
    } catch { /* abaikan */ }
  }, [onChanged]);

  if (sel) {
    return (
      <div>
        <button type="button" className="dropdown-item with-icon" onClick={() => setSel(null)}>
          <Icon name="chevR" size={14} style={{ transform: 'scaleX(-1)' }} /><span>Kembali</span>
        </button>
        <div style={{ padding: '4px 11px 10px' }}>
          <p><b>{sel.TITLE}</b> <span className={`badge ${sel.PRIORITY === 'DARURAT' ? 'err' : sel.PRIORITY === 'PENTING' ? '' : 'ok'}`}>{sel.PRIORITY}</span></p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{sel.BODY}</p>
          <p className="loading-hint">{sel.SENDERLOGIN || '-'} • {formatTanggalInbox(sel.SENTAT)}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="drop-head">
        <b>Pesan Masuk{total > 0 ? ` (${total})` : ''}</b>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="loading-hint" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Belum dibaca
          </label>
          <button type="button" className="drop-link" onClick={readAll}>Tandai semua dibaca</button>
        </span>
      </div>
      {loading && <p className="empty-hint"><Icon name="refresh" size={16} /> Memuat…</p>}
      {!loading && err && (
        <p className="empty-hint">
          <Icon name="alertCircle" size={16} /> {err}{' '}
          <button type="button" className="drop-link" onClick={() => load()}>Coba lagi</button>
        </p>
      )}
      {!loading && !err && items.length === 0 && (
        <p className="empty-hint"><Icon name="mail" size={16} /> Tidak ada pesan.</p>
      )}
      {!loading && !err && items.map((m) => {
        const unread = String(m.READSTATUS || '').toUpperCase() !== 'DIBACA';
        return (
          <button
            key={m.MSGID} type="button" role="menuitem"
            className="dropdown-item with-icon" onClick={() => openMsg(m)}
            style={unread ? { fontWeight: 700 } : undefined}
          >
            <Icon name="mail" size={15} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{m.TITLE}</b>{' '}
              <span className={`badge ${m.PRIORITY === 'DARURAT' ? 'err' : m.PRIORITY === 'PENTING' ? '' : 'ok'}`}>{m.PRIORITY}</span>
              <small style={{ display: 'block', fontWeight: 400 }}>{snippet(m.BODY)}</small>
              <small className="loading-hint" style={{ fontWeight: 400 }}>{formatTanggalInbox(m.SENTAT)}</small>
            </span>
            {unread && <span className="badge err">Baru</span>}
          </button>
        );
      })}
    </div>
  );
}

// Ikon lonceng + angka belum dibaca + panel. Polling 60 detik, berhenti
// saat tab tidak aktif (document.hidden) atau belum login.
export function InboxBell({ variant }: { variant: 'tab' | 'tray' }) {
  const { status } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const authed = status === 'authenticated';

  const refresh = useCallback(async () => {
    if (!authed || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const res: any = await inboxCount();
      if (parseBoolean(res?.success)) setUnread(Number((res.Rows || [])[0]?.UNREAD) || 0);
    } catch { /* badge gagal: biarkan angka lama */ }
  }, [authed]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    const onVis = () => { if (!document.hidden) refresh(); };
    const onOpen = () => setOpen(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [refresh]);

  if (!authed) return null;

  const badge = unread > 0 && (
    variant === 'tray'
      ? <span className="os-badge">{unread > 9 ? '9+' : unread}</span>
      : <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {unread > 9 ? '9+' : unread}
      </span>
  );

  if (variant === 'tray') {
    return (
      <>
        <button
          type="button"
          className="os-traybtn"
          aria-label="Pesan masuk"
          onClick={() => setOpen((v) => !v)}
          style={{ position: 'relative' }}
        >
          <Icon name="mail" size={17} />
          {badge}
        </button>
        {open && (
          <div className="os-panel" role="menu" aria-label="Pesan masuk" style={{ width: 340 }}>
            <InboxList onChanged={refresh} />
          </div>
        )}
      </>
    );
  }

  return (
    <span style={{ position: 'relative', marginLeft: 'auto', display: 'inline-flex' }}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Pesan masuk"
        title="Pesan masuk"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="mail" size={18} />
        {badge}
      </button>
      {open && (
        <div className="dropdown down" role="menu" aria-label="Pesan masuk" style={{ minWidth: 320, maxWidth: 360 }}>
          <InboxList onChanged={refresh} />
        </div>
      )}
    </span>
  );
}

// Spanduk DARURAT belum dibaca — tampil di atas konten semua layout sampai dibaca.
export function UrgentBanner() {
  const { status } = useAuth();
  const [urgent, setUrgent] = useState(0);
  const authed = status === 'authenticated';

  const refresh = useCallback(async () => {
    if (!authed || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const res: any = await inboxCount();
      if (parseBoolean(res?.success)) setUrgent(Number((res.Rows || [])[0]?.URGENT) || 0);
    } catch { /* abaikan */ }
  }, [authed]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  if (!authed || urgent <= 0) return null;

  return (
    <div className="toast-err alert-inline" style={{ margin: '8px 12px 0' }} role="alert">
      <Icon name="alertCircle" size={17} />
      <span><b>{urgent} pesan DARURAT</b> belum dibaca. Segera baca pesan penting Anda.</span>
      <Btn
        className="btn-sm" icon="mail"
        onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      >
        Lihat
      </Btn>
    </div>
  );
}
