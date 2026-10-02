// Form versi pengaturan baru (selalu create, tidak ada ubah).
// Dibuka lewat Modal (useModal), padanan window ExtJS. Prefill dari versi
// saat ini; tanggal mulai selalu default hari ini (tidak ikut prefill).
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create } from './api';
import { formatIDR, formatPct, formatTanggal, todayStr } from './Ccp_fee';

export type FeeForm = {
  EFFECTIVEFROM: string;
  PLATFORMPCT: string;
  PLATFORMFIX: string;
  SERVICEPERTICKET: string;
  WITHDRAWFEE: string;
  MINWITHDRAW: string;
  PAYOUTWAITDAYS: string;
  PAYTIMEOUTMIN: string;
  FEENOTE: string;
};

type FieldErrors = Partial<Record<keyof FeeForm, string>>;

const BLANK: FeeForm = {
  EFFECTIVEFROM: '', PLATFORMPCT: '', PLATFORMFIX: '', SERVICEPERTICKET: '',
  WITHDRAWFEE: '', MINWITHDRAW: '', PAYOUTWAITDAYS: '', PAYTIMEOUTMIN: '', FEENOTE: '',
};

const LABELS: Record<keyof FeeForm, string> = {
  EFFECTIVEFROM: 'Berlaku',
  PLATFORMPCT: 'Platform %',
  PLATFORMFIX: 'Platform tetap',
  SERVICEPERTICKET: 'Layanan/tiket',
  WITHDRAWFEE: 'Biaya penarikan',
  MINWITHDRAW: 'Min. penarikan',
  PAYOUTWAITDAYS: 'Tunggu payout',
  PAYTIMEOUTMIN: 'Batas bayar',
  FEENOTE: 'Catatan',
};

function fmtVal(k: keyof FeeForm, v: string): string {
  if (k === 'EFFECTIVEFROM') return formatTanggal(v);
  if (k === 'PLATFORMPCT') return formatPct(v);
  if (k === 'PAYOUTWAITDAYS') return v ? `${v} hari` : '-';
  if (k === 'PAYTIMEOUTMIN') return v ? `${v} menit` : '-';
  if (k === 'FEENOTE') return v || '-';
  return formatIDR(v);
}

export default function FRMcp_fee({
  base,
  initial,
  onSaved,
}: {
  /** Nilai saat ini, untuk ringkasan perubahan. */
  base?: FeeForm;
  /** Prefill form (tanggal selalu diganti hari ini). */
  initial?: FeeForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<FeeForm>(() => ({
    ...BLANK, ...initial, EFFECTIVEFROM: todayStr(),
  }));
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof FeeForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.EFFECTIVEFROM)) e.EFFECTIVEFROM = 'Tanggal tidak valid.';
    if (!/^\d+(\.\d+)?$/.test(form.PLATFORMPCT.trim()) || Number(form.PLATFORMPCT) < 0 || Number(form.PLATFORMPCT) > 100) {
      e.PLATFORMPCT = 'Persen antara 0 sampai 100.';
    }
    const money = (v: string) => v.trim() === '' || !/^\d+(\.\d+)?$/.test(v.trim());
    if (form.PLATFORMFIX.trim() === '' || money(form.PLATFORMFIX)) e.PLATFORMFIX = form.PLATFORMFIX.trim() === '' ? 'Wajib diisi.' : 'Tidak negatif.';
    if (form.SERVICEPERTICKET.trim() === '' || money(form.SERVICEPERTICKET)) e.SERVICEPERTICKET = form.SERVICEPERTICKET.trim() === '' ? 'Wajib diisi.' : 'Tidak negatif.';
    if (form.WITHDRAWFEE.trim() === '' || money(form.WITHDRAWFEE)) e.WITHDRAWFEE = form.WITHDRAWFEE.trim() === '' ? 'Wajib diisi.' : 'Tidak negatif.';
    if (form.MINWITHDRAW.trim() === '' || money(form.MINWITHDRAW)) e.MINWITHDRAW = form.MINWITHDRAW.trim() === '' ? 'Wajib diisi.' : 'Tidak negatif.';
    if (!/^-?\d+$/.test(form.PAYOUTWAITDAYS.trim()) || Number(form.PAYOUTWAITDAYS) < 0 || Number(form.PAYOUTWAITDAYS) > 30) {
      e.PAYOUTWAITDAYS = '0 sampai 30 hari.';
    }
    if (!/^-?\d+$/.test(form.PAYTIMEOUTMIN.trim()) || Number(form.PAYTIMEOUTMIN) < 5 || Number(form.PAYTIMEOUTMIN) > 1440) {
      e.PAYTIMEOUTMIN = '5 sampai 1440 menit.';
    }
    if (!form.FEENOTE.trim()) e.FEENOTE = 'Catatan wajib diisi.';
    else if (form.FEENOTE.trim().length > 200) e.FEENOTE = 'Maksimal 200 karakter.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: `Buat versi berlaku ${formatTanggal(form.EFFECTIVEFROM)}?` })) return;
    setBusy(true);
    try {
      const res: any = await process_create(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Versi tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan versi.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const diffs = (Object.keys(LABELS) as (keyof FeeForm)[]).filter((k) => {
    if (!base) return true;
    return String(base[k] ?? '') !== String(form[k] ?? '');
  });

  return (
    <Window
      title="Buat Versi Pengaturan"
      icon="add"
      width="560px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan Versi</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Berlaku & Catatan" icon="calendar" columns={2}>
        <FrmRow label="Mulai berlaku">
          <div>
            <input className="input" type="date" value={form.EFFECTIVEFROM} onChange={(e) => set('EFFECTIVEFROM', e.target.value)} />
            {errs.EFFECTIVEFROM && <span className="field-err">{errs.EFFECTIVEFROM}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Catatan">
          <div>
            <input className="input" value={form.FEENOTE} onChange={(e) => set('FEENOTE', e.target.value)} />
            {errs.FEENOTE && <span className="field-err">{errs.FEENOTE}</span>}
          </div>
        </FrmRow>
      </FrmSet>

      <FrmSet legend="Nilai" icon="cash" columns={2}>
        <FrmRow label="Platform %">
          <div>
            <input className="input" inputMode="decimal" value={form.PLATFORMPCT} onChange={(e) => set('PLATFORMPCT', e.target.value)} />
            {errs.PLATFORMPCT && <span className="field-err">{errs.PLATFORMPCT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Platform tetap">
          <div>
            <input className="input" inputMode="decimal" value={form.PLATFORMFIX} onChange={(e) => set('PLATFORMFIX', e.target.value)} />
            <span className="loading-hint">{formatIDR(form.PLATFORMFIX || '0')}</span>
            {errs.PLATFORMFIX && <span className="field-err">{errs.PLATFORMFIX}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Layanan/tiket">
          <div>
            <input className="input" inputMode="decimal" value={form.SERVICEPERTICKET} onChange={(e) => set('SERVICEPERTICKET', e.target.value)} />
            <span className="loading-hint">{formatIDR(form.SERVICEPERTICKET || '0')}</span>
            {errs.SERVICEPERTICKET && <span className="field-err">{errs.SERVICEPERTICKET}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Biaya penarikan">
          <div>
            <input className="input" inputMode="decimal" value={form.WITHDRAWFEE} onChange={(e) => set('WITHDRAWFEE', e.target.value)} />
            <span className="loading-hint">{formatIDR(form.WITHDRAWFEE || '0')}</span>
            {errs.WITHDRAWFEE && <span className="field-err">{errs.WITHDRAWFEE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Min. penarikan">
          <div>
            <input className="input" inputMode="decimal" value={form.MINWITHDRAW} onChange={(e) => set('MINWITHDRAW', e.target.value)} />
            <span className="loading-hint">{form.MINWITHDRAW.trim() ? formatIDR(form.MINWITHDRAW) : '-'}</span>
            {errs.MINWITHDRAW && <span className="field-err">{errs.MINWITHDRAW}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Tunggu payout">
          <div>
            <input className="input" type="number" min={0} max={30} value={form.PAYOUTWAITDAYS} onChange={(e) => set('PAYOUTWAITDAYS', e.target.value)} />
            {errs.PAYOUTWAITDAYS && <span className="field-err">{errs.PAYOUTWAITDAYS}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Batas bayar">
          <div>
            <input className="input" type="number" min={5} max={1440} value={form.PAYTIMEOUTMIN} onChange={(e) => set('PAYTIMEOUTMIN', e.target.value)} />
            {errs.PAYTIMEOUTMIN && <span className="field-err">{errs.PAYTIMEOUTMIN}</span>}
          </div>
        </FrmRow>
      </FrmSet>

      {base && (
        <FrmSet legend="Ringkasan perubahan" icon="history" columns={1}>
          {diffs.length === 0 && <p className="empty-hint">Tidak ada perubahan dari versi saat ini.</p>}
          {diffs.map((k) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
              <b style={{ width: 130, flex: 'none' }}>{LABELS[k]}</b>
              <span className="loading-hint">{fmtVal(k, String(base[k] ?? ''))}</span>
              <span>→</span>
              <b>{fmtVal(k, form[k])}</b>
            </div>
          ))}
        </FrmSet>
      )}
    </Window>
  );
}
