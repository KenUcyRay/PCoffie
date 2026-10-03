// Padanan FRM menu: ubah nama + urutan + expand awal (struktur read-only).
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

export type MenuForm = {
  MCODE: number | string;
  MNAME: string;
  MSHORT: string;
  MEXPAND: string;
};

type FieldErrors = { MNAME?: string; MSHORT?: string };

export default function FRMcp_menu({
  initial,
  extra,
  onSaved,
}: {
  initial?: MenuForm;
  extra?: { MCONTROL?: string; GROUPCOUNT?: number };
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<MenuForm>(
    initial || { MCODE: '', MNAME: '', MSHORT: '0', MEXPAND: 'FALSE' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof MenuForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.MNAME.trim()) e.MNAME = 'Nama wajib diisi.';
    else if (form.MNAME.trim().length > 40) e.MNAME = 'Nama maksimal 40 karakter.';
    if (form.MSHORT.trim() === '') e.MSHORT = 'Urutan wajib diisi.';
    else if (!/^-?\d+$/.test(form.MSHORT.trim()) || Number(form.MSHORT) < 0) e.MSHORT = 'Urutan harus angka bulat tidak negatif.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan Menu?' })) return;
    setBusy(true);
    try {
      const res: any = await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Menu tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan menu.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Ubah Menu"
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
      <FrmSet legend="Menu" icon="menu" columns={2}>
        <FrmRow label="Kode">
          <input className="input" value={String(form.MCODE ?? '')} readOnly />
        </FrmRow>
        <FrmRow label="Control">
          <input className="input" value={extra?.MCONTROL || ''} readOnly />
        </FrmRow>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.MNAME} onChange={(e) => set('MNAME', e.target.value)} />
            {errs.MNAME && <span className="field-err">{errs.MNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Urutan">
          <div>
            <input className="input" type="number" min={0} value={form.MSHORT} onChange={(e) => set('MSHORT', e.target.value)} />
            {errs.MSHORT && <span className="field-err">{errs.MSHORT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Expand">
          <select value={form.MEXPAND} onChange={(e) => set('MEXPAND', e.target.value)}>
            <option value="TRUE">Terbuka</option>
            <option value="FALSE">Tertutup</option>
          </select>
        </FrmRow>
        <FrmRow label="Akses">
          <input className="input" value={`${extra?.GROUPCOUNT ?? 0} group`} readOnly />
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
