// TEMPLATE FRM — padanan FRM<mod>.js langit_v2.
// Cara pakai: rename FRMmod.tsx -> FRM<mcontrol>.tsx, sesuaikan type Form
// dengan field tabel, lalu panggil process_create/process_update dari ./api.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { process_create, process_update } from './api';
import { Btn, Icon } from '@/components/Icon';

export type Form = {
  KODE: string;
  NAMA: string;
};

export default function FRMmod({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: Form;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<Form>(initial || { KODE: '', NAMA: '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!String(form.KODE || '').trim()) { toast('Error', 'KODE wajib diisi.', 'err'); return; }
    if (!String(form.NAMA || '').trim()) { toast('Error', 'NAMA wajib diisi.', 'err'); return; }
    if (!window.confirm('Simpan data?')) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form, []) : await process_update(form, []);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Data tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan data.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-head">
        <Icon name={isNew ? 'add' : 'edit'} size={17} />
        {isNew ? 'Create' : 'Edit'}
      </div>

      <fieldset className="fset">
        <legend><Icon name="form" size={14} /> Data</legend>
        <div className="fset-grid">
          <label>Kode<input className="input" value={form.KODE} readOnly={!isNew} onChange={(e) => setForm({ ...form, KODE: e.target.value })} /></label>
          <label>Nama<input className="input" value={form.NAMA} onChange={(e) => setForm({ ...form, NAMA: e.target.value })} /></label>
        </div>
      </fieldset>

      <div className="modal-foot">
        <Btn className="primary" icon="save" disabled={busy} onClick={save}>Save</Btn>
        <Btn icon="close" onClick={close}>Batal</Btn>
      </div>
    </>
  );
}
