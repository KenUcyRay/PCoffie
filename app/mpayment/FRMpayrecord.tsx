// Form Catat Pembayaran bertahap (reusable: dipakai Payment History dan
// halaman lama). Dibuka lewat Modal (useModal).
// Langkah: 1 jenis -> 2 cari & pilih referensi -> 3 metode/promo/waktu ->
// 4 ringkasan hitungan backend (tidak bisa diedit) -> simpan.
// Props presetType/presetRefId/presetLabel: lompat ke langkah 3 (wiring).
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatPayRp } from './Cmpayment';
import { preview_record, process_record, read_methods, search_payable } from './api';

export default function FRMpayrecord({
  onSaved, presetType, presetRefId, presetLabel,
}: {
  onSaved: () => void;
  presetType?: string;
  presetRefId?: number;
  presetLabel?: string;
}) {
  const { close } = useModal();
  const [step, setStep] = useState(presetType && presetRefId ? 3 : 1);
  const [reftype, setReftype] = useState(presetType || 'TIKET');
  const [refQ, setRefQ] = useState('');
  const [refs, setRefs] = useState<any[]>([]);
  const [finding, setFinding] = useState(false);
  const [refid, setRefid] = useState<number | null>(presetRefId || null);
  const [refLabel, setRefLabel] = useState(presetLabel || '');
  const [methods, setMethods] = useState<any[]>([]);
  const [methodid, setMethodid] = useState('');
  const [promo, setPromo] = useState('');
  const [paidat, setPaidat] = useState('');
  const [extref, setExtref] = useState('');
  const [calc, setCalc] = useState<any>(null);
  const [calcErr, setCalcErr] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Metode aktif (sekali saat buka).
  useEffect(() => {
    read_methods()
      .then((res: any) => { if (parseBoolean(res?.success)) setMethods(res.Rows || []); })
      .catch(() => { /* dropdown kosong: backend tetap validasi */ });
  }, []);

  // Cari referensi yang boleh dibayar.
  const find = async () => {
    setFinding(true);
    setCalc(null);
    try {
      const res: any = await search_payable(reftype, refQ.trim());
      if (parseBoolean(res?.success)) setRefs(res.Rows || []);
      else toast('Error', res?.message || 'Pencarian gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setFinding(false);
    }
  };

  const pick = (id: number, label: string) => {
    setRefid(id);
    setRefLabel(label);
    setCalc(null);
    setCalcErr('');
    setStep(3);
  };

  // Hitung ringkasan via backend (pratinjau, tanpa menulis).
  const calculate = async () => {
    if (!refid) return;
    setCalculating(true);
    setCalcErr('');
    setCalc(null);
    try {
      const res: any = await preview_record({
        REFTYPE: reftype, REFID: refid,
        PAYMETHODID: methodid.trim(), PROMOCODE: promo.trim(),
        PAIDAT: paidat.trim().replace('T', ' '), EXTREF: extref.trim(),
      });
      if (parseBoolean(res?.success)) {
        setCalc((res.Rows || [])[0] || null);
        setStep(4);
      } else setCalcErr(res?.message || 'Gagal menghitung.');
    } catch (e: any) {
      setCalcErr(e.message);
    } finally {
      setCalculating(false);
    }
  };

  const save = async () => {
    if (!refid) return;
    if (!await confirmDialog({ message: `Simpan pembayaran ${refLabel}?` })) return;
    setBusy(true);
    try {
      const res: any = await process_record({
        REFTYPE: reftype, REFID: refid,
        PAYMETHODID: methodid.trim(), PROMOCODE: promo.trim(),
        PAIDAT: paidat.trim().replace('T', ' '), EXTREF: extref.trim(),
      });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pembayaran tercatat.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Catat Pembayaran"
      icon="form"
      width="600px"
      footer={
        <>
          {step > 1 && !(presetType && presetRefId) && (
            <Btn icon="arrowL" disabled={busy || calculating} onClick={() => setStep(step - 1)}>Kembali</Btn>
          )}
          {step === 3 && (
            <Btn className="primary" icon="check" disabled={busy || calculating || !refid} onClick={calculate}>
              {calculating ? 'Menghitung…' : 'Hitung Ringkasan'}
            </Btn>
          )}
          {step === 4 && (
            <Btn className="primary" icon="check" disabled={busy} onClick={save}>Simpan</Btn>
          )}
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      {step === 1 && (
        <FrmSet legend="Jenis" icon="form" columns={1}>
          <FrmRow label="Jenis pembayaran">
            <select value={reftype} onChange={(e) => { setReftype(e.target.value); setRefs([]); setRefid(null); }}>
              <option value="TIKET">Tiket</option>
              <option value="MERCH">Merchandise</option>
              <option value="IKLAN">Iklan</option>
            </select>
          </FrmRow>
          <div className="toolbar">
            <Btn className="primary btn-sm" icon="arrowL" onClick={() => setStep(2)}>Lanjut</Btn>
          </div>
        </FrmSet>
      )}
      {step === 2 && (
        <FrmSet legend="Referensi (hanya yang boleh dibayar)" icon="search" columns={1}>
          <FrmRow label="Cari">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input" placeholder="nama/kode/nomor"
                value={refQ} onChange={(e) => setRefQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') find(); }}
              />
              <Btn className="primary btn-sm" icon="search" disabled={finding} onClick={find}>
                {finding ? 'Mencari…' : 'Cari'}
              </Btn>
            </div>
          </FrmRow>
          {refs.map((r: any) => (
            <div key={r.REFID} className="toolbar" style={{ borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
              <span style={{ flex: 1 }}>{r.LABEL} <span className="loading-hint">({r.EXTRA || ''})</span></span>
              <Btn className="primary btn-sm" onClick={() => pick(Number(r.REFID), String(r.LABEL))}>Pilih</Btn>
            </div>
          ))}
          {refs.length === 0 && <p className="loading-hint">Cari dulu, lalu pilih satu referensi.</p>}
        </FrmSet>
      )}
      {step === 3 && (
        <>
          <FrmSet legend="Pembayaran" icon="form" columns={2}>
            <FrmRow label="Referensi">
              <span><b>{refLabel || `#${refid}`}</b></span>
            </FrmRow>
            <FrmRow label="Metode">
              <select value={methodid} onChange={(e) => setMethodid(e.target.value)}>
                <option value="">— pilih —</option>
                {methods.map((m: any) => (
                  <option key={m.PAYID} value={m.PAYID}>{m.PAYNAME}</option>
                ))}
              </select>
            </FrmRow>
            {reftype === 'TIKET' && (
              <FrmRow label="Kode promo">
                <input
                  className="input" style={{ fontFamily: 'monospace' }} placeholder="opsional"
                  value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} maxLength={20}
                />
              </FrmRow>
            )}
            <FrmRow label="Waktu bayar">
              <input
                className="input" type="datetime-local"
                value={paidat} onChange={(e) => setPaidat(e.target.value)}
              />
            </FrmRow>
            <FrmRow label="No. referensi">
              <input
                className="input" placeholder="opsional (eksternal)"
                value={extref} onChange={(e) => setExtref(e.target.value)} maxLength={100}
              />
            </FrmRow>
          </FrmSet>
          <p className="loading-hint">Waktu bayar default sekarang bila kosong. Metode menampilkan biaya dan batas di ringkasan.</p>
          {calcErr && <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{calcErr}</span></div>}
        </>
      )}
      {step === 4 && calc && (
        <>
          <FrmSet legend="Ringkasan (tidak bisa diedit)" icon="form" columns={2}>
            <FrmRow label="Subtotal"><span>{formatPayRp(calc.subtotal)}</span></FrmRow>
            <FrmRow label="Diskon"><span>{formatPayRp(calc.discount)}{calc.promocode ? ` (${calc.promocode})` : ''}</span></FrmRow>
            <FrmRow label="Biaya layanan"><span>{formatPayRp(calc.service)}</span></FrmRow>
            {reftype === 'MERCH' && (
              <FrmRow label="Ongkir"><span>{formatPayRp(calc.shipping)}</span></FrmRow>
            )}
            <FrmRow label="Total dibayar"><span><b>{formatPayRp(calc.total)}</b></span></FrmRow>
            <FrmRow label="Metode"><span>{calc.methodname || '-'} ({formatPayRp(calc.methodfee)})</span></FrmRow>
            <FrmRow label="Biaya platform"><span>{formatPayRp(calc.platform)}</span></FrmRow>
            <FrmRow label="Bagian pemilik"><span>{formatPayRp(calc.owner)}</span></FrmRow>
          </FrmSet>
          <p className="loading-hint">Biaya metode ditanggung platform (info saja). Simpan untuk mencatat + terbitkan invoice.</p>
        </>
      )}
    </Window>
  );
}
