// GRIDmmypurchase — kartu ringkasan + tabel pesanan + buat + detail + aksi.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err, summary, canWrite, barF
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow } from '@/components/Window';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters, type SortDir,
} from '@/components/DataTable';
import FRMmmypurchase from './FRMmmypurchase';
import FRMpayrecord from '../mpayment/FRMpayrecord';
import OrderDetailModal from './OrderDetail';
import { formatIDR, formatTanggal } from './Cmmypurchase';
import * as proxy from './api';
import type { SortState } from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type OrderRow = {
  ORDERID?: number;
  ORDERNO?: string;
  SELLERID?: number;
  SHOPNAME?: string;
  BUYERNAME?: string;
  TOTAL?: number | string;
  ORDERSTATUS?: string;
  PAYSTATUS?: string;
  SYSCREATEDATE?: string;
  ITEMCOUNT?: number | string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
};

function badgeColor(status: string): { o: string; p: string } {
  const o = String(status || '').toUpperCase();
  return {
    o: o === 'DIBATALKAN' || o === 'DIKEMBALIKAN' ? 'err' : o === 'SELESAI' ? 'ok' : '',
    p: '',
  };
}

function buildColumns(h: { onDetail: (r: OrderRow) => void }): Column<OrderRow>[] {
  return [
    noColumn,
    { key: 'ORDERNO', label: 'Nomor', width: 140, sortable: true },
    {
      key: 'BUYERNAME', label: 'Pembeli', width: 140, sortable: false,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}>{r.BUYERNAME || '-'}</a>,
    },
    { key: 'SHOPNAME', label: 'Penjual', width: 140, filter: false },
    {
      key: 'TOTAL', label: 'Total', width: 110, align: 'right', sortable: true,
      render: (r) => formatIDR(r.TOTAL),
    },
    {
      key: 'ORDERSTATUS', label: 'Pesanan', width: 110, sortable: true,
      filter: 'select', options: [
        { value: 'BARU', label: 'BARU' }, { value: 'DIPROSES', label: 'DIPROSES' },
        { value: 'DIKIRIM', label: 'DIKIRIM' }, { value: 'SELESAI', label: 'SELESAI' },
        { value: 'DIBATALKAN', label: 'DIBATALKAN' }, { value: 'DIKEMBALIKAN', label: 'DIKEMBALIKAN' },
      ] as any,
      render: (r) => {
        const s = String(r.ORDERSTATUS || '').toUpperCase();
        return <span className={`badge ${badgeColor(s).o}`}>{s || '-'}</span>;
      },
    },
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
    { key: 'SYSCREATEDATE', label: 'Tanggal', width: 150, filter: false, sortable: true, render: (r) => formatTanggal(r.SYSCREATEDATE) },
    actionsColumn<OrderRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="view"
        title={`Detail ${r.ORDERNO}`} aria-label={`Detail ${r.ORDERNO}`}
        onClick={() => h.onDetail(r)}
      />
    ), 48),
  ];
}

// Modal alasan (batalkan pesanan).
function ReasonModal({ title, label, onOk }: { title: string; label: string; onOk: (reason: string) => Promise<void> }) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan wajib diisi.'); return; }
    setBusy(true);
    try {
      await onOk(reason.trim());
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={title}
      icon="close"
      width="440px"
      footer={
        <>
          <Btn className="danger" icon="close" disabled={busy} onClick={submit}>Ya, Lanjut</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label={label}>
        <div>
          <input className="input" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} maxLength={200} />
          {reasonErr && <span className="field-err">{reasonErr}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

// Modal keluhan (alasan + deskripsi).
function ComplaintModal({ orderid, onDone }: { orderid: number; onDone: () => void }) {
  const { close } = useModal();
  const [reason, setReason] = useState('BARANG_RUSAK');
  const [descr, setDescr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!await confirmDialog({ message: 'Buat keluhan untuk pesanan ini?' })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_complaint({ ORDERID: orderid, REASON: reason, DESCR: descr.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Keluhan dibuat.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal membuat keluhan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Buat Keluhan"
      icon="alert"
      width="440px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={submit}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Alasan">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {['BARANG_RUSAK', 'TIDAK_SESUAI', 'TIDAK_DITERIMA', 'LAINNYA'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </FrmRow>
      <FrmRow label="Deskripsi">
        <textarea className="input" rows={3} value={descr} onChange={(e) => setDescr(e.target.value)} maxLength={1000} />
      </FrmRow>
    </Window>
  );
}

// Modal tutup keluhan (tanggapan wajib).
function CloseComplaintModal({ complaintid, onDone }: { complaintid: number; onDone: () => void }) {
  const { close } = useModal();
  const [resp, setResp] = useState('');
  const [respErr, setRespErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!resp.trim()) { setRespErr('Tanggapan wajib diisi.'); return; }
    setBusy(true);
    try {
      const res: any = await proxy.process_complaint_close({ COMPLAINTID: complaintid, RESPONSE: resp.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Keluhan ditutup.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal menutup keluhan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Tutup Keluhan"
      icon="check"
      width="440px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={submit}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Tanggapan">
        <div>
          <textarea className="input" rows={3} value={resp} onChange={(e) => { setResp(e.target.value); setRespErr(''); }} maxLength={1000} />
          {respErr && <span className="field-err">{respErr}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

const GRIDmmypurchase = forwardRef<GridApi>(function GRIDmmypurchase(_props, ref) {
  const { open } = useModal();
  const { layoutMode, checkMenuAccess } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [barQ, setBarQ] = useState('');
  const [barStatus, setBarStatus] = useState('');
  const [barPay, setBarPay] = useState('');
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string; pay: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bs = opts?.bar?.status ?? barStatus;
    const bp = opts?.bar?.pay ?? barPay;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined, status: bs, paystatus: bp,
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
  }, [page, filters, sort, barQ, barStatus, barPay]);

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await proxy.read_summary();
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
  }, [load, loadSummary]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const onSort = useCallback((next: SortState) => {
    load({ page: 0, sort: next });
  }, [load]);

  const reload = useCallback(() => {
    load({ page });
    loadSummary();
  }, [load, loadSummary, page]);

  const doCancel = useCallback(async (orderid: number, reason: string) => {
    const res: any = await proxy.process_cancel({ ORDERID: orderid, REASON: reason });
    if (parseBoolean(res?.success)) {
      toast('Success', res.message, 'ok');
      reload();
    } else toast('Error', res?.message, 'err');
  }, [reload]);

  const openDetail = useCallback((r: OrderRow) => {
    if (r.ORDERID == null) return;
    const oid = Number(r.ORDERID);
    const st = String(r.ORDERSTATUS || '').toUpperCase();
    const pay = String(r.PAYSTATUS || '').toUpperCase();
    open(
      <OrderDetailModal
        orderid={oid} readDetail={proxy.read_detail}
        onCloseComplaint={canWrite ? (cid) => open(<CloseComplaintModal complaintid={cid} onDone={reload} />) : undefined}
      >
        {canWrite && (
          <>
            {pay === 'BELUM_BAYAR' && st !== 'DIBATALKAN' && st !== 'DIKEMBALIKAN' && (
              <Btn
                className="btn-sm" icon="check"
                onClick={() => {
                  if (r.ORDERID == null) return;
                  open(
                    <FRMpayrecord
                      presetType="MERCH"
                      presetRefId={Number(r.ORDERID)}
                      presetLabel={`${r.ORDERNO || ''} / ${r.BUYERNAME || ''}`}
                      onSaved={reload}
                    />
                  );
                }}
              >
                Tandai Lunas
              </Btn>
            )}
            {st === 'DIKIRIM' && (
              <Btn
                className="btn-sm" icon="check"
                onClick={async () => {
                  if (!await confirmDialog({ message: `Tandai diterima ${r.ORDERNO}?` })) return;
                  try {
                    const res: any = await proxy.process_receive({ ORDERID: oid });
                    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
                    else toast('Error', res?.message, 'err');
                  } catch (e: any) { toast('Error', e.message, 'err'); }
                }}
              >
                Tandai Diterima
              </Btn>
            )}
            {(st === 'BARU' || st === 'DIPROSES') && (
              <Btn
                className="danger btn-sm" icon="close"
                onClick={() => open(<ReasonModal title={`Batalkan ${r.ORDERNO}`} label="Alasan" onOk={(reason) => doCancel(oid, reason)} />)}
              >
                Batalkan
              </Btn>
            )}
            {(st === 'DIKIRIM' || st === 'SELESAI') && (
              <Btn
                className="btn-sm" icon="alert"
                onClick={() => open(<ComplaintModal orderid={oid} onDone={reload} />)}
              >
                Buat Keluhan
              </Btn>
            )}
          </>
        )}
      </OrderDetailModal>,
    );
  }, [open, canWrite, doCancel, reload]);

  const create = useCallback(() => {
    open(<FRMmmypurchase onSaved={() => { load({ page: 0 }); loadSummary(); }} />);
  }, [open, load, loadSummary]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus(''); setBarPay('');
    setFilters({});
    load({ page: 0, filters: {}, sort: null });
  }, [load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: OrderRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Detail ${r.ORDERNO}`, icon: 'view', onClick: () => openDetail(r) },
      ],
    });
  }, [openDetail]);

  const columns = useMemo(() => buildColumns({ onDetail: openDetail }), [openDetail]);

  useImperativeHandle(ref, () => ({ refresh, create }), [refresh, create]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    checkMenuAccess('50010003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Baru', value: summary.BARU ?? 0 },
    { label: 'Diproses', value: summary.DIPROSES ?? 0 },
    { label: 'Dikirim', value: summary.DIKIRIM ?? 0 },
    { label: 'Selesai', value: summary.SELESAI ?? 0 },
    { label: 'Nunggu bayar', value: summary.NUNGGU ?? 0 },
  ];

  return (
    <div className="grid-box">
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
          </div>
        ))}
      </div>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input className="input" placeholder="Cari nomor/nama" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['BARU', 'DIPROSES', 'DIKIRIM', 'SELESAI', 'DIBATALKAN', 'DIKEMBALIKAN'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barPay} onChange={(e) => setBarPay(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua bayar</option>
          {['BELUM_BAYAR', 'LUNAS', 'REFUND'].map((v) => <option key={v} value={v}>{v}</option>)}
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
      <DataTable<OrderRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        sort={sortDir}
        onSort={onSort}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.ORDERID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmmypurchase;
