// Padanan FRM kota: Kode + Nama + Provinsi + Zona + Status + Save.
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

export type CityForm = {
  CITYID?: number;
  CITYCODE: string;
  CITYNAME: string;
  CITYPROV: string;
  CITYTZ: string;
  CATACTIVE: string;
};

type FieldErrors = { CITYCODE?: string; CITYNAME?: string; CITYPROV?: string; CITYTZ?: string };

const TIMEZONES = ['WIB', 'WITA', 'WIT'] as const;

export default function FRMcp_city({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: CityForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<CityForm>(
    initial || { CITYCODE: '', CITYNAME: '', CITYPROV: '', CITYTZ: 'WIB', CATACTIVE: 'YES' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof CityForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.CITYCODE.trim()) e.CITYCODE = 'Kode wajib diisi.';
    else if (form.CITYCODE.trim().length > 20) e.CITYCODE = 'Kode maksimal 20 karakter.';
    if (!form.CITYNAME.trim()) e.CITYNAME = 'Nama wajib diisi.';
    else if (form.CITYNAME.trim().length > 100) e.CITYNAME = 'Nama maksimal 100 karakter.';
    if (!form.CITYPROV.trim()) e.CITYPROV = 'Provinsi wajib diisi.';
    else if (form.CITYPROV.trim().length > 100) e.CITYPROV = 'Provinsi maksimal 100 karakter.';
    if (!(TIMEZONES as readonly string[]).includes(form.CITYTZ)) e.CITYTZ = 'Zona waktu hanya boleh WIB, WITA, atau WIT.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan City?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form) : await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Kota tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan kota.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah City' : 'Ubah City'}
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
      <FrmSet legend="City" icon="dept" columns={2}>
        <FrmRow label="Kode">
          <div>
            <input className="input" value={form.CITYCODE} readOnly={!isNew} onChange={(e) => set('CITYCODE', e.target.value)} />
            {errs.CITYCODE && <span className="field-err">{errs.CITYCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kota">
          <div>
            <input className="input" value={form.CITYNAME} onChange={(e) => set('CITYNAME', e.target.value)} />
            {errs.CITYNAME && <span className="field-err">{errs.CITYNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Provinsi">
          <div>
            <input className="input" value={form.CITYPROV} onChange={(e) => set('CITYPROV', e.target.value)} />
            {errs.CITYPROV && <span className="field-err">{errs.CITYPROV}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Zona">
          <div>
            <select value={form.CITYTZ} onChange={(e) => set('CITYTZ', e.target.value)}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errs.CITYTZ && <span className="field-err">{errs.CITYTZ}</span>}
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
