// Padanan FRM penjual: toko + pemilik + kontak.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_seller_create, process_seller_update } from './api';

export type SellerForm = {
  SELLERID?: number;
  SHOPNAME: string;
  OWNERNAME: string;
  PHONE: string;
  EMAIL: string;
  ADDRESS: string;
};

type FieldErrors = Partial<Record<keyof SellerForm, string>>;

export default function FRMmseller({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: SellerForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<SellerForm>(
    initial || { SHOPNAME: '', OWNERNAME: '', PHONE: '', EMAIL: '', ADDRESS: '' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof SellerForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.SHOPNAME.trim()) e.SHOPNAME = 'Nama toko wajib diisi.';
    else if (form.SHOPNAME.trim().length > 100) e.SHOPNAME = 'Nama toko maksimal 100 karakter.';
    if (!form.OWNERNAME.trim()) e.OWNERNAME = 'Nama pemilik wajib diisi.';
    else if (form.OWNERNAME.trim().length > 100) e.OWNERNAME = 'Nama pemilik maksimal 100 karakter.';
    if (form.PHONE.trim() && !/^[0-9+\-\s]+$/.test(form.PHONE.trim())) e.PHONE = 'Telepon hanya boleh angka, plus, spasi, dan strip.';
    if (form.EMAIL.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.EMAIL.trim())) e.EMAIL = 'Format email tidak valid.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: isNew ? 'Simpan Penjual?' : 'Simpan perubahan Penjual?' })) return;
    setBusy(true);
    try {
      const payload = {
        SELLERID: form.SELLERID,
        SHOPNAME: form.SHOPNAME.trim(),
        OWNERNAME: form.OWNERNAME.trim(),
        PHONE: form.PHONE.trim(),
        EMAIL: form.EMAIL.trim(),
        ADDRESS: form.ADDRESS.trim(),
      };
      const res: any = isNew ? await process_seller_create(payload) : await process_seller_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Penjual tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan penjual.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Penjual' : 'Ubah Penjual'}
      icon={isNew ? 'add' : 'edit'}
      width="44%"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Penjual" icon="dept" columns={2}>
        <FrmRow label="Nama toko">
          <div>
            <input className="input" value={form.SHOPNAME} onChange={(e) => set('SHOPNAME', e.target.value)} maxLength={100} />
            {errs.SHOPNAME && <span className="field-err">{errs.SHOPNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Pemilik">
          <div>
            <input className="input" value={form.OWNERNAME} onChange={(e) => set('OWNERNAME', e.target.value)} maxLength={100} />
            {errs.OWNERNAME && <span className="field-err">{errs.OWNERNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Telepon">
          <div>
            <input className="input" value={form.PHONE} onChange={(e) => set('PHONE', e.target.value)} maxLength={30} />
            {errs.PHONE && <span className="field-err">{errs.PHONE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Email">
          <div>
            <input className="input" value={form.EMAIL} onChange={(e) => set('EMAIL', e.target.value)} maxLength={100} />
            {errs.EMAIL && <span className="field-err">{errs.EMAIL}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Alamat">
          <div>
            <textarea className="input" rows={2} value={form.ADDRESS} onChange={(e) => set('ADDRESS', e.target.value)} maxLength={500} />
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
