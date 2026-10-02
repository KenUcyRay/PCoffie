// Padanan FRM metode bayar: Kode + Nama + Tipe + Bank + Biaya + Logo + Save.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useEffect, useRef, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, read_bank_combo, upload_logo, logoUrl } from './api';
import { formatIDR } from './Ccp_paymentmethod';

export type PayForm = {
  PAYID?: number;
  PAYCODE: string;
  PAYNAME: string;
  PAYTYPE: string;
  BANKCODE: string;
  PCTCOST: string;
  FIXCOST: string;
  MINAMT: string;
  MAXAMT: string;
  LOGO: string;
  PAYSORT: string;
  PAYACTIVE: string;
};

type FieldErrors = {
  PAYCODE?: string; PAYNAME?: string; PAYTYPE?: string; BANKCODE?: string;
  PCTCOST?: string; FIXCOST?: string; MINAMT?: string; MAXAMT?: string; PAYSORT?: string; LOGO?: string;
};

type Bank = { BANKCODE: string; BANKNAME?: string };

const TYPES = ['QRIS', 'VA', 'EWALLET', 'CARD'] as const;

export default function FRMcp_paymentmethod({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: PayForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<PayForm>(
    initial || {
      PAYCODE: '', PAYNAME: '', PAYTYPE: 'QRIS', BANKCODE: '',
      PCTCOST: '0', FIXCOST: '0', MINAMT: '', MAXAMT: '', LOGO: '',
      PAYSORT: '0', PAYACTIVE: 'YES',
    },
  );
  const [banks, setBanks] = useState<Bank[]>([]);
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res: any = await read_bank_combo();
      if (parseBoolean(res?.success)) setBanks(res.Rows || []);
    })();
  }, []);

  const set = (k: keyof PayForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.PAYCODE.trim()) e.PAYCODE = 'Kode wajib diisi.';
    else if (form.PAYCODE.trim().length > 20) e.PAYCODE = 'Kode maksimal 20 karakter.';
    if (!form.PAYNAME.trim()) e.PAYNAME = 'Nama wajib diisi.';
    else if (form.PAYNAME.trim().length > 100) e.PAYNAME = 'Nama maksimal 100 karakter.';
    if (!(TYPES as readonly string[]).includes(form.PAYTYPE)) e.PAYTYPE = 'Tipe tidak valid.';
    if (form.PAYTYPE === 'VA' && !form.BANKCODE) e.BANKCODE = 'Tipe VA wajib memilih bank.';
    if (!/^\d+(\.\d+)?$/.test(form.PCTCOST.trim()) || Number(form.PCTCOST) < 0 || Number(form.PCTCOST) > 100) {
      e.PCTCOST = 'Biaya persen antara 0 sampai 100.';
    }
    if (form.FIXCOST.trim() !== '' && (!/^\d+(\.\d+)?$/.test(form.FIXCOST.trim()) || Number(form.FIXCOST) < 0)) {
      e.FIXCOST = 'Biaya tetap tidak negatif.';
    }
    if (form.MINAMT.trim() !== '' && (!/^\d+(\.\d+)?$/.test(form.MINAMT.trim()) || Number(form.MINAMT) < 0)) {
      e.MINAMT = 'Minimum tidak negatif.';
    }
    if (form.MAXAMT.trim() !== '' && (!/^\d+(\.\d+)?$/.test(form.MAXAMT.trim()) || Number(form.MAXAMT) < 0)) {
      e.MAXAMT = 'Maksimum tidak negatif.';
    }
    if (form.MINAMT.trim() !== '' && form.MAXAMT.trim() !== '' && Number(form.MAXAMT) <= Number(form.MINAMT)) {
      e.MAXAMT = 'Maksimum harus lebih besar dari minimum.';
    }
    if (form.PAYSORT.trim() !== '' && (!/^-?\d+$/.test(form.PAYSORT.trim()) || Number(form.PAYSORT) < 0)) {
      e.PAYSORT = 'Urutan harus angka bulat tidak negatif.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrs((e) => ({ ...e, LOGO: 'Logo hanya boleh JPG, PNG, atau WebP.' })); return; }
    if (f.size > 2 * 1024 * 1024) { setErrs((e) => ({ ...e, LOGO: 'Ukuran logo maksimal 2MB.' })); return; }
    setUploading(true);
    try {
      const res: any = await upload_logo(f);
      if (parseBoolean(res?.success) && res.path) {
        setForm((prev) => ({ ...prev, LOGO: String(res.path) }));
        setErrs((e) => ({ ...e, LOGO: undefined }));
      } else {
        setErrs((e) => ({ ...e, LOGO: res?.message || 'Upload logo gagal.' }));
      }
    } catch (e: any) {
      setErrs((e2) => ({ ...e2, LOGO: e.message || 'Upload logo gagal.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan Payment?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form) : await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Metode tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan metode.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const logoSrc = form.LOGO ? logoUrl(form.LOGO) : '';

  return (
    <Window
      title={isNew ? 'Tambah Payment' : 'Ubah Payment'}
      icon={isNew ? 'add' : 'edit'}
      width="520px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy || uploading} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Metode" icon="cash" columns={2}>
        <FrmRow label="Kode">
          <div>
            <input className="input" value={form.PAYCODE} readOnly={!isNew} onChange={(e) => set('PAYCODE', e.target.value)} />
            {errs.PAYCODE && <span className="field-err">{errs.PAYCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.PAYNAME} onChange={(e) => set('PAYNAME', e.target.value)} />
            {errs.PAYNAME && <span className="field-err">{errs.PAYNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Tipe">
          <div>
            <select value={form.PAYTYPE} onChange={(e) => set('PAYTYPE', e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errs.PAYTYPE && <span className="field-err">{errs.PAYTYPE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Bank">
          <div>
            <select value={form.BANKCODE} onChange={(e) => set('BANKCODE', e.target.value)} disabled={form.PAYTYPE !== 'VA'}>
              <option value="">— {form.PAYTYPE === 'VA' ? 'Pilih bank' : 'Tidak dipakai'} —</option>
              {banks.map((b) => <option key={b.BANKCODE} value={b.BANKCODE}>{b.BANKCODE} — {b.BANKNAME || b.BANKCODE}</option>)}
            </select>
            {errs.BANKCODE && <span className="field-err">{errs.BANKCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Urutan">
          <div>
            <input className="input" type="number" min={0} value={form.PAYSORT} onChange={(e) => set('PAYSORT', e.target.value)} />
            {errs.PAYSORT && <span className="field-err">{errs.PAYSORT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Status">
          <select value={form.PAYACTIVE} onChange={(e) => set('PAYACTIVE', e.target.value)}>
            <option value="YES">Aktif</option>
            <option value="NO">Nonaktif</option>
          </select>
        </FrmRow>
      </FrmSet>

      <FrmSet legend="Biaya" icon="cash" columns={2}>
        <FrmRow label="Persen">
          <div>
            <input className="input" inputMode="decimal" value={form.PCTCOST} onChange={(e) => set('PCTCOST', e.target.value)} />
            {errs.PCTCOST && <span className="field-err">{errs.PCTCOST}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Tetap">
          <div>
            <input className="input" inputMode="decimal" value={form.FIXCOST} onChange={(e) => set('FIXCOST', e.target.value)} />
            <span className="loading-hint">{formatIDR(form.FIXCOST || '0')}</span>
            {errs.FIXCOST && <span className="field-err">{errs.FIXCOST}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Minimum">
          <div>
            <input className="input" inputMode="decimal" value={form.MINAMT} onChange={(e) => set('MINAMT', e.target.value)} />
            <span className="loading-hint">{form.MINAMT.trim() ? formatIDR(form.MINAMT) : 'Tanpa minimum'}</span>
            {errs.MINAMT && <span className="field-err">{errs.MINAMT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Maksimum">
          <div>
            <input className="input" inputMode="decimal" value={form.MAXAMT} onChange={(e) => set('MAXAMT', e.target.value)} />
            <span className="loading-hint">{form.MAXAMT.trim() ? formatIDR(form.MAXAMT) : 'Tanpa batas'}</span>
            {errs.MAXAMT && <span className="field-err">{errs.MAXAMT}</span>}
          </div>
        </FrmRow>
      </FrmSet>

      <FrmSet legend="Logo" icon="upload" columns={1}>
        <FrmRow label="File">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {logoSrc && <img src={logoSrc} alt="Logo" width={48} height={48} style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => pickLogo(e.target.files?.[0])}
              />
            </div>
            {uploading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Mengupload…</span>}
            {errs.LOGO && <span className="field-err">{errs.LOGO}</span>}
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
