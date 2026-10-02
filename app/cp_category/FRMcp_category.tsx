// Padanan FRM kategori: Kode + Nama + Urutan + Status + Save.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update } from './api';

export type CategoryForm = {
  CATID?: number;
  CATCODE: string;
  CATNAME: string;
  CATSORT: string;
  CATACTIVE: string;
};

type FieldErrors = { CATCODE?: string; CATNAME?: string; CATSORT?: string };

export default function FRMcp_category({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: CategoryForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<CategoryForm>(
    initial || { CATCODE: '', CATNAME: '', CATSORT: '0', CATACTIVE: 'YES' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof CategoryForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.CATCODE.trim()) e.CATCODE = 'Kode wajib diisi.';
    else if (form.CATCODE.trim().length > 20) e.CATCODE = 'Kode maksimal 20 karakter.';
    if (!form.CATNAME.trim()) e.CATNAME = 'Nama wajib diisi.';
    else if (form.CATNAME.trim().length > 100) e.CATNAME = 'Nama maksimal 100 karakter.';
    const s = form.CATSORT.trim();
    if (s !== '' && (!/^-?\d+$/.test(s) || Number(s) < 0)) e.CATSORT = 'Urutan harus angka bulat tidak negatif.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan Category?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form) : await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Kategori tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan kategori.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Category' : 'Ubah Category'}
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
      <FrmSet legend="Category" icon="grid" columns={2}>
        <FrmRow label="Kode">
          <div>
            <input className="input" value={form.CATCODE} readOnly={!isNew} onChange={(e) => set('CATCODE', e.target.value)} />
            {errs.CATCODE && <span className="field-err">{errs.CATCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.CATNAME} onChange={(e) => set('CATNAME', e.target.value)} />
            {errs.CATNAME && <span className="field-err">{errs.CATNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Urutan">
          <div>
            <input className="input" type="number" min={0} value={form.CATSORT} onChange={(e) => set('CATSORT', e.target.value)} />
            {errs.CATSORT && <span className="field-err">{errs.CATSORT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Status">
          <select value={form.CATACTIVE} onChange={(e) => set('CATACTIVE', e.target.value)}>
            <option value="YES">Aktif</option>
            <option value="NO">Nonaktif</option>
          </select>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
