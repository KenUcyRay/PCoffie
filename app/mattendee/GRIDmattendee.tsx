// GRIDmattendee — pilih event + kartu ringkasan + tabel peserta + aksi.
// Tambah manual, ubah kontak, status bayar, hadir/batal-hadir, batal tiket,
// import CSV (pratinjau + laporan gagal), export CSV. Tanpa hapus permanen.
// Kalau dibuka dari pintasan Event Data, event langsung terpilih.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: eventId, events, eventQ, types, rows, filters, sort, page, total, loading, err, summary
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
import FRMmattendee from './FRMmattendee';
import { formatTanggal, downloadCSV, downloadSampleCSV, parseImportCSV } from './Cmattendee';
import { takePickedEvent } from '../meventdata/eventPick';
import * as proxy from './api';
import * as eventProxy from '../meventdata/api';
import * as typeProxy from '../mtickettype/api';
import type { SortState, ImportRow } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;
const IMPORT_MAX = 1000;

export type AttendeeRow = {
  ATTENDEEID?: number;
  EVENTID?: number;
  TICKETTYPEID?: number;
  TYPENAME?: string;
  NAME?: string;
  EMAIL?: string;
  PHONE?: string;
  TICKETCODE?: string;
  SOURCE?: string;
  PAYSTATUS?: string;
  ATTENDSTATUS?: string;
  CHECKINTIME?: string;
  TIKETSTATUS?: string;
  REGDATE?: string;
};

export type TicketOpt = {
  TICKETTYPEID: number;
  NAME?: string;
  PRICE?: number | string;
  QUOTA?: number | string;
  ISACTIVE?: string;
};

export type EventOpt = {
  EVENTID: number;
  EVENTCODE?: string;
  TITLE?: string;
  STATUS?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
};

function payBadge(p: string): string {
  switch (String(p || '').toUpperCase()) {
    case 'LUNAS': return 'ok';
    case 'BELUM_BAYAR': return '';
    case 'REFUND': return 'err';
    default: return '';
  }
}

function buildColumns(h: {
  onContact: (r: AttendeeRow) => void;
  onPay: (r: AttendeeRow) => void;
  onCheckin: (r: AttendeeRow) => void;
  onUncheckin: (r: AttendeeRow) => void;
  onCancel: (r: AttendeeRow) => void;
}): Column<AttendeeRow>[] {
  return [
    noColumn,
    { key: 'TICKETCODE', label: 'Kode Tiket', width: 130, sortable: true },
    { key: 'NAME', label: 'Nama', width: 150, sortable: true },
    { key: 'EMAIL', label: 'Email', width: 170 },
    { key: 'PHONE', label: 'Telepon', width: 120 },
    { key: 'TYPENAME', label: 'Tipe', width: 110, filter: false },
    {
      key: 'PAYSTATUS', label: 'Bayar', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'BELUM_BAYAR', label: 'BELUM_BAYAR' }, { value: 'LUNAS', label: 'LUNAS' },
        { value: 'REFUND', label: 'REFUND' },
      ] as any,
      render: (r) => <span className={`badge ${payBadge(String(r.PAYSTATUS || ''))}`}>{r.PAYSTATUS || '-'}</span>,
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
    { key: 'CHECKINTIME', label: 'Check-in', width: 150, filter: false, sortable: true, render: (r) => formatTanggal(r.CHECKINTIME) },
    {
      key: 'TIKETSTATUS', label: 'Tiket', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'AKTIF', label: 'AKTIF' }, { value: 'DIBATALKAN', label: 'DIBATALKAN' },
      ] as any,
      render: (r) => {
        const s = String(r.TIKETSTATUS || '').toUpperCase();
        return <span className={`badge ${s === 'AKTIF' ? 'ok' : 'err'}`}>{s || '-'}</span>;
      },
    },
    actionsColumn<AttendeeRow>((r) => {
      const aktif = String(r.TIKETSTATUS || '').toUpperCase() === 'AKTIF';
      const hadir = String(r.ATTENDSTATUS || '').toUpperCase() === 'HADIR';
      return (
        <>
          <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah kontak ${r.TICKETCODE}`} aria-label={`Ubah kontak ${r.TICKETCODE}`} onClick={() => h.onContact(r)} />
          {aktif && (
            <Btn className="btn-sm" iconOnly icon="cash" title={`Status bayar ${r.TICKETCODE}`} aria-label={`Status bayar ${r.TICKETCODE}`} onClick={() => h.onPay(r)} />
          )}
          {aktif && !hadir && (
            <Btn className="btn-sm" iconOnly icon="check" title={`Tandai hadir ${r.TICKETCODE}`} aria-label={`Tandai hadir ${r.TICKETCODE}`} onClick={() => h.onCheckin(r)} />
          )}
          {aktif && hadir && (
            <Btn className="btn-sm" iconOnly icon="arrowL" title={`Batalkan hadir ${r.TICKETCODE}`} aria-label={`Batalkan hadir ${r.TICKETCODE}`} onClick={() => h.onUncheckin(r)} />
          )}
          {aktif && (
            <Btn className="danger btn-sm" iconOnly icon="close" title={`Batalkan tiket ${r.TICKETCODE}`} aria-label={`Batalkan tiket ${r.TICKETCODE}`} onClick={() => h.onCancel(r)} />
          )}
        </>
      );
    }, 190),
  ];
}

// Modal status pembayaran.
function PayModal({ row, onDone }: { row: AttendeeRow; onDone: () => void }) {
  const { close } = useModal();
  const [pay, setPay] = useState(String(row.PAYSTATUS || 'BELUM_BAYAR'));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!await confirmDialog({ message: `Ubah status bayar ${row.TICKETCODE} menjadi ${pay}?` })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_paystatus({ ATTENDEEID: row.ATTENDEEID, PAYSTATUS: pay });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Status bayar diupdate.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal update status.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Status Bayar ${row.TICKETCODE || ''}`}
      icon="cash"
      width="400px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={submit}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Status">
        <select value={pay} onChange={(e) => setPay(e.target.value)}>
          <option value="BELUM_BAYAR">BELUM_BAYAR</option>
          <option value="LUNAS">LUNAS</option>
          <option value="REFUND">REFUND</option>
        </select>
      </FrmRow>
    </Window>
  );
}

// Modal batalkan tiket (alasan wajib).
function CancelModal({ row, onDone }: { row: AttendeeRow; onDone: () => void }) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan pembatalan wajib diisi.'); return; }
    if (reason.trim().length > 200) { setReasonErr('Alasan maksimal 200 karakter.'); return; }
    if (!await confirmDialog({ message: `Batalkan tiket ${row.TICKETCODE}? Kuota tersedia kembali.`, okText: 'Ya, Batalkan', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_cancel({ ATTENDEEID: row.ATTENDEEID, REASON: reason.trim() });
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
      title={`Batalkan ${row.TICKETCODE || ''}`}
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

// Modal import CSV: unggah -> pratinjau + laporan gagal -> commit.
function ImportModal({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { close } = useModal();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<{ TOTAL: number; VALID: number; ERRORS: { row: number; reason: string }[] } | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setErr('Ukuran file maksimal 2MB.'); return; }
    setErr('');
    setFileName(f.name);
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const parsed = parseImportCSV(String(rd.result || ''));
        if (!parsed.length) { setErr('File kosong atau tidak terbaca.'); return; }
        if (parsed.length > IMPORT_MAX) { setErr(`Maksimal ${IMPORT_MAX} baris per import.`); return; }
        setRows(parsed);
        const res: any = await proxy.import_preview(eventId, parsed);
        if (parseBoolean(res?.success)) setReport((res.Rows || [])[0] || null);
        else setErr(res?.message || 'Gagal memvalidasi.');
      } catch (e: any) {
        setErr(e.message || 'Gagal membaca file.');
      }
    };
    rd.readAsText(f);
  };

  const commit = async () => {
    if (!rows.length) return;
    if (report && report.ERRORS.length && !skipInvalid) {
      setErr('Masih ada baris gagal. Perbaiki file atau centang lewati baris gagal.');
      return;
    }
    if (!await confirmDialog({ message: `Import ${rows.length} baris${skipInvalid ? ' (lewati yang gagal)' : ''}?`, okText: 'Ya, Import' })) return;
    setBusy(true);
    try {
      const res: any = await proxy.import_commit(eventId, rows, skipInvalid);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Import selesai.', 'ok');
        onDone();
        close();
      } else {
        const errs = (res?.Rows || [])[0]?.ERRORS as { row: number; reason: string }[] | undefined;
        if (errs && errs.length) setReport({ TOTAL: rows.length, VALID: rows.length - errs.length, ERRORS: errs });
        toast('Error', res?.message || 'Import gagal.', 'err');
      }
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Import CSV Peserta"
      icon="upload"
      width="640px"
      footer={
        <>
          <Btn className="btn-sm" icon="download" onClick={downloadSampleCSV}>Contoh CSV</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
          <Btn pid="btsave" className="primary" icon="upload" disabled={busy || !rows.length} onClick={commit}>
            {busy ? 'Mengimport…' : 'Import'}
          </Btn>
        </>
      }
    >
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
      <span className="loading-hint">Kolom: nama_tipe, nama, email, telepon, status_bayar. Maks {IMPORT_MAX} baris, 2MB.</span>
      {fileName && <span className="loading-hint">File: {fileName} ({rows.length} baris).</span>}
      {err && <span className="field-err">{err}</span>}
      {report && (
        <>
          <p className="loading-hint">Valid: {report.VALID}/{report.TOTAL}. Gagal: {report.ERRORS.length}.</p>
          {report.ERRORS.length > 0 && (
            <>
              <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="grid">
                  <thead><tr><th>Baris</th><th>Alasan</th></tr></thead>
                  <tbody>
                    {report.ERRORS.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.reason}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <label className="akses-row">
                <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                <span className="tree-label">Lewati baris gagal (simpan yang valid saja)</span>
              </label>
            </>
          )}
        </>
      )}
    </Window>
  );
}

const GRIDmattendee = forwardRef<GridApi>(function GRIDmattendee(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [eventId, setEventId] = useState<number | null>(null);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [eventQ, setEventQ] = useState('');
  const [types, setTypes] = useState<TicketOpt[]>([]);
  const [rows, setRows] = useState<AttendeeRow[]>([]);
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
  const [barType, setBarType] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  const loadEvents = useCallback(async (q?: string) => {
    try {
      const res: any = await eventProxy.read_dropdown({ q: q || '' });
      if (parseBoolean(res?.success)) setEvents(res.Rows || []);
    } catch { /* daftar event gagal: biarkan kosong */ }
  }, []);

  const loadTypes = useCallback(async (ev: number) => {
    try {
      const res: any = await typeProxy.read_data({ eventid: ev, limit: 0 });
      if (parseBoolean(res?.success)) setTypes(res.Rows || []);
    } catch { /* abaikan */ }
  }, []);

  const load = useCallback(async (opts?: { event?: number | null; page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; pay: string; attend: string; tiket: string; type: string }> }) => {
    const ev = opts?.event !== undefined ? opts.event : eventId;
    if (!ev) return;
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bp = opts?.bar?.pay ?? barPay;
    const ba = opts?.bar?.attend ?? barAttend;
    const bt = opts?.bar?.tiket ?? barTiket;
    const bty = opts?.bar?.type ?? barType;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        eventid: ev, limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        paystatus: bp, attendstatus: ba, tiketstatus: bt, tickettypeid: bty,
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
  }, [eventId, page, filters, sort, barQ, barPay, barAttend, barTiket, barType]);

  const loadSummary = useCallback(async (ev: number | null) => {
    if (!ev) return;
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

  const pickEvent = useCallback((ev: number | null) => {
    setFilters({});
    setRows([]);
    setSummary({});
    if (ev) {
      loadTypes(ev);
      load({ event: ev, page: 0, filters: {}, sort: null });
      loadSummary(ev);
    } else {
      setEventId(null);
      setTotal(0);
      setTypes([]);
    }
  }, [load, loadSummary, loadTypes]);

  const reload = useCallback(() => {
    load({ page });
    if (eventId) loadSummary(eventId);
  }, [load, loadSummary, eventId, page]);

  const openContact = useCallback((r: AttendeeRow) => {
    if (!eventId || r.ATTENDEEID == null) return;
    open(
      <FRMmattendee
        mode="contact" eventId={eventId} types={types}
        initial={{
          ATTENDEEID: r.ATTENDEEID, TICKETTYPEID: String(r.TICKETTYPEID ?? ''),
          NAME: r.NAME || '', EMAIL: r.EMAIL || '', PHONE: r.PHONE || '', PAYSTATUS: r.PAYSTATUS || '',
        }}
        onSaved={reload}
      />,
    );
  }, [open, eventId, types, reload]);

  const create = useCallback(() => {
    if (!eventId) { toast('Error', 'Pilih event dulu.', 'err'); return; }
    open(<FRMmattendee mode="create" eventId={eventId} types={types.filter((t) => String(t.ISACTIVE || '').toUpperCase() === 'YES')} onSaved={() => { load({ page: 0 }); loadSummary(eventId); }} />);
  }, [open, eventId, types, load, loadSummary]);

  const payStatus = useCallback((r: AttendeeRow) => {
    open(<PayModal row={r} onDone={reload} />);
  }, [open, reload]);

  const checkin = useCallback(async (r: AttendeeRow) => {
    if (!await confirmDialog({ message: `Tandai hadir ${r.NAME} (${r.TICKETCODE})?` })) return;
    try {
      const res: any = await proxy.process_checkin({ ATTENDEEID: r.ATTENDEEID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [reload]);

  const uncheckin = useCallback(async (r: AttendeeRow) => {
    if (!await confirmDialog({ message: `Batalkan hadir ${r.NAME} (${r.TICKETCODE})?` })) return;
    try {
      const res: any = await proxy.process_uncheckin({ ATTENDEEID: r.ATTENDEEID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [reload]);

  const cancelTicket = useCallback((r: AttendeeRow) => {
    open(<CancelModal row={r} onDone={reload} />);
  }, [open, reload]);

  const openImport = useCallback(() => {
    if (!eventId) { toast('Error', 'Pilih event dulu.', 'err'); return; }
    open(<ImportModal eventId={eventId} onDone={reload} />);
  }, [open, eventId, reload]);

  const doExport = useCallback(async () => {
    if (!eventId) return;
    setExporting(true);
    try {
      const res: any = await proxy.read_export({
        eventid: eventId, q: barQ, paystatus: barPay, attendstatus: barAttend, tiketstatus: barTiket,
      });
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      if (res.truncated) toast('Success', 'Hasil melebihi 10.000 baris, diekspor sebagian. Persempit filter.', 'ok');
      downloadCSV(String(res.csv_base64 || ''), String(res.filename || 'attendee.csv'));
      toast('Success', 'Export selesai.' + (res.truncated ? ' (dipotong)' : ''), 'ok');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [eventId, barQ, barPay, barAttend, barTiket]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarPay(''); setBarAttend(''); setBarTiket(''); setBarType('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: AttendeeRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah kontak ${r.TICKETCODE}`, icon: 'edit', onClick: () => openContact(r) },
        { label: `Tandai hadir ${r.TICKETCODE}`, icon: 'check', onClick: () => checkin(r) },
      ],
    });
  }, [openContact, checkin]);

  const columns = useMemo(() => buildColumns({
    onContact: openContact, onPay: payStatus, onCheckin: checkin,
    onUncheckin: uncheckin, onCancel: cancelTicket,
  }), [openContact, payStatus, checkin, uncheckin, cancelTicket]);

  useImperativeHandle(ref, () => ({ refresh, create }), [refresh, create]);

  useEffect(() => {
    (async () => {
      await loadEvents('');
      const picked = takePickedEvent();
      if (picked) {
        pickEvent(picked);
        return;
      }
      try {
        const res: any = await eventProxy.read_dropdown({});
        const list = (parseBoolean(res?.success) ? res.Rows || [] : []) as EventOpt[];
        if (list.length) pickEvent(Number(list[0].EVENTID));
      } catch { /* tanpa event terpilih */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Total tiket', value: summary.TOTAL ?? 0 },
    { label: 'Lunas', value: summary.LUNAS ?? 0 },
    { label: 'Belum bayar', value: summary.BELUMBAYAR ?? 0 },
    { label: 'Hadir', value: `${summary.HADIR ?? 0} (${summary.HADIRPCT ?? 0}%)` },
  ];

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Event</span>
        <select
          value={eventId ?? ''} onChange={(e) => pickEvent(e.target.value ? Number(e.target.value) : null)}
          style={{ flex: 1, minWidth: 200 }}
        >
          <option value="">Pilih event</option>
          {events.map((e) => (
            <option key={e.EVENTID} value={e.EVENTID}>
              {e.EVENTCODE} — {e.TITLE} ({e.STATUS})
            </option>
          ))}
        </select>
        <input
          className="input" placeholder="Cari event…" value={eventQ}
          onChange={(e) => { setEventQ(e.target.value); loadEvents(e.target.value); }}
          style={{ width: 160 }}
        />
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
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua tipe</option>
          {types.map((t) => <option key={t.TICKETTYPEID} value={t.TICKETTYPEID}>{t.NAME}</option>)}
        </select>
        <Btn className="primary btn-sm" icon="search" onClick={applyBar}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={clearBar}>Reset</Btn>
        <Btn className="btn-sm" icon="upload" onClick={openImport}>Import CSV</Btn>
        <Btn className="btn-sm" icon="download" disabled={exporting} onClick={doExport}>
          {exporting ? 'Mengekspor…' : 'Export CSV'}
        </Btn>
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      {!eventId && !loading && (
        <div className="card-body">
          <p className="empty-hint"><Icon name="users" size={16} /> Pilih event dulu untuk melihat pesertanya.</p>
        </div>
      )}
      {eventId ? (
        <>
          <DataTable<AttendeeRow>
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
        </>
      ) : null}
    </div>
  );
});

export default GRIDmattendee;
