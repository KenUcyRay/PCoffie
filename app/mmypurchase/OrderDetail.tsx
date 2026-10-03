// Modal detail pesanan bersama (dipakai My Purchase + Seller Order).
// Item, rincian harga, pembeli, kurir+resi, riwayat, keluhan.
// Aksi disuntik pemanggil lewat children (berbeda per halaman).
'use client';
import { useCallback, useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatIDR, formatTanggal } from './Cmmypurchase';

export default function OrderDetailModal({ orderid, readDetail, onCloseComplaint, onRespondComplaint, children }: {
  orderid: number;
  readDetail: (orderid: number) => Promise<any>;
  onCloseComplaint?: (complaintid: number) => void;
  onRespondComplaint?: (complaintid: number) => void;
  children?: React.ReactNode;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await readDetail(orderid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [orderid, readDetail]);

  useEffect(() => { load(); }, [load]);

  return (
    <Window
      title={`Pesanan ${detail?.ORDERNO || ''}`}
      icon="report"
      width="720px"
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
          <FrmSet legend="Pesanan" icon="report" columns={2}>
            <FrmRow label="Status">
              <span>
                <span className={`badge ${String(detail.ORDERSTATUS || '').toUpperCase() === 'DIBATALKAN' || String(detail.ORDERSTATUS || '').toUpperCase() === 'DIKEMBALIKAN' ? 'err' : String(detail.ORDERSTATUS || '').toUpperCase() === 'SELESAI' ? 'ok' : ''}`}>
                  {detail.ORDERSTATUS}
                </span>{' '}
                <span className={`badge ${String(detail.PAYSTATUS || '').toUpperCase() === 'LUNAS' ? 'ok' : String(detail.PAYSTATUS || '').toUpperCase() === 'REFUND' ? 'err' : ''}`}>
                  {detail.PAYSTATUS}
                </span>
              </span>
            </FrmRow>
            <FrmRow label="Total"><span><b>{formatIDR(detail.TOTAL)}</b> (subtotal {formatIDR(detail.SUBTOTAL)} + ongkir {formatIDR(detail.SHIPPING)})</span></FrmRow>
            <FrmRow label="Pembeli"><span>{detail.BUYERNAME} • {detail.BUYERPHONE || '-'} • {detail.BUYEREMAIL || '-'}</span></FrmRow>
            <FrmRow label="Alamat"><span>{[detail.ADDRESS, detail.CITY, detail.PROVINCE, detail.POSTALCODE].filter(Boolean).join(', ') || '-'}</span></FrmRow>
            <FrmRow label="Kurir"><span>{detail.COURIER || '-'} • Resi: {detail.TRACKINGNO || '-'}</span></FrmRow>
            <FrmRow label="Waktu"><span>Bayar: {formatTanggal(detail.PAIDAT)} • Kirim: {formatTanggal(detail.SHIPPEDAT)} • Selesai: {formatTanggal(detail.DONEAT)}</span></FrmRow>
            {detail.NOTE && <FrmRow label="Catatan"><span>{detail.NOTE}</span></FrmRow>}
          </FrmSet>
          <FrmSet legend={`Item (${(detail.ITEMS || []).length})`} icon="box" columns={1}>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {(detail.ITEMS || []).map((it: any, i: number) => (
                    <tr key={i}>
                      <td>{it.PRODUCTNAME}</td>
                      <td className="grid-num">{formatIDR(it.UNITPRICE)}</td>
                      <td className="grid-num">{it.QTY}</td>
                      <td className="grid-num">{formatIDR(it.SUBTOTAL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FrmSet>
          <FrmSet legend="Riwayat" icon="history" columns={1}>
            {(detail.HISTORY || []).length === 0 && <p className="empty-hint">Belum ada riwayat.</p>}
            {(detail.HISTORY || []).map((h: any, i: number) => (
              <p key={i} className="loading-hint">
                {formatTanggal(h.ACTTIME)} — {h.OLDSTATUS || '(baru)'} → <b>{h.NEWSTATUS}</b> oleh {h.ACTOR || '-'}{h.NOTE ? ` (${h.NOTE})` : ''}
              </p>
            ))}
          </FrmSet>
          {(detail.COMPLAINTS || []).length > 0 && (
            <FrmSet legend="Keluhan" icon="alert" columns={1}>
              {(detail.COMPLAINTS || []).map((c: any) => (
                <div key={c.COMPLAINTID}>
                  <p><b>{c.REASON}</b> <span className={`badge ${String(c.STATUS || '').toUpperCase() === 'SELESAI' ? 'ok' : 'err'}`}>{c.STATUS}</span></p>
                  <p className="loading-hint">{c.DESCR || '-'}</p>
                  {c.RESPONSE && <p className="loading-hint">Tanggapan: {c.RESPONSE}</p>}
                  {onCloseComplaint && String(c.STATUS || '').toUpperCase() !== 'SELESAI' && (
                    <Btn className="btn-sm" icon="check" onClick={() => onCloseComplaint(Number(c.COMPLAINTID))}>Tutup Keluhan</Btn>
                  )}
                  {onRespondComplaint && (String(c.STATUS || '').toUpperCase() === 'TERBUKA' || String(c.STATUS || '').toUpperCase() === 'DITANGGAPI') && (
                    <Btn className="btn-sm" icon="edit" onClick={() => onRespondComplaint(Number(c.COMPLAINTID))}>Tanggapi</Btn>
                  )}
                </div>
              ))}
            </FrmSet>
          )}
          {children && <div className="toolbar">{children}</div>}
        </>
      ) : null}
    </Window>
  );
}
