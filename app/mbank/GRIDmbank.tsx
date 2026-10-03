// GRIDmbank — tabel rekening + verifikasi + tampil nomor + utama.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: barF, rows, filters, sort, page, total, loading, err, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import type { CtxItem } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMmbank from './FRMmbank';
import { OWNER_LABEL, VERIFY_LABEL } from './Cmbank';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type BankRow = {
  BANKACCOUNTID?: number;
  OWNERTYPE?: string;
  SELLERID?: number;
  ORGNAME?: string;
  SHOPNAME?: string;
  SELLERCODE?: string;
  BANKID?: number;
  BANKNAME?: string;
  LAST4?: string;
  MASKED?: string;
  ACCTNAME?: string;
  OWNERLABEL?: string;
  ISPRIMARY?: string;
  VERIFYSTATUS?: string;
  VERIFYNOTE?: string;
  STATUS?: string;
  ACTIVEUSE?: string;
  EVERUSED?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: BankRow) => void;
  remove: (r: BankRow) => void;
};

function verifyColor(s: string): string {
  switch (String(s || '').toUpperCase()) {
    case 'TERVERIFIKASI': return 'ok';
    case 'DITOLAK': return 'err';
    default: return '';
  }
}

function buildColumns(h: {
  onDetail: (r: BankRow) => void;
  onEdit: (r: BankRow) => void;
  onPrimary: (r: BankRow) => void;
  onVerify: (r: BankRow) => void;
  onToggle: (r: BankRow) => void;
  onReveal: (r: BankRow) => void;
  onRemove: (r: BankRow) => void;
  canWrite: boolean;
}): Column<BankRow>[] {
  return [
    noColumn,
    {
      key: 'OWNERTYPE', label: 'Pemilik', width: 200, sortable: true,
      filter: 'select', options: [
        { value: 'SELLER', label: 'Penjual' }, { value: 'ORGANIZER', label: 'Penyelenggara' },
      ] as any,
      render: (r) => (
        <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}>
          {OWNER_LABEL[String(r.OWNERTYPE)] || r.OWNERTYPE} — {r.OWNERLABEL || '-'}
        </a>
      ),
    },
    { key: 'BANKNAME', label: 'Bank', width: 140, sortable: true },
    {
      key: 'LAST4', label: 'Rekening', width: 110, filter: false,
      render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.MASKED || `**** ${r.LAST4 || ''}`}</span>,
    },
    { key: 'ACCTNAME', label: 'Nama pemilik', width: 150 },
    {
      key: 'ISPRIMARY', label: 'Utama', width: 70, sortable: true,
      filter: 'select', options: [
        { value: 'YES', label: 'Ya' }, { value: 'NO', label: 'Tidak' },
      ] as any,
      render: (r) => (r.ISPRIMARY === 'YES' ? <span className="badge ok">Utama</span> : <span>-</span>),
    },
    {
      key: 'VERIFYSTATUS', label: 'Verifikasi', width: 130, sortable: true,
      filter: 'select', options: [
        { value: 'BELUM_VERIFIKASI', label: 'Belum verifikasi' },
        { value: 'TERVERIFIKASI', label: 'Terverifikasi' },
        { value: 'DITOLAK', label: 'Ditolak' },
      ] as any,
      render: (r) => {
        const s = String(r.VERIFYSTATUS || '').toUpperCase();
        return <span className={`badge ${verifyColor(s)}`}>{VERIFY_LABEL[s] || s || '-'}</span>;
      },
    },
    {
      key: 'STATUS', label: 'Status', width: 90, sortable: true,
      filter: 'select', options: [
        { value: 'AKTIF', label: 'Aktif' }, { value: 'NONAKTIF', label: 'Nonaktif' },
      ] as any,
      render: (r) => (
        r.STATUS === 'AKTIF' ? <span className="badge ok">Aktif</span> : <span className="badge off">Nonaktif</span>
      ),
    },
    ...(h.canWrite ? [actionsColumn<BankRow>((r) => (
      <>
        <Btn className="btn-sm" iconOnly icon="view" title="Tampil nomor" aria-label="Tampil nomor" onClick={() => h.onReveal(r)} />
        <Btn className="btn-sm" iconOnly icon="edit" title={`Ubah`} aria-label={`Ubah`} onClick={() => h.onEdit(r)} />
      </>
    ), 84)] : []),
  ];
}

// Modal detail: info + aksi (utama/verifikasi/status/hapus).
function DetailModal({ accountid, canWrite, onEdit, onChanged }: {
  accountid: number; canWrite: boolean; onEdit: () => void; onChanged: () => void;
}) {
  const { open, close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_detail(accountid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [accountid]);

  useEffect(() => { load(); }, [load]);

  // Verifikasi terima/tolak (tolak wajib catatan).
  const verify = async (decision: 'TERIMA' | 'TOLAK') => {
    if (decision === 'TOLAK' && !note.trim()) { setNoteErr('Catatan penolakan wajib diisi.'); return; }
    const msg = decision === 'TERIMA' ? 'Verifikasi rekening ini (diterima)?' : 'Tolak verifikasi rekening ini?';
    if (!await confirmDialog({ message: msg, danger: decision === 'TOLAK' })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_verify({ BANKACCOUNTID: accountid, DECISION: decision, VERIFYNOTE: note.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message, 'ok');
        onChanged();
        load();
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  // Tampil nomor utuh (konfirmasi + tercatat di Audit Log).
  const reveal = async () => {
    if (!await confirmDialog({ message: 'Tampilkan nomor rekening utuh? Aksi ini tercatat di Audit Log.', okText: 'Ya, Tampilkan' })) return;
    setBusy(true);
    try {
      const res: any = await proxy.reveal(accountid);
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        open(
          <Window title="Nomor Rekening" icon="view" width="420px" footer={<><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Tutup</Btn></>}>
            <FrmSet legend="Nomor" icon="view" columns={1}>
              <FrmRow label="Utuh">
                <span><b style={{ fontFamily: 'monospace', fontSize: 18 }}>{row.ACCTNO || '-'}</b></span>
              </FrmRow>
            </FrmSet>
            <p className="loading-hint">Penampilan ini tercatat di Audit Log. Jangan disebar.</p>
          </Window>
        );
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const st = String(detail?.STATUS || '').toUpperCase();
  const vs = String(detail?.VERIFYSTATUS || '').toUpperCase();
  const inUse = detail?.ACTIVEUSE === 'YES';
  const everUsed = detail?.EVERUSED === 'YES';

  return (
    <Window
      title={`Rekening ${detail?.MASKED || ''}`}
      icon="form"
      width="600px"
      footer={
        <>
          {canWrite && !inUse && st === 'AKTIF' && (
            <Btn className="primary btn-sm" icon="edit" onClick={() => { close(); onEdit(); }}>Ubah</Btn>
          )}
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
          {inUse && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Rekening sedang dipakai payout/penarikan aktif — tidak bisa diubah atau dinonaktifkan.</span>
            </div>
          )}
          <FrmSet legend="Rekening" icon="form" columns={2}>
            <FrmRow label="Pemilik">
              <span>{OWNER_LABEL[String(detail.OWNERTYPE)] || detail.OWNERTYPE} — {detail.OWNERLABEL || '-'}</span>
            </FrmRow>
            <FrmRow label="Bank"><span>{detail.BANKNAME || '-'}</span></FrmRow>
            <FrmRow label="Nomor">
              <span style={{ fontFamily: 'monospace' }}>{detail.MASKED}</span>
            </FrmRow>
            <FrmRow label="Nama pemilik"><span>{detail.ACCTNAME || '-'}</span></FrmRow>
            <FrmRow label="Utama">
              <span>{detail.ISPRIMARY === 'YES' ? 'Ya' : 'Tidak'}</span>
            </FrmRow>
            <FrmRow label="Status">
              <span>{st === 'AKTIF' ? 'Aktif' : 'Nonaktif'}</span>
            </FrmRow>
            <FrmRow label="Verifikasi">
              <span className={`badge ${verifyColor(vs)}`}>{VERIFY_LABEL[vs] || vs}</span>
            </FrmRow>
            {detail.VERIFYNOTE && (
              <FrmRow label="Catatan"><span>{detail.VERIFYNOTE}</span></FrmRow>
            )}
          </FrmSet>
          {canWrite && (
            <FrmSet legend="Aksi" icon="check" columns={1}>
              <div className="toolbar">
                {vs !== 'TERVERIFIKASI' && (
                  <Btn className="primary btn-sm" icon="check" disabled={busy} onClick={() => verify('TERIMA')}>Terima</Btn>
                )}
                {vs !== 'DITOLAK' && (
                  <Btn className="danger btn-sm" icon="close" disabled={busy} onClick={() => verify('TOLAK')}>Tolak</Btn>
                )}
                {vs === 'TERVERIFIKASI' && st === 'AKTIF' && detail.ISPRIMARY !== 'YES' && (
                  <Btn className="btn-sm" icon="check" disabled={busy} onClick={async () => {
                    if (!await confirmDialog({ message: 'Jadikan rekening utama pemilik ini?' })) return;
                    setBusy(true);
                    try {
                      const res: any = await proxy.set_primary({ BANKACCOUNTID: accountid });
                      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); onChanged(); load(); }
                      else toast('Error', res?.message, 'err');
                    } catch (e: any) {
                      toast('Error', e.message, 'err');
                    } finally {
                      setBusy(false);
                    }
                  }}>Utama</Btn>
                )}
                {!inUse && (
                  <Btn className="btn-sm" icon="refresh" disabled={busy} onClick={async () => {
                    const to = st === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';
                    if (!await confirmDialog({ message: `${to === 'AKTIF' ? 'Aktifkan' : 'Nonaktifkan'} rekening ini?` })) return;
                    setBusy(true);
                    try {
                      const res: any = await proxy.change_status({ BANKACCOUNTID: accountid, STATUS: to });
                      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); onChanged(); load(); }
                      else toast('Error', res?.message, 'err');
                    } catch (e: any) {
                      toast('Error', e.message, 'err');
                    } finally {
                      setBusy(false);
                    }
                  }}>{st === 'AKTIF' ? 'Nonaktif' : 'Aktif'}</Btn>
                )}
                <Btn className="btn-sm" icon="view" disabled={busy} onClick={reveal}>Nomor</Btn>
                {!everUsed && (
                  <Btn className="danger btn-sm" icon="del" disabled={busy} onClick={async () => {
                    if (!await confirmDialog({ message: 'Hapus rekening ini?', okText: 'Ya, Hapus', danger: true })) return;
                    setBusy(true);
                    try {
                      const res: any = await proxy.process_delete({ BANKACCOUNTID: accountid });
                      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); onChanged(); close(); }
                      else toast('Error', res?.message, 'err');
                    } catch (e: any) {
                      toast('Error', e.message, 'err');
                    } finally {
                      setBusy(false);
                    }
                  }}>Hapus</Btn>
                )}
              </div>
              <FrmRow label="Catatan tolak">
                <div>
                  <input className="input" placeholder="wajib bila menolak" value={note} onChange={(e) => { setNote(e.target.value); setNoteErr(''); }} maxLength={200} />
                  {noteErr && <span className="field-err">{noteErr}</span>}
                </div>
              </FrmRow>
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}

const GRIDmbank = forwardRef<GridApi>(function GRIDmbank(_props, ref) {
  const { open, close } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<BankRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barType, setBarType] = useState('');
  const [barVerify, setBarVerify] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; type: string; verify: string; status: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bt = opts?.bar?.type ?? barType;
    const bv = opts?.bar?.verify ?? barVerify;
    const bs = opts?.bar?.status ?? barStatus;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined, ownertype: bt, verifystatus: bv, status: bs,
      });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
        setSort(s);
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [page, filters, sort, barQ, barType, barVerify, barStatus]);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  const reload = useCallback(() => {
    load({ page });
  }, [load, page]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const openDetail = useCallback((r: BankRow) => {
    if (r.BANKACCOUNTID == null) return;
    const id = Number(r.BANKACCOUNTID);
    open(<DetailModal accountid={id} canWrite={canWrite} onEdit={() => open(<FRMmbank isNew={false} bankAccountId={id} onSaved={reload} />)} onChanged={reload} />);
  }, [open, canWrite, reload]);

  const create = useCallback(() => {
    open(<FRMmbank isNew onSaved={() => { load({ page: 0 }); }} />);
  }, [open, load]);

  const edit = useCallback((r: BankRow) => {
    if (r.BANKACCOUNTID == null) return;
    const id = Number(r.BANKACCOUNTID);
    open(<FRMmbank isNew={false} bankAccountId={id} onSaved={reload} />);
  }, [open, reload]);

  const quick = useCallback(async (
    r: BankRow, fn: (v: unknown) => Promise<any>, question: string, danger?: boolean,
  ) => {
    if (!await confirmDialog(danger ? { message: question, okText: 'Ya', danger: true } : { message: question })) return;
    try {
      const res: any = await fn(r.BANKACCOUNTID != null ? { BANKACCOUNTID: r.BANKACCOUNTID } : {});
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [reload]);

  const setPrimary = useCallback((r: BankRow) => quick(r, proxy.set_primary, 'Jadikan rekening utama pemilik ini?'), [quick]);
  const toggle = useCallback((r: BankRow) => quick(
    r,
    (v: any) => proxy.change_status({ ...v, STATUS: r.STATUS === 'AKTIF' ? 'NONAKTIF' : 'AKTIF' }),
    `${r.STATUS === 'AKTIF' ? 'Nonaktifkan' : 'Aktifkan'} rekening ${r.MASKED}?`
  ), [quick]);
  const remove = useCallback((r: BankRow) => quick(r, proxy.process_delete, `Hapus rekening ${r.MASKED}?`, true), [quick]);

  const reveal = useCallback(async (r: BankRow) => {
    if (r.BANKACCOUNTID == null) return;
    if (!await confirmDialog({ message: 'Tampilkan nomor rekening utuh? Aksi ini tercatat di Audit Log.', okText: 'Ya, Tampilkan' })) return;
    try {
      const res: any = await proxy.reveal(Number(r.BANKACCOUNTID));
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        open(
          <Window title="Nomor Rekening" icon="view" width="420px" footer={<><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Tutup</Btn></>}>
            <FrmSet legend="Nomor" icon="view" columns={1}>
              <FrmRow label="Utuh">
                <span><b style={{ fontFamily: 'monospace', fontSize: 18 }}>{row.ACCTNO || '-'}</b></span>
              </FrmRow>
            </FrmSet>
            <p className="loading-hint">Penampilan ini tercatat di Audit Log. Jangan disebar.</p>
          </Window>
        );
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [open]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarType(''); setBarVerify(''); setBarStatus('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: BankRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.MASKED}`, icon: 'view', onClick: () => openDetail(r) },
        ...(canWrite ? [{ label: `Ubah`, icon: 'edit', onClick: () => edit(r) }] : []),
      ] as CtxItem[],
    });
  }, [openDetail, edit, canWrite]);

  const columns = useMemo(() => buildColumns({
    onDetail: openDetail, onEdit: edit, onPrimary: setPrimary,
    onVerify: openDetail, onToggle: toggle, onReveal: reveal, onRemove: remove, canWrite,
  }), [openDetail, edit, setPrimary, toggle, reveal, remove, canWrite]);

  useImperativeHandle(ref, () => ({ refresh, create, edit, remove }), [refresh, create, edit, remove]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    checkMenuAccess('70040001').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input className="input" placeholder="Cari pemilik/nama/4 digit" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barType} onChange={(e) => setBarType(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua pemilik</option>
          <option value="SELLER">Penjual</option>
          <option value="ORGANIZER">Penyelenggara</option>
        </select>
        <select value={barVerify} onChange={(e) => setBarVerify(e.target.value)} style={{ width: 140 }}>
          <option value="">Semua verifikasi</option>
          <option value="BELUM_VERIFIKASI">Belum verifikasi</option>
          <option value="TERVERIFIKASI">Terverifikasi</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 110 }}>
          <option value="">Semua status</option>
          <option value="AKTIF">Aktif</option>
          <option value="NONAKTIF">Nonaktif</option>
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
      <DataTable<BankRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.BANKACCOUNTID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmbank;
