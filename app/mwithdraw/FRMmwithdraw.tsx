// Form Ajukan Penarikan. Dibuka lewat Modal (useModal).
// Pilih penjual (saldo tersedia tampil) -> rekening layak -> nominal
// (+Tarik Semua) -> ringkasan biaya + diterima -> simpan.
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatWdRp } from './Cmwithdraw';
import { process_request, read_accounts, read_rule, read_sellers } from './api';

export default function FRMmwithdraw({ onSaved }: { onSaved: () => void }) {
  const { close } = useModal();
  const [sellers, setSellers] = useState<any[]>([]);
  const [sellerid, setSellerid] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountid, setAccountid] = useState('');
  const [amount, setAmount] = useState('');
  const [rule, setRule] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Penjual + aturan fee (sekali saat buka).
  useEffect(() => {
    setLoading(true);
    Promise.all([read_sellers(), read_rule()])
      .then(([s, r]: any[]) => {
        if (parseBoolean(s?.success)) setSellers(s.Rows || []);
        if (parseBoolean(r?.success)) setRule((r.Rows || [])[0] || null);
        else setErr(r?.message || 'Aturan fee belum ada.');
      })
      .catch((e: any) => setErr(e.message || 'Gagal memuat data.'))
      .finally(() => setLoading(false));
  }, []);

  // Rekening layak mengikuti penjual terpilih.
  useEffect(() => {
    setAccounts([]);
    setAccountid('');
    if (!sellerid) return;
    read_accounts(Number(sellerid))
      .then((res: any) => {
        if (parseBoolean(res?.success)) {
          const list = res.Rows || [];
          setAccounts(list);
          const prim = list.find((a: any) => a.ISPRIMARY === 'YES');
          if (prim) setAccountid(String(prim.BANKACCOUNTID));
        }
      })
      .catch(() => { /* dropdown kosong: backend tetap validasi */ });
  }, [sellerid]);

  const seller = sellers.find((s: any) => String(s.SELLERID) === sellerid);
  const avail = seller ? Number(seller.AVAILABLE) || 0 : 0;
  const fee = rule ? Number(rule.WITHDRAWFEE) || 0 : 0;
  const min = rule ? Number(rule.MINWITHDRAW) || 0 : 0;
  const amt = Math.floor(Number(amount) || 0);
  const net = amt > 0 ? amt - fee : 0;

  const save = async () => {
    setErr('');
    if (!await confirmDialog({ message: `Ajukan penarikan ${formatWdRp(amt)} (diterima ${formatWdRp(net)})? Dana dikunci dari saldo tersedia.` })) return;
    setBusy(true);
    try {
      const res: any = await process_request({
        SELLERID: sellerid.trim(),
        BANKACCOUNTID: accountid.trim(),
        AMOUNT: amt,
        IDEMPOTENCYKEY: `wd-${sellerid}-${accountid}-${amt}-${Date.now()}`,
      });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Penarikan diajukan.', 'ok');
        onSaved();
        close();
      } else setErr(res?.message || 'Gagal mengajukan.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Ajukan Penarikan"
      icon="form"
      width="560px"
      footer={
        <>
          <Btn className="primary" icon="check" disabled={busy || loading} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : (
        <>
          <FrmSet legend="Penarikan" icon="form" columns={1}>
            <FrmRow label="Penjual">
              <select value={sellerid} onChange={(e) => setSellerid(e.target.value)}>
                <option value="">— pilih —</option>
                {sellers.map((s: any) => (
                  <option key={s.SELLERID} value={s.SELLERID}>
                    {s.SHOPNAME} (tersedia {formatWdRp(s.AVAILABLE)})
                  </option>
                ))}
              </select>
            </FrmRow>
            <FrmRow label="Rekening">
              <select value={accountid} onChange={(e) => setAccountid(e.target.value)} disabled={!sellerid}>
                <option value="">— pilih —</option>
                {accounts.map((a: any) => (
                  <option key={a.BANKACCOUNTID} value={a.BANKACCOUNTID}>{a.LABEL}</option>
                ))}
              </select>
            </FrmRow>
            {sellerid !== '' && accounts.length === 0 && (
              <p className="loading-hint">Belum ada rekening TERVERIFIKASI + AKTIF untuk penjual ini.</p>
            )}
            <FrmRow label="Nominal">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input" type="number" min={0} placeholder={`min ${formatWdRp(min)}`}
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                />
                <Btn
                  className="btn-sm" disabled={avail <= 0}
                  onClick={() => setAmount(String(Math.max(0, Math.floor(avail))))}
                >
                  Tarik Semua
                </Btn>
              </div>
            </FrmRow>
          </FrmSet>
          <FrmSet legend="Ringkasan" icon="form" columns={2}>
            <FrmRow label="Biaya"><span>{formatWdRp(fee)}</span></FrmRow>
            <FrmRow label="Diterima"><span><b>{formatWdRp(net)}</b></span></FrmRow>
          </FrmSet>
          {err && <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{err}</span></div>}
        </>
      )}
    </Window>
  );
}
