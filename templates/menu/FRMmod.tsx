// TEMPLATE FRM — padanan FRM<mod>.js langit_v2 (Ext.window.Window).
//
// Cara pakai: rename FRMmod.tsx -> FRM<mcontrol>.tsx, sesuaikan type Form dengan
// field tabel, lalu panggil process_create/process_update dari ./api.
//
// BUKTIKAN window ini padanan-langit_v2:
//   - <Window width height>  <=> width/height di dalam Ext.define FRM<mod>.js
//   - <FrmRow>               <=> fieldDefaults { labelAlign: left, labelWidth }
//   - <FrmSet legend>         <=> xtype: "fieldset"
//   - footer + pid            <=> tbar dengan pid btsave / btdelete
//
// Ukuran ditulis DI FILE INI (bukan di grid), persis seperti langit_v2.
// Set lebarnya kecil (mis. '46%') supaya form tidak memanjang ke bawah.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, process_delete } from './api';

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

  // validasi (padanan handler_validasi_input di langit_v2)
  const validate = (): boolean => {
    if (!String(form.KODE || '').trim()) { toast('Error', 'KODE wajib diisi.', 'err'); return false; }
    if (!String(form.NAMA || '').trim()) { toast('Error', 'NAMA wajib diisi.', 'err'); return false; }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
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

  const del = async () => {
    if (!window.confirm('Hapus data?')) return;
    const res: any = await process_delete(form);
    if (parseBoolean(res?.success)) { toast('Success', res.message || 'Data dihapus.', 'ok'); onSaved(); close(); }
    else toast('Error', res?.message, 'err');
  };

  return (
    <Window
      title={isNew ? 'Create' : 'Edit'}
      icon={isNew ? 'add' : 'edit'}
      width="46%"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Save</Btn>
          {!isNew && <Btn pid="btdelete" className="danger" icon="del" onClick={del}>Delete</Btn>}
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Data" icon="form" columns={2}>
        <FrmRow label="Kode">
          <input className="input" value={form.KODE} readOnly={!isNew} onChange={(e) => setForm({ ...form, KODE: e.target.value })} />
        </FrmRow>
        <FrmRow label="Nama">
          <input className="input" value={form.NAMA} onChange={(e) => setForm({ ...form, NAMA: e.target.value })} />
        </FrmRow>
      </FrmSet>
    </Window>
  );
}