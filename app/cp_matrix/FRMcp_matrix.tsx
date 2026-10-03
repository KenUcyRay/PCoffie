// Padanan FRM module: ubah nama + urutan + ikon (kode read-only).
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_update } from './api';

export type ModuleForm = {
  DEFID?: number;
  DEFCODE: string;
  DEFNAME: string;
  DEFSHORT: string;
  DEFIMAGE: string;
};

type FieldErrors = { DEFNAME?: string; DEFSHORT?: string; DEFIMAGE?: string };

export default function FRMcp_matrix({
  initial,
  onSaved,
}: {
  initial?: ModuleForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<ModuleForm>(
    initial || { DEFCODE: '', DEFNAME: '', DEFSHORT: '0', DEFIMAGE: '' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof ModuleForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.DEFNAME.trim()) e.DEFNAME = 'Nama wajib diisi.';
    else if (form.DEFNAME.trim().length > 200) e.DEFNAME = 'Nama maksimal 200 karakter.';
    if (form.DEFSHORT.trim() === '') e.DEFSHORT = 'Urutan wajib diisi.';
    else if (!/^-?\d+$/.test(form.DEFSHORT.trim()) || Number(form.DEFSHORT) < 0) e.DEFSHORT = 'Urutan harus angka bulat tidak negatif.';
    if (form.DEFIMAGE.trim().length > 100) e.DEFIMAGE = 'Nama ikon maksimal 100 karakter.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan Module?' })) return;
    setBusy(true);
    try {
      const res: any = await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Module tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan module.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Ubah Module"
      icon="edit"
      width="44%"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Module" icon="grid" columns={2}>
        <FrmRow label="Kode">
          <input className="input" value={form.DEFCODE} readOnly />
        </FrmRow>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.DEFNAME} onChange={(e) => set('DEFNAME', e.target.value)} />
            {errs.DEFNAME && <span className="field-err">{errs.DEFNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Urutan">
          <div>
            <input className="input" type="number" min={0} value={form.DEFSHORT} onChange={(e) => set('DEFSHORT', e.target.value)} />
            {errs.DEFSHORT && <span className="field-err">{errs.DEFSHORT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Ikon">
          <div>
            <input className="input" value={form.DEFIMAGE} onChange={(e) => set('DEFIMAGE', e.target.value)} />
            {errs.DEFIMAGE && <span className="field-err">{errs.DEFIMAGE}</span>}
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
