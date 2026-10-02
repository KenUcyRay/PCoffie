// Padanan FRM bank: Kode + Nama + Singkat + Status + Save.
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

export type BankForm = {
  BANKID?: number;
  BANKCODE: string;
  BANKNAME: string;
  BANKSHORT: string;
  BANKACTIVE: string;
};

type FieldErrors = { BANKCODE?: string; BANKNAME?: string; BANKSHORT?: string };

export default function FRMcp_bank({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: BankForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<BankForm>(
    initial || { BANKCODE: '', BANKNAME: '', BANKSHORT: '', BANKACTIVE: 'YES' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof BankForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.BANKCODE.trim()) e.BANKCODE = 'Kode wajib diisi.';
    else if (!/^[0-9]{3,5}$/.test(form.BANKCODE.trim())) e.BANKCODE = 'Kode hanya angka 3 sampai 5 digit.';
    if (!form.BANKNAME.trim()) e.BANKNAME = 'Nama wajib diisi.';
    else if (form.BANKNAME.trim().length > 100) e.BANKNAME = 'Nama maksimal 100 karakter.';
    if (!form.BANKSHORT.trim()) e.BANKSHORT = 'Nama singkat wajib diisi.';
    else if (form.BANKSHORT.trim().length > 20) e.BANKSHORT = 'Nama singkat maksimal 20 karakter.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan Bank?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form) : await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Bank tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan bank.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Bank' : 'Ubah Bank'}
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
      <FrmSet legend="Bank" icon="dept" columns={2}>
        <FrmRow label="Kode">
          <div>
            <input className="input" value={form.BANKCODE} readOnly={!isNew} onChange={(e) => set('BANKCODE', e.target.value)} />
            {errs.BANKCODE && <span className="field-err">{errs.BANKCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.BANKNAME} onChange={(e) => set('BANKNAME', e.target.value)} />
            {errs.BANKNAME && <span className="field-err">{errs.BANKNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Singkat">
          <div>
            <input className="input" value={form.BANKSHORT} onChange={(e) => set('BANKSHORT', e.target.value)} />
            {errs.BANKSHORT && <span className="field-err">{errs.BANKSHORT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Status">
          <select value={form.BANKACTIVE} onChange={(e) => set('BANKACTIVE', e.target.value)}>
            <option value="YES">Aktif</option>
            <option value="NO">Nonaktif</option>
          </select>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
