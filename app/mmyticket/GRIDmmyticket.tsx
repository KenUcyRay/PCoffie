// GRIDmmyticket — ringkasan + tabel tiket + modal tiket (QR, unduh,
// kirim ulang, buat ulang QR, batalkan). Pakai komponen DataTable.
//
// State: eventId, events, rows, filters, sort, page, total, loading, err, summary, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import { formatTanggal } from './Cmyticket';
import * as proxy from './api';
import * as eventProxy from '../meventdata/api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type TicketRow = {
  ATTENDEEID?: number;
  EVENTID?: number;
  EVENTTITLE?: string;
  EVENTSTATUS?: string;
  TICKETTYPEID?: number;
  TYPENAME?: string;
  NAME?: string;
  EMAIL?: string;
  PHONE?: string;
  TICKETCODE?: string;
  PAYSTATUS?: string;
  ATTENDSTATUS?: string;
  CHECKINTIME?: string;
  TIKETSTATUS?: string;
  QRVERSION?: number | string;
  LASTSENTAT?: string;
  REGDATE?: string;
};

export type EventOpt = {
  EVENTID: number;
  EVENTCODE?: string;
  TITLE?: string;
  STATUS?: string;
};

export type GridApi = {
  refresh: () => void;
};

function badge(s: string, ok: string): string {
  return String(s || '').toUpperCase() === ok ? 'ok' : '';
}

function buildColumns(h: { onView: (r: TicketRow) => void }): Column<TicketRow>[] {
  return [
    noColumn,
    { key: 'TICKETCODE', label: 'Kode Tiket', width: 130, sortable: true },
    { key: 'NAME', label: 'Nama', width: 150, sortable: true },
    { key: 'EVENTTITLE', label: 'Event', width: 170, filter: false },
    { key: 'TYPENAME', label: 'Tipe', width: 100, filter: false },
    {
      key: 'PAYSTATUS', label: 'Bayar', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'BELUM_BAYAR', label: 'BELUM_BAYAR' }, { value: 'LUNAS', label: 'LUNAS' },
        { value: 'REFUND', label: 'REFUND' },
      ] as any,
      render: (r) => {
        const s = String(r.PAYSTATUS || '').toUpperCase();
        return <span className={`badge ${s === 'LUNAS' ? 'ok' : s === 'REFUND' ? 'err' : ''}`}>{s || '-'}</span>;
      },
    },
    {
      key: 'ATTENDSTATUS', label: 'Hadir', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'BELUM_HADIR', label: 'BELUM_HADIR' }, { value: 'HADIR', label: 'HADIR' },
      ] as any,
      render: (r) => {
        const s = String(r.ATTENDSTATUS || '').toUpperCase();
        return <span className={`badge ${s === 'HADIR' ? 'ok' : ''}`}>{s || '-'}</span>;
      },
    },
    {
      key: 'TIKETSTATUS', label: 'Tiket', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'AKTIF', label: 'AKTIF' }, { value: 'DIBATALKAN', label: 'DIBATALKAN' },
      ] as any,
      render: (r) => <span className={`badge ${badge(String(r.TIKETSTATUS || ''), 'AKTIF')}`}>{r.TIKETSTATUS || '-'}</span>,
    },
    actionsColumn<TicketRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="view"
        title={`Lihat tiket ${r.TICKETCODE}`} aria-label={`Lihat tiket ${r.TICKETCODE}`}
        onClick={() => h.onView(r)}
      />
    ), 48),
  ];
}

// Modal tiket: QR besar + info + unduh + kirim ulang + buat ulang + batalkan.
function TicketModal({ attendeeid, canWrite, onChanged }: {
  attendeeid: number; canWrite: boolean; onChanged: () => void;
}) {
  const { open, close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [qrSrc, setQrSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(attendeeid);
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        setDetail(row);
        if (row.QRTOKEN) {
          try {
            const QRCode = (await import('qrcode')).default;
            setQrSrc(await QRCode.toDataURL(String(row.QRTOKEN), { width: 240, margin: 1 }));
          } catch {
            setQrSrc('');
          }
        } else setQrSrc('');
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [attendeeid]);

  useEffect(() => { load(); }, [load]);

  const download = () => {
    if (!qrSrc) return;
    const a = document.createElement('a');
    a.href = qrSrc;
    a.download = `tiket_${detail?.TICKETCODE || attendeeid}.png`;
    a.click();
  };

  const resend = async () => {
    if (!await confirmDialog({ message: `Kirim ulang tiket ${detail?.TICKETCODE || ''} ke ${detail?.EMAIL || ''}?` })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_resend({ ATTENDEEID: attendeeid });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Tiket terkirim.', 'ok');
        load();
        onChanged();
      } else toast('Error', res?.message || 'Gagal mengirim.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const regen = () => {
    open(<RegenModal code={String(detail?.TICKETCODE || '')} attendeeid={attendeeid} onDone={() => { load(); onChanged(); }} />);
  };

  const cancel = () => {
    open(<CancelModal code={String(detail?.TICKETCODE || '')} attendeeid={attendeeid} onDone={() => { load(); onChanged(); }} />);
  };

  const qrActive = String(detail?.QRACTIVE || '') === 'YES';

  return (
    <Window
      title={`Tiket ${detail?.TICKETCODE || ''}`}
      icon="ticket"
      width="520px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load()}>Coba lagi</Btn>
        </div>
      ) : detail ? (
        <>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: '4px 0' }}>
            {qrSrc && qrActive ? (
              <img src={qrSrc} alt="QR tiket" width={220} height={220} style={{ borderRadius: 8, border: '1px solid var(--border)' }} />
            ) : (
              <div className="toast-err alert-inline">
                <Icon name="alertCircle" size={17} />
                <span>QR nonaktif ({String(detail?.TIKETSTATUS || '')}{String(detail?.ATTENDSTATUS || '').toUpperCase() === 'HADIR' ? ' • sudah dipakai' : ''}{['ENDED', 'CANCELLED'].includes(String(detail?.EVENTSTATUS || '').toUpperCase()) ? ' • event ' + String(detail?.EVENTSTATUS || '').toLowerCase() : ''}).</span>
              </div>
            )}
            <b>{detail?.NAME}</b>
            <span className="loading-hint">{detail?.TYPENAME || '-'} • {detail?.EVENTTITLE || '-'}</span>
            <span>
              <span className={`badge ${String(detail?.PAYSTATUS || '').toUpperCase() === 'LUNAS' ? 'ok' : ''}`}>{detail?.PAYSTATUS}</span>{' '}
              <span className={`badge ${String(detail?.ATTENDSTATUS || '').toUpperCase() === 'HADIR' ? 'ok' : ''}`}>{detail?.ATTENDSTATUS}</span>{' '}
              <span className={`badge ${String(detail?.TIKETSTATUS || '').toUpperCase() === 'AKTIF' ? 'ok' : 'err'}`}>{detail?.TIKETSTATUS}</span>
            </span>
          </div>
          {canWrite && (
            <div className="toolbar">
              <Btn className="btn-sm" icon="download" disabled={busy || !qrSrc} onClick={download}>Unduh</Btn>
              <Btn className="btn-sm" icon="mail" disabled={busy} onClick={resend}>Kirim Ulang</Btn>
              <Btn className="btn-sm" icon="refresh" disabled={busy} onClick={regen}>Buat Ulang QR</Btn>
              <Btn className="danger btn-sm" icon="close" disabled={busy} onClick={cancel}>Batalkan</Btn>
            </div>
          )}
        </>
      ) : null}
    </Window>
  );
}

// Modal buat ulang QR (alasan wajib).
function RegenModal({ code, attendeeid, onDone }: { code: string; attendeeid: number; onDone: () => void }) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan wajib diisi.'); return; }
    if (reason.trim().length > 200) { setReasonErr('Alasan maksimal 200 karakter.'); return; }
    if (!await confirmDialog({ message: `Buat ulang QR ${code}? QR lama tidak berlaku lagi.`, okText: 'Ya, Buat Ulang' })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_regen({ ATTENDEEID: attendeeid, REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'QR baru diterbitkan.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal membuat QR.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Buat Ulang QR ${code}`}
      icon="refresh"
      width="440px"
      footer={
        <>
          <Btn className="primary" icon="refresh" disabled={busy} onClick={submit}>Buat Ulang</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Alasan">
        <div>
          <input className="input" placeholder="Alasan (wajib, mis. tiket bocor)" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} />
          {reasonErr && <span className="field-err">{reasonErr}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

// Modal batalkan tiket (alasan wajib).
function CancelModal({ code, attendeeid, onDone }: { code: string; attendeeid: number; onDone: () => void }) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan pembatalan wajib diisi.'); return; }
    if (reason.trim().length > 200) { setReasonErr('Alasan maksimal 200 karakter.'); return; }
    if (!await confirmDialog({ message: `Batalkan tiket ${code}? Kuota tersedia kembali.`, okText: 'Ya, Batalkan', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_cancel({ ATTENDEEID: attendeeid, REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Tiket dibatalkan.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal membatalkan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Batalkan ${code}`}
      icon="close"
      width="440px"
      footer={
        <>
          <Btn className="danger" icon="close" disabled={busy} onClick={submit}>Batalkan Tiket</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      <FrmRow label="Alasan">
        <div>
          <input className="input" placeholder="Alasan pembatalan (wajib)" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} />
          {reasonErr && <span className="field-err">{reasonErr}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

const GRIDmmyticket = forwardRef<GridApi>(function GRIDmmyticket(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [eventId, setEventId] = useState('');
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barPay, setBarPay] = useState('');
  const [barAttend, setBarAttend] = useState('');
  const [barTiket, setBarTiket] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const loadEvents = useCallback(async () => {
    try {
      const res: any = await eventProxy.read_dropdown({ open_only: 'NO' });
      if (parseBoolean(res?.success)) setEvents(res.Rows || []);
    } catch { /* daftar event gagal: biarkan kosong */ }
  }, []);

  const load = useCallback(async (opts?: { event?: string; page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; pay: string; attend: string; tiket: string }> }) => {
    const ev = opts?.event !== undefined ? opts.event : eventId;
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bp = opts?.bar?.pay ?? barPay;
    const ba = opts?.bar?.attend ?? barAttend;
    const bt = opts?.bar?.tiket ?? barTiket;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        eventid: ev, limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        paystatus: bp, attendstatus: ba, tiketstatus: bt,
      });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
        setSort(s);
        setEventId(ev);
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [eventId, page, filters, sort, barQ, barPay, barAttend, barTiket]);

  const loadSummary = useCallback(async (ev: string) => {
    try {
      const res: any = await proxy.read_summary(ev);
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary(eventId);
  }, [load, loadSummary, eventId]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openTicket = useCallback((r: TicketRow) => {
    if (r.ATTENDEEID == null) return;
    open(<TicketModal attendeeid={Number(r.ATTENDEEID)} canWrite={canWrite} onChanged={() => { load({ page }); loadSummary(eventId); }} />);
  }, [open, canWrite, load, loadSummary, eventId, page]);

  const pickEvent = useCallback((ev: string) => {
    setFilters({});
    load({ event: ev, page: 0, filters: {}, sort: null });
    loadSummary(ev);
  }, [load, loadSummary]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarPay(''); setBarAttend(''); setBarTiket('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: TicketRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Lihat tiket ${r.TICKETCODE}`, icon: 'view', onClick: () => openTicket(r) },
      ],
    });
  }, [openTicket]);

  const columns = useMemo(() => buildColumns({ onView: openTicket }), [openTicket]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    loadEvents();
    load({ page: 0, filters: {}, sort: null });
    loadSummary('');
    checkMenuAccess('40010002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Total tiket', value: summary.TOTAL ?? 0 },
    { label: 'Aktif', value: summary.AKTIF ?? 0 },
    { label: 'Sudah dipakai', value: summary.DIPAKAI ?? 0 },
    { label: 'Dibatalkan', value: summary.BATAL ?? 0 },
  ];

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Event</span>
        <select value={eventId} onChange={(e) => pickEvent(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          <option value="">Semua event</option>
          {events.map((e) => (
            <option key={e.EVENTID} value={e.EVENTID}>
              {e.EVENTCODE} — {e.TITLE} ({e.STATUS})
            </option>
          ))}
        </select>
      </div>
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
          </div>
        ))}
      </div>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input className="input" placeholder="Cari nama/email/kode" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barPay} onChange={(e) => setBarPay(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua bayar</option>
          {['BELUM_BAYAR', 'LUNAS', 'REFUND'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barAttend} onChange={(e) => setBarAttend(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua hadir</option>
          {['BELUM_HADIR', 'HADIR'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barTiket} onChange={(e) => setBarTiket(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua tiket</option>
          {['AKTIF', 'DIBATALKAN'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<TicketRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.ATTENDEEID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmmyticket;
