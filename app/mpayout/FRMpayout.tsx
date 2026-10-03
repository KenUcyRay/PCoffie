// Modal Ajukan Payout: pratinjau hitungan + pilih rekening + konfirmasi.
// Dibuka lewat Modal (useModal) dari tab Siap Dicairkan.
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatPoRp } from './Cmpayout';
import { preview, process_request } from './api';

export default function FRMpayout({ eventid, onSaved }: { eventid: number; onSaved: () => void }) {
  const { close } = useModal();
  const [data, setData] = useState<any>(null);
  const [accountid, setAccountid] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    setErr('');
    preview(eventid)
      .then((res: any) => {
        if (parseBoolean(res?.success)) {
          const d = (res.Rows || [])[0] || null;
          setData(d);
          if (d && Array.isArray(d.ACCOUNTS) && d.ACCOUNTS.length > 0) {
            const prim = d.ACCOUNTS.find((a: any) => a.ISPRIMARY === 'YES') || d.ACCOUNTS[0];
            setAccountid(String(prim.BANKACCOUNTID));
          }
        } else setErr(res?.message || 'Gagal memuat pratinjau.');
      })
      .catch((e: any) => setErr(e.message || 'Gagal memuat pratinjau.'))
      .finally(() => setLoading(false));
  }, [eventid]);

  const save = async () => {
    if (!await confirmDialog({ message: `Ajukan payout ${data?.TITLE} sebesar ${formatPoRp(data?.NET)}?` })) return;
    setBusy(true);
    try {
      const res: any = await process_request({ EVENTID: eventid, BANKACCOUNTID: accountid.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Payout diajukan.', 'ok');
        onSaved();
        close();
      } else setErr(res?.message || 'Gagal mengajukan.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const eligible = data && data.ELIGIBLE === 'YES';

  return (
    <Window
      title="Ajukan Payout"
      icon="form"
      width="560px"
      footer={
        <>
          {eligible && (
            <Btn className="primary" icon="check" disabled={busy || loading || !accountid} onClick={save}>Ajukan</Btn>
          )}
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
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
        </div>
      ) : data ? (
        <>
          {!eligible && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Tidak layak: {(data.REASONS || []).join(' | ') || '-'}</span>
            </div>
          )}
          <FrmSet legend="Hitungan" icon="form" columns={2}>
            <FrmRow label="Event"><span>{data.TITLE} ({data.EVENTCODE})</span></FrmRow>
            <FrmRow label="Penyelenggara"><span>{data.ORGNAME}</span></FrmRow>
            <FrmRow label="Tiket terjual"><span>{data.COUNT}</span></FrmRow>
            <FrmRow label="Kotor"><span>{formatPoRp(data.GROSS)}</span></FrmRow>
            <FrmRow label="Diskon"><span>{formatPoRp(data.DISCOUNT)}</span></FrmRow>
            <FrmRow label="Biaya platform"><span>{formatPoRp(data.PLATFORMFEE)}</span></FrmRow>
            <FrmRow label="Refund"><span>{formatPoRp(data.REFUND)}</span></FrmRow>
            <FrmRow label="Bersih"><span><b>{formatPoRp(data.NET)}</b></span></FrmRow>
          </FrmSet>
          <FrmSet legend="Rekening" icon="form" columns={1}>
            <FrmRow label="Tujuan transfer">
              <select value={accountid} onChange={(e) => setAccountid(e.target.value)}>
                <option value="">— pilih —</option>
                {(data.ACCOUNTS || []).map((a: any) => (
                  <option key={a.BANKACCOUNTID} value={a.BANKACCOUNTID}>
                    {a.BANKNAME} ****{a.LAST4} ({a.ACCTNAME})
                  </option>
                ))}
              </select>
            </FrmRow>
          </FrmSet>
          <p className="loading-hint">Snapshot hitungan disimpan; refund/pembayaran baru setelah ini tidak mengubah payout ini.</p>
        </>
      ) : null}
    </Window>
  );
}
