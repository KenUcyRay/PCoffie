// GRIDmsellerorder — kartu ringkasan + tabel pesanan (default paling mendesak)
// + detail + aksi seller (proses, kirim+resi, batal, tanggapi, retur, cetak label).
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, sort, page, total, loading, err, summary, canWrite, barF, sellers
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
import OrderDetailModal from '../mmypurchase/OrderDetail';
import { formatIDR, formatTanggal } from './Cmsellerorder';
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
  COURIER?: string;
  TRACKINGNO?: string;
  TOTAL?: number | string;
  ORDERSTATUS?: string;
  PAYSTATUS?: string;
  PAIDAT?: string;
  SHIPPEDAT?: string;
  SYSCREATEDATE?: string;
  ITEMCOUNT?: number | string;
  LATE?: string;
};

export type GridApi = {
  refresh: () => void;
};

const COURIERS = ['JNE', 'J&T', 'SiCepat', 'AnterAja', 'Pos Indonesia', 'Lainnya'];

function buildColumns(h: { onDetail: (r: OrderRow) => void }): Column<OrderRow>[] {
  return [
    noColumn,
    { key: 'ORDERNO', label: 'Nomor', width: 140, sortable: true },
    { key: 'SHOPNAME', label: 'Penjual', width: 130, filter: false },
    {
      key: 'BUYERNAME', label: 'Pembeli', width: 130, sortable: false,
      render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); h.onDetail(r); }}>{r.BUYERNAME || '-'}</a>,
    },
    { key: 'ITEMCOUNT', label: 'Item', width: 60, align: 'right', filter: false },
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
        const late = String((r as any).LATE || '') === 'YES';
        return (
          <span>
            <span className={`badge ${s === 'DIBATALKAN' || s === 'DIKEMBALIKAN' ? 'err' : s === 'SELESAI' ? 'ok' : ''}`}>{s || '-'}</span>
            {late && <span className="badge err">Terlambat</span>}
          </span>
        );
      },
    },
    {
      key: 'PAYSTATUS', label: 'Bayar', width: 100, sortable: true,
      filter: 'select', options: [
        { value: 'BELUM_BAYAR', label: 'BELUM_BAYAR' }, { value: 'LUNAS', label: 'LUNAS' },
        { value: 'REFUND', label: 'REFUND' },
      ] as any,
      render: (r) => {
        const s = String(r.PAYSTATUS || '').toUpperCase();
        return <span className={`badge ${s === 'LUNAS' ? 'ok' : s === 'REFUND' ? 'err' : ''}`}>{s || '-'}</span>;
      },
    },
    { key: 'SYSCREATEDATE', label: 'Tanggal', width: 140, filter: false, sortable: true, render: (r) => formatTanggal(r.SYSCREATEDATE) },
    actionsColumn<OrderRow>((r) => (
      <Btn
        className="btn-sm" iconOnly icon="view"
        title={`Detail ${r.ORDERNO}`} aria-label={`Detail ${r.ORDERNO}`}
        onClick={() => h.onDetail(r)}
      />
    ), 48),
  ];
}

// Modal kirim (kurir + resi wajib).
function ShipForm({ orderid, orderno, onDone }: { orderid: number; orderno: string; onDone: () => void }) {
  const { close } = useModal();
  const [courier, setCourier] = useState('JNE');
  const [resi, setResi] = useState('');
  const [errs, setErrs] = useState<{ RESI?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!resi.trim()) { setErrs({ RESI: 'Nomor resi wajib diisi.' }); return; }
    if (!await confirmDialog({ message: `Kirim pesanan ${orderno} via ${courier} ${resi.trim()}?` })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_ship({ ORDERID: orderid, COURIER: courier, TRACKINGNO: resi.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pesanan dikirim.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal mengirim.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Kirim ${orderno}`}
      icon="package"
      width="440px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="check" disabled={busy} onClick={submit}>Kirim</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Kurir">
        <select value={courier} onChange={(e) => setCourier(e.target.value)}>
          {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FrmRow>
      <FrmRow label="Resi">
        <div>
          <input className="input" value={resi} onChange={(e) => { setResi(e.target.value); setErrs({}); }} maxLength={50} />
          {errs.RESI && <span className="field-err">{errs.RESI}</span>}
        </div>
      </FrmRow>
    </Window>
  );
}

// Modal pengembalian (alasan + stok kembali atau tidak).
function ReturnForm({ orderid, orderno, onDone }: { orderid: number; orderno: string; onDone: () => void }) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [restock, setRestock] = useState('YES');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan pengembalian wajib diisi.'); return; }
    if (!await confirmDialog({ message: `Proses pengembalian ${orderno}? Pembayaran menjadi REFUND.`, okText: 'Ya, Proses', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_return({ ORDERID: orderid, REASON: reason.trim(), RESTOCKABLE: restock });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pengembalian diproses.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal memproses.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Pengembalian ${orderno}`}
      icon="arrowL"
      width="440px"
      footer={
        <>
          <Btn className="danger" icon="check" disabled={busy} onClick={submit}>Proses</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmRow label="Alasan">
        <div>
          <input className="input" value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }} maxLength={200} />
          {reasonErr && <span className="field-err">{reasonErr}</span>}
        </div>
      </FrmRow>
      <FrmRow label="Stok kembali">
        <select value={restock} onChange={(e) => setRestock(e.target.value)}>
          <option value="YES">Ya, barang layak jual</option>
          <option value="NO">Tidak, barang rusak/hilang</option>
        </select>
      </FrmRow>
    </Window>
  );
}

// Modal label pengiriman (cetak browser).
function LabelModal({ orderid }: { orderid: number }) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await proxy.read_detail(orderid);
        if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      } catch { /* abaikan */ }
    })();
  }, [orderid]);

  return (
    <Window
      title={`Label ${detail?.ORDERNO || ''}`}
      icon="report"
      width="440px"
      footer={
        <>
          <Btn className="primary" icon="report" onClick={() => window.print()}>Cetak</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
        </>
      }
    >
      {detail ? (
        <div style={{ display: 'grid', gap: 8, border: '1px dashed var(--border-2)', borderRadius: 8, padding: 12 }}>
          <p><b>Penerima:</b> {detail.BUYERNAME} • {detail.BUYERPHONE || '-'}</p>
          <p><b>Alamat:</b> {[detail.ADDRESS, detail.CITY, detail.PROVINCE, detail.POSTALCODE].filter(Boolean).join(', ')}</p>
          <p><b>Pengirim:</b> {detail.SHOPNAME} • {detail.COURIER || '-'} • Resi: {detail.TRACKINGNO || '-'}</p>
          <p><b>Isi paket:</b></p>
          <ul>
            {(detail.ITEMS || []).map((it: any, i: number) => (
              <li key={i}>{it.PRODUCTNAME} × {it.QTY}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</p>
      )}
    </Window>
  );
}

// Modal tanggapi keluhan (tanggapan + status DITANGGAPI/SELESAI).
function RespondModal({ complaintid, onDone }: { complaintid: number; onDone: () => void }) {
  const { close } = useModal();
  const [resp, setResp] = useState('');
  const [respErr, setRespErr] = useState('');
  const [status, setStatus] = useState('DITANGGAPI');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!resp.trim()) { setRespErr('Tanggapan wajib diisi.'); return; }
    if (!await confirmDialog({ message: `Tanggapi keluhan menjadi ${status}?` })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_complaint_respond({ COMPLAINTID: complaintid, RESPONSE: resp.trim(), STATUS: status });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Keluhan ditanggapi.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal menanggapi.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Tanggapi Keluhan"
      icon="edit"
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
      <FrmRow label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="DITANGGAPI">DITANGGAPI</option>
          <option value="SELESAI">SELESAI</option>
        </select>
      </FrmRow>
    </Window>
  );
}

// Modal alasan generik (batalkan pesanan).
function ReasonModal({ title, label, action, orderid, onDone }: {
  title: string; label: string; action: 'cancel'; orderid: number; onDone: () => void;
}) {
  const { close } = useModal();
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setReasonErr('Alasan wajib diisi.'); return; }
    if (!await confirmDialog({ message: `${title}?`, okText: 'Ya', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await proxy.process_cancel({ ORDERID: orderid, REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Berhasil.', 'ok');
        onDone();
        close();
      } else toast('Error', res?.message || 'Gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
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

const GRIDmsellerorder = forwardRef<GridApi>(function GRIDmsellerorder(_props, ref) {
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
  const [barSeller, setBarSeller] = useState('');
  const [barCourier, setBarCourier] = useState('');
  const [barFrom, setBarFrom] = useState('');
  const [barTo, setBarTo] = useState('');
  const [sellers, setSellers] = useState<{ SELLERID: number; SHOPNAME?: string }[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState; bar?: Partial<{ q: string; status: string; pay: string; seller: string; courier: string; from: string; to: string }> }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    const s = opts?.sort !== undefined ? opts.sort : sort;
    const bq = opts?.bar?.q ?? barQ;
    const bs = opts?.bar?.status ?? barStatus;
    const bp = opts?.bar?.pay ?? barPay;
    const bse = opts?.bar?.seller ?? barSeller;
    const bc = opts?.bar?.courier ?? barCourier;
    const bf = opts?.bar?.from ?? barFrom;
    const bt = opts?.bar?.to ?? barTo;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_data({
        limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: bq,
        filters: f, sort: s ?? undefined,
        status: bs, paystatus: bp, sellerid: bse, courier: bc,
        date_from: bf, date_to: bt,
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
  }, [page, filters, sort, barQ, barStatus, barPay, barSeller, barCourier, barFrom, barTo]);

  const loadSummary = useCallback(async () => {
    try {
      const res: any = await proxy.read_summary();
      if (parseBoolean(res?.success)) setSummary((res.Rows || [])[0] || {});
    } catch { /* ringkasan gagal: tabel tetap tampil */ }
  }, []);

  const loadSellers = useCallback(async () => {
    try {
      const res: any = await proxy.read_sellers();
      if (parseBoolean(res?.success)) setSellers(res.Rows || []);
    } catch { /* abaikan */ }
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

  const openDetail = useCallback((r: OrderRow) => {
    if (r.ORDERID == null) return;
    const oid = Number(r.ORDERID);
    const st = String(r.ORDERSTATUS || '').toUpperCase();
    const pay = String(r.PAYSTATUS || '').toUpperCase();
    open(
      <OrderDetailModal
        orderid={oid} readDetail={proxy.read_detail}
        onRespondComplaint={(cid) => open(<RespondModal complaintid={cid} onDone={reload} />)}
      >
        {canWrite && (
          <>
            {st === 'BARU' && pay === 'LUNAS' && (
              <Btn
                className="btn-sm" icon="check"
                onClick={async () => {
                  if (!await confirmDialog({ message: `Proses pesanan ${r.ORDERNO}?` })) return;
                  try {
                    const res: any = await proxy.process_process({ ORDERID: oid });
                    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); reload(); }
                    else toast('Error', res?.message, 'err');
                  } catch (e: any) { toast('Error', e.message, 'err'); }
                }}
              >
                Proses
              </Btn>
            )}
            {st === 'DIPROSES' && (
              <Btn
                className="btn-sm" icon="package"
                onClick={() => open(<ShipForm orderid={oid} orderno={String(r.ORDERNO || '')} onDone={reload} />)}
              >
                Input Resi & Kirim
              </Btn>
            )}
            {(st === 'BARU' || st === 'DIPROSES') && (
              <Btn
                className="danger btn-sm" icon="close"
                onClick={() => open(<ReasonModal title={`Batalkan ${r.ORDERNO}`} label="Alasan" action="cancel" orderid={oid} onDone={reload} />)}
              >
                Batalkan
              </Btn>
            )}
            {(st === 'DIKIRIM' || st === 'SELESAI') && (
              <Btn
                className="btn-sm" icon="arrowL"
                onClick={() => open(<ReturnForm orderid={oid} orderno={String(r.ORDERNO || '')} onDone={reload} />)}
              >
                Proses Pengembalian
              </Btn>
            )}
            <Btn
              className="btn-sm" icon="report"
              onClick={() => open(<LabelModal orderid={oid} />)}
            >
              Cetak Label
            </Btn>
          </>
        )}
      </OrderDetailModal>,
    );
  }, [open, canWrite, reload]);

  const applyBar = useCallback(() => { load({ page: 0 }); }, [load]);

  const clearBar = useCallback(() => {
    setBarQ(''); setBarStatus(''); setBarPay(''); setBarSeller(''); setBarCourier(''); setBarFrom(''); setBarTo('');
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

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    load({ page: 0, filters: {}, sort: null });
    loadSummary();
    loadSellers();
    checkMenuAccess('50020003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortDir: SortDir = sort ? { key: sort.key, dir: sort.dir } : null;

  const cards = [
    { label: 'Perlu Diproses', value: summary.NEEDPROCESS ?? 0 },
    { label: 'Perlu Dikirim', value: summary.NEEDSHIP ?? 0 },
    { label: 'Terlambat', value: summary.LATE ?? 0 },
    { label: 'Keluhan Terbuka', value: summary.COMPLAINT ?? 0 },
    { label: 'Selesai', value: summary.DONE ?? 0 },
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
        <input className="input" placeholder="Cari nomor/nama/resi" value={barQ} onChange={(e) => setBarQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select value={barSeller} onChange={(e) => setBarSeller(e.target.value)} style={{ width: 150 }}>
          <option value="">Semua penjual</option>
          {sellers.map((s) => <option key={s.SELLERID} value={s.SELLERID}>{s.SHOPNAME}</option>)}
        </select>
        <select value={barStatus} onChange={(e) => setBarStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua status</option>
          {['BARU', 'DIPROSES', 'DIKIRIM', 'SELESAI', 'DIBATALKAN', 'DIKEMBALIKAN'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barPay} onChange={(e) => setBarPay(e.target.value)} style={{ width: 130 }}>
          <option value="">Semua bayar</option>
          {['BELUM_BAYAR', 'LUNAS', 'REFUND'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={barCourier} onChange={(e) => setBarCourier(e.target.value)} style={{ width: 120 }}>
          <option value="">Semua kurir</option>
          {COURIERS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input className="input" type="date" value={barFrom} onChange={(e) => setBarFrom(e.target.value)} style={{ width: 150 }} />
        <input className="input" type="date" value={barTo} onChange={(e) => setBarTo(e.target.value)} style={{ width: 150 }} />
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

export default GRIDmsellerorder;
