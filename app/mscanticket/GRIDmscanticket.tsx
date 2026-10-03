// GRIDmscanticket — pilih event + kamera/manual + hasil besar + ringkasan.
// Kamera via html5-qrcode (npm); izin ditolak -> pesan jelas + fallback manual.
// Hasil: hijau VALID, kuning SUDAH_DIPAKAI, merah lainnya + getar/suara.
// Otomatis siap tiket berikutnya setelah beberapa detik.
//
// State: eventId, events, summary, scanning, manual, result, busy, err
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';
import * as proxy from './api';

export type GridApi = {
  refresh: () => void;
};

export type ScanEvent = {
  EVENTID: number;
  EVENTCODE?: string;
  TITLE?: string;
  STARTAT?: string;
  STATUS?: string;
};

type ScanResult = {
  RESULT: string;
  NAME?: string;
  TYPENAME?: string;
  TICKETCODE?: string;
  CHECKINTIME?: string;
  CHECKBY?: string;
};

// Bunyi pendek via WebAudio (getar + suara, aman bila tak didukung).
function beep(ok: boolean): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      (navigator as any).vibrate(ok ? 60 : [80, 60, 80]);
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.18);
    setTimeout(() => ctx.close(), 300);
  } catch { /* perangkat tanpa getar/suara: abaikan */ }
}

const RESULT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  VALID: { bg: 'var(--ok-soft)', fg: 'var(--ok)', label: 'VALID — silakan masuk' },
  SUDAH_DIPAKAI: { bg: '#fef3c7', fg: '#b45309', label: 'SUDAH DIPAKAI' },
};

const GRIDmscanticket = forwardRef<GridApi>(function GRIDmscanticket(_props, ref) {
  const { checkMenuAccess } = useAuth();
  const [eventId, setEventId] = useState<number | null>(null);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [scanning, setScanning] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resultOk, setResultOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [canUse, setCanUse] = useState(true);
  const qrRef = useRef<any>(null);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventRef = useRef<number | null>(null);
  eventRef.current = eventId;

  const loadEvents = useCallback(async () => {
    setErr('');
    try {
      const res: any = await proxy.read_events();
      if (parseBoolean(res?.success)) {
        const list = (res.Rows || []) as ScanEvent[];
        setEvents(list);
        // Otomatis pilih bila hanya ada satu event.
        if (list.length === 1) pickEvent(Number(list[0].EVENTID));
      } else setErr(res?.message || 'Gagal memuat event.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat event.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSummary = useCallback(async (ev: number | null) => {
    if (!ev) return;
    try {
      const res: any = await proxy.read_summary(ev);
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: halaman tetap jalan */ }
  }, []);

  const refresh = useCallback(() => {
    loadEvents();
    loadSummary(eventRef.current);
  }, [loadEvents, loadSummary]);

  const pickEvent = useCallback((ev: number | null) => {
    setEventId(ev);
    setResult(null);
    if (ev) loadSummary(ev);
    else setSummary({});
  }, [loadSummary]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    loadEvents();
    checkMenuAccess('40020002').then((ok) => setCanUse(ok)).catch(() => setCanUse(false));
    return () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
      stopCamera(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = async (silent = false) => {
    try {
      if (qrRef.current) {
        await qrRef.current.stop();
        qrRef.current.clear();
      }
    } catch { /* abaikan */ }
    qrRef.current = null;
    if (!silent) setScanning(false);
    else setScanning(false);
  };

  const startCamera = async () => {
    if (!eventId) { toast('Error', 'Pilih event dulu.', 'err'); return; }
    setCamErr('');
    setResult(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const qr = new Html5Qrcode('scan-region');
      qrRef.current = qr;
      setScanning(true);
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (text: string) => { void submitToken(text); },
        () => { /* frame tanpa QR: abaikan */ },
      );
    } catch (e: any) {
      setScanning(false);
      qrRef.current = null;
      const msg = /permission|denied|NotAllowed/i.test(String(e?.message || e))
        ? 'Izin kamera ditolak. Izinkan akses kamera di browser, atau pakai input manual di bawah.'
        : (e?.message || 'Kamera tidak tersedia. Pakai input manual di bawah.');
      setCamErr(msg);
    }
  };

  const submitToken = async (token: string) => {
    await stopCamera();
    await doScan({ TOKEN: token, METHOD: 'KAMERA' });
  };

  const submitManual = async () => {
    if (!manual.trim()) { toast('Error', 'Isi kode tiket dulu.', 'err'); return; }
    await doScan({ CODE: manual.trim(), METHOD: 'MANUAL' });
  };

  const doScan = async (payload: { TOKEN?: string; CODE?: string; METHOD: string }) => {
    const ev = eventRef.current;
    if (!ev) { toast('Error', 'Pilih event dulu.', 'err'); return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setResult({ RESULT: 'OFFLINE', TICKETCODE: payload.CODE });
      setResultOk(false);
      toast('Error', 'Koneksi terputus. Hasil belum diproses — jangan tandai manual sebelum ada jawaban server.', 'err');
      return;
    }
    setBusy(true);
    try {
      const res: any = await proxy.process_scan({ EVENTID: ev, ...payload });
      const row = (res?.Rows || [])[0] || {};
      const ok = parseBoolean(res?.success) && String(row.RESULT || '').toUpperCase() === 'VALID';
      setResult({
        RESULT: String(row.RESULT || 'TIDAK_VALID'),
        NAME: row.NAME, TYPENAME: row.TYPENAME, TICKETCODE: row.TICKETCODE,
        CHECKINTIME: row.CHECKINTIME, CHECKBY: row.CHECKBY,
      });
      setResultOk(ok);
      beep(ok);
      if (!ok) toast('Error', res?.message || 'Tiket ditolak.', 'err');
      loadSummary(ev);
      // Otomatis siap tiket berikutnya setelah 3 detik.
      if (readyTimer.current) clearTimeout(readyTimer.current);
      readyTimer.current = setTimeout(() => {
        setResult(null);
        setManual('');
      }, 3000);
    } catch (e: any) {
      setResult({ RESULT: 'ERROR', TICKETCODE: payload.CODE });
      setResultOk(false);
      toast('Error', e.message || 'Gagal menghubungi server.', 'err');
    } finally {
      setBusy(false);
    }
  };

  const style = RESULT_STYLE[result?.RESULT || ''] || { bg: 'var(--danger-soft)', fg: 'var(--danger)', label: result?.RESULT?.replace(/_/g, ' ') || '' };

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Event</span>
        <select value={eventId ?? ''} onChange={(e) => pickEvent(e.target.value ? Number(e.target.value) : null)} style={{ flex: 1, minWidth: 200 }}>
          <option value="">Pilih event</option>
          {events.map((e) => (
            <option key={e.EVENTID} value={e.EVENTID}>
              {e.TITLE} ({e.STATUS})
            </option>
          ))}
        </select>
        <Btn className="btn-sm" icon="refresh" onClick={() => refresh()}>Muat Ulang</Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => refresh()}>Coba lagi</Btn>
        </div>
      )}
      {!canUse && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>Anda tidak memiliki hak akses untuk membuka menu ini.</span>
        </div>
      )}
      {canUse && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-info"><b>{summary.MASUK ?? 0}/{summary.ELIGIBLE ?? 0}</b><span>Sudah masuk / berhak</span></span>
            </div>
            <div className="stat-card">
              <span className="stat-info"><b>{summary.ELIGIBLE ?? 0}</b><span>Total berhak masuk</span></span>
            </div>
          </div>
          {result && (
            <div
              role="status"
              style={{
                margin: '0 14px', padding: 18, borderRadius: 12, textAlign: 'center',
                background: style.bg, color: style.fg,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800 }}>{style.label}</div>
              {(result.NAME || result.TICKETCODE) && (
                <div style={{ fontSize: 16, marginTop: 6 }}>
                  <b>{result.NAME || '-'}</b>
                  {result.TYPENAME ? ` • ${result.TYPENAME}` : ''}
                  {result.TICKETCODE ? ` • ${result.TICKETCODE}` : ''}
                </div>
              )}
              {result.RESULT === 'SUDAH_DIPAKAI' && (result.CHECKINTIME || result.CHECKBY) && (
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Dipakai {result.CHECKINTIME || '-'} oleh {result.CHECKBY || '-'}
                </div>
              )}
            </div>
          )}
          <div className="card-body" style={{ gap: 10 }}>
            {!scanning ? (
              <Btn className="primary" icon="search" disabled={busy || !eventId} onClick={startCamera} style={{ minHeight: 48, fontSize: 15 }}>
                Buka Kamera
              </Btn>
            ) : (
              <>
                <div id="scan-region" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }} />
                <Btn icon="close" disabled={busy} onClick={() => stopCamera()}>Tutup Kamera</Btn>
              </>
            )}
            {camErr && (
              <div className="toast-err alert-inline">
                <Icon name="alertCircle" size={17} />
                <span>{camErr}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input" placeholder="Ketuk kode manual (cadangan)…"
                value={manual} onChange={(e) => setManual(e.target.value)}
                style={{ minHeight: 44, fontSize: 15 }}
              />
              <Btn className="primary" icon="check" disabled={busy || !eventId} onClick={submitManual} style={{ minHeight: 44 }}>
                {busy ? '…' : 'Cek'}
              </Btn>
            </div>
            <span className="loading-hint">Satu tangan: tombol besar di atas. Hasil otomatis siap tiket berikutnya.</span>
          </div>
        </>
      )}
    </div>
  );
});

export default GRIDmscanticket;
