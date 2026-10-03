// GRIDsales — laporan penjualan 3 tab (Tiket/Merchandise/Pendapatan Platform)
// + tren harian (recharts) + peringatan pasca-payout + export/cetak.
// Read-only: tanpa tambah/ubah/hapus.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { Btn, Icon } from '@/components/Icon';
import { DataTable, noColumn } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { downloadRptCSV, formatRptRp, formatRptTgl } from './Cmsales';
import * as proxy from './api';

export type GridApi = { refresh: () => void };

type TrendPoint = { DATE: string; TOTAL: number; N?: number };

const MONTH_START = (() => {
  const d = new Date(); d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const GRIDsales = forwardRef<GridApi>(function GRIDsales(_props, ref) {
  const [tab, setTab] = useState<'tiket' | 'merch' | 'platform'>('tiket');
  const [from, setFrom] = useState(MONTH_START);
  const [to, setTo] = useState(TODAY);
  const [eventId, setEventId] = useState('');
  const [cat, setCat] = useState('');
  const [city, setCity] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [merchCat, setMerchCat] = useState('');
  const [filters, setFilters] = useState<any>({ EVENTS: [], CATS: [], CITIES: [], SELLERS: [] });
  const [ticket, setTicket] = useState<any>(null);
  const [merch, setMerch] = useState<any>(null);
  const [platform, setPlatform] = useState<any>(null);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadFilters = useCallback(async () => {
    try {
      const res: any = await proxy.read_filters();
      if (parseBoolean(res?.success)) setFilters((res.Rows || [])[0] || { EVENTS: [], CATS: [], CITIES: [], SELLERS: [] });
    } catch { /* filter gagal: kolom tetap tampil tanpa opsi */ }
  }, []);

  const load = useCallback(async (t: string = tab) => {
    setLoading(true);
    setErr('');
    try {
      if (t === 'tiket') {
        const [r, a] = await Promise.all([
          proxy.read_ticket({ paidfrom: from, paidto: to, eventid: eventId, category: cat, city }),
          proxy.read_adjustments({ paidfrom: from, paidto: to }),
        ]);
        if (parseBoolean((r as any)?.success)) setTicket(r);
        else setErr((r as any)?.message || 'Gagal memuat.');
        if (parseBoolean((a as any)?.success)) setAdjustments(a.Rows || []);
      } else if (t === 'merch') {
        const r: any = await proxy.read_merch({ paidfrom: from, paidto: to, sellerid: sellerId, category: merchCat });
        if (parseBoolean(r?.success)) setMerch(r);
        else setErr(r?.message || 'Gagal memuat.');
      } else {
        const r: any = await proxy.read_platform({ paidfrom: from, paidto: to });
        if (parseBoolean(r?.success)) setPlatform(r);
        else setErr(r?.message || 'Gagal memuat.');
      }
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat.');
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, eventId, cat, city, sellerId, merchCat]);

  const refresh = useCallback(() => { load(tab); }, [load, tab]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { load(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const apply = useCallback(() => { load(tab); }, [load, tab]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const name = tab === 'tiket' ? 'TIKET' : tab === 'merch' ? 'MERCH' : 'PLATFORM';
      const res: any = await proxy.read_export(name, { paidfrom: from, paidto: to });
      if (parseBoolean(res?.success) && res.csv_base64) {
        downloadRptCSV(res.csv_base64, res.filename || 'sales.csv');
        toast('Success', 'Export selesai.', 'ok');
      } else toast('Error', res?.message || 'Export gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setExporting(false);
    }
  }, [tab, from, to]);

  // Kartu ringkasan: satu sumber = salah satu payload tab aktif.
  const cards = (() => {
    if (tab === 'tiket' && ticket) {
      const s = (ticket.Rows || [])[0] || {};
      return [
        { label: 'Tiket terbayar', value: s.COUNT ?? 0 },
        { label: 'Kotor', value: formatRptRp(s.GROSS) },
        { label: 'Diskon', value: formatRptRp(s.DISCOUNT) },
        { label: 'Biaya layanan', value: formatRptRp(s.SERVICE) },
        { label: 'Biaya platform', value: formatRptRp(s.PLATFORM) },
        { label: 'Refund', value: formatRptRp(s.REFUND) },
        { label: 'Bersih penyelenggara', value: formatRptRp(s.NET_OWNER) },
      ];
    }
    if (tab === 'merch' && merch) {
      const s = (merch.Rows || [])[0] || {};
      return [
        { label: 'Pesanan terbayar', value: s.COUNT ?? 0 },
        { label: 'Penjualan barang', value: formatRptRp(s.GROSS) },
        { label: 'Ongkir', value: formatRptRp(s.SHIPPING) },
        { label: 'Biaya platform', value: formatRptRp(s.PLATFORM) },
        { label: 'Refund', value: formatRptRp(s.REFUND) },
        { label: 'Bersih penjual', value: formatRptRp(s.NET_SELLER) },
      ];
    }
    if (tab === 'platform' && platform) {
      const s = (platform.Rows || [])[0] || {};
      return [
        { label: 'Biaya platform', value: formatRptRp(s.PLATFORM_FEE) },
        { label: 'Biaya layanan', value: formatRptRp(s.SERVICE_FEE) },
        { label: 'Pendapatan iklan', value: formatRptRp(s.AD_REVENUE) },
        { label: 'Biaya penarikan', value: formatRptRp(s.WITHDRAWAL_FEE) },
        { label: 'Biaya metode (est)', value: formatRptRp(s.METHOD_FEE_EST) },
        { label: 'Pendapatan bersih', value: formatRptRp(s.NET) },
      ];
    }
    return [];
  })();

  const trend: TrendPoint[] = tab === 'tiket' ? (ticket?.Trend || [])
    : tab === 'merch' ? (merch?.Trend || [])
    : (platform?.Trend || []);

  // Kolom tabel rincian per tab.
  const ticketCols: Column<any>[] = [
    noColumn,
    { key: 'EVENTCODE', label: 'Kode', width: 130, filter: false },
    { key: 'TITLE', label: 'Event', width: 200 },
    { key: 'ORGNAME', label: 'Penyelenggara', width: 150 },
    { key: 'COUNT', label: 'Terjual', width: 80, align: 'right', filter: false },
    { key: 'GROSS', label: 'Kotor', width: 120, align: 'right', filter: false, render: (r) => formatRptRp(r.GROSS) },
    { key: 'DISCOUNT', label: 'Diskon', width: 110, align: 'right', filter: false, render: (r) => formatRptRp(r.DISCOUNT) },
    { key: 'PLATFORM', label: 'Biaya platform', width: 130, align: 'right', filter: false, render: (r) => formatRptRp(r.PLATFORM) },
    { key: 'REFUND', label: 'Refund', width: 110, align: 'right', filter: false, render: (r) => formatRptRp(r.REFUND) },
    { key: 'NET_OWNER', label: 'Bersih', width: 130, align: 'right', filter: false, render: (r) => formatRptRp(r.NET_OWNER) },
    { key: 'PAYOUT', label: 'Payout', width: 100, filter: false },
  ];
  const merchCols: Column<any>[] = [
    noColumn,
    { key: 'SHOPNAME', label: 'Penjual', width: 200 },
    { key: 'COUNT', label: 'Pesanan', width: 80, align: 'right', filter: false },
    { key: 'GROSS', label: 'Barang', width: 120, align: 'right', filter: false, render: (r) => formatRptRp(r.GROSS) },
    { key: 'SHIPPING', label: 'Ongkir', width: 110, align: 'right', filter: false, render: (r) => formatRptRp(r.SHIPPING) },
    { key: 'PLATFORM', label: 'Biaya platform', width: 130, align: 'right', filter: false, render: (r) => formatRptRp(r.PLATFORM) },
    { key: 'REFUND', label: 'Refund', width: 110, align: 'right', filter: false, render: (r) => formatRptRp(r.REFUND) },
    { key: 'NET_SELLER', label: 'Bersih', width: 130, align: 'right', filter: false, render: (r) => formatRptRp(r.NET_SELLER) },
  ];
  const platformCols: Column<any>[] = [
    noColumn,
    { key: 'TYPE', label: 'Jenis', width: 110, filter: false },
    { key: 'N', label: 'Transaksi', width: 90, align: 'right', filter: false },
    { key: 'PLATFORMFEE', label: 'Biaya platform', width: 140, align: 'right', filter: false, render: (r) => formatRptRp(r.PLATFORMFEE) },
    { key: 'SERVICEFEE', label: 'Biaya layanan', width: 130, align: 'right', filter: false, render: (r) => formatRptRp(r.SERVICEFEE) },
    { key: 'TOTAL', label: 'Total', width: 140, align: 'right', filter: false, render: (r) => formatRptRp(r.TOTAL) },
  ];

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <Btn className={tab === 'tiket' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('tiket')}>Tiket</Btn>
        <Btn className={tab === 'merch' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('merch')}>Merchandise</Btn>
        <Btn className={tab === 'platform' ? 'primary btn-sm' : 'btn-sm'} onClick={() => setTab('platform')}>Pendapatan Platform</Btn>
      </div>
      {/* Bar filter umum */}
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        {tab === 'tiket' && (
          <>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ width: 180 }}>
              <option value="">Semua event</option>
              {(filters.EVENTS || []).map((e: any) => <option key={e.EVENTID} value={e.EVENTID}>{e.TITLE}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 120 }}>
              <option value="">Semua kategori</option>
              {(filters.CATS || []).map((c: any) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATCODE}</option>)}
            </select>
            <select value={city} onChange={(e) => setCity(e.target.value)} style={{ width: 120 }}>
              <option value="">Semua kota</option>
              {(filters.CITIES || []).map((c: any) => <option key={c.CITYCODE} value={c.CITYCODE}>{c.CITYCODE}</option>)}
            </select>
          </>
        )}
        {tab === 'merch' && (
          <>
            <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} style={{ width: 180 }}>
              <option value="">Semua penjual</option>
              {(filters.SELLERS || []).map((s: any) => <option key={s.SELLERID} value={s.SELLERID}>{s.SHOPNAME}</option>)}
            </select>
            <input className="input" placeholder="Kode kategori produk" value={merchCat} onChange={(e) => setMerchCat(e.target.value)} style={{ width: 150 }} />
          </>
        )}
        <Btn className="primary btn-sm" icon="search" onClick={apply}>Terapkan</Btn>
        <Btn className="btn-sm" icon="refresh" onClick={() => { setFrom(MONTH_START); setTo(TODAY); setEventId(''); setCat(''); setCity(''); setSellerId(''); setMerchCat(''); setTimeout(() => load(tab), 0); }}>Reset</Btn>
        <span className="spacer" />
        <Btn className="btn-sm" icon="download" disabled={exporting} onClick={doExport}>{exporting ? 'Mengekspor…' : 'Export CSV'}</Btn>
        <Btn className="btn-sm" icon="report" onClick={() => window.print()}>Cetak</Btn>
      </div>

      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} /><span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load(tab)}>Coba lagi</Btn>
        </div>
      )}

      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-info"><b>{c.value}</b><span>{c.label}</span></span>
          </div>
        ))}
      </div>

      {/* Tren harian */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="loading-hint" style={{ padding: '6px 10px' }}>Tren harian</div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={trend} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="DATE" tickFormatter={(v) => formatRptTgl(v)} fontSize={11} />
              <YAxis tickFormatter={(v) => (typeof v === 'number' ? `${Math.round(v / 1000)}rb` : v)} fontSize={11} />
              <Tooltip formatter={(v: any) => formatRptRp(v)} labelFormatter={(l) => formatRptTgl(l)} />
              <Line type="monotone" dataKey="TOTAL" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabel rincian */}
      {loading ? (
        <div className="card-body"><span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span></div>
      ) : tab === 'tiket' ? (
        <DataTable<any> columns={ticketCols} rows={ticket?.Events || []} filters={{}} onFilter={() => {}} rowKey={(r) => String(r.EVENTID ?? '')} />
      ) : tab === 'merch' ? (
        <DataTable<any> columns={merchCols} rows={merch?.Sellers || []} filters={{}} onFilter={() => {}} rowKey={(r) => String(r.SELLERID ?? '')} />
      ) : (
        <DataTable<any> columns={platformCols} rows={platform?.ByType || []} filters={{}} onFilter={() => {}} rowKey={(r) => String(r.TYPE ?? '')} />
      )}

      {/* Peringatan penyesuaian setelah payout (tab Tiket) */}
      {tab === 'tiket' && adjustments.length > 0 && (
        <div className="toast-err alert-inline" style={{ marginTop: 8 }}>
          <Icon name="alertCircle" size={17} />
          <span>
            Penyesuaian setelah payout: {adjustments.map((a: any, i: number) => (
              <span key={i}>{a.TITLE}: {a.KIND === 'REFUND' ? 'refund' : 'batal bayar'} {formatRptRp(a.AMOUNT)} ({formatRptTgl(a.AT)}){i < adjustments.length - 1 ? '; ' : ''}</span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
});

export default GRIDsales;
