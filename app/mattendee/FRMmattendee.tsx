// Padanan FRM peserta: tambah manual + ubah kontak.
// Status bayar/hadir/batal lewat aksi grid (modal kecil di GRID).
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update_contact } from './api';
import type { TicketOpt } from './GRIDmattendee';

export type AttendeeForm = {
  ATTENDEEID?: number;
  TICKETTYPEID: string;
  NAME: string;
  EMAIL: string;
  PHONE: string;
  PAYSTATUS: string;
};

type FieldErrors = Partial<Record<keyof AttendeeForm, string>>;

export default function FRMmattendee({
  mode,
  eventId,
  types,
  initial,
  onSaved,
}: {
  mode: 'create' | 'contact';
  eventId: number;
  types: TicketOpt[];
  initial?: AttendeeForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<AttendeeForm>(
    initial || {
      TICKETTYPEID: types.length === 1 ? String(types[0].TICKETTYPEID) : '',
      NAME: '', EMAIL: '', PHONE: '', PAYSTATUS: 'BELUM_BAYAR',
    },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof AttendeeForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (mode === 'create' && !form.TICKETTYPEID) e.TICKETTYPEID = 'Tipe tiket wajib dipilih.';
    if (!form.NAME.trim()) e.NAME = 'Nama wajib diisi.';
    else if (form.NAME.trim().length > 100) e.NAME = 'Nama maksimal 100 karakter.';
    if (!form.EMAIL.trim()) e.EMAIL = 'Email wajib diisi.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.EMAIL.trim())) e.EMAIL = 'Format email tidak valid.';
    if (form.PHONE.trim() && !/^[0-9+\-\s]+$/.test(form.PHONE.trim())) {
      e.PHONE = 'Telepon hanya boleh angka, plus, spasi, dan strip.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: mode === 'create' ? 'Tambah Peserta?' : 'Simpan perubahan kontak?' })) return;
    setBusy(true);
    try {
      const res: any = mode === 'create'
        ? await process_create({
          EVENTID: eventId,
          TICKETTYPEID: Number(form.TICKETTYPEID),
          NAME: form.NAME.trim(),
          EMAIL: form.EMAIL.trim(),
          PHONE: form.PHONE.trim(),
          PAYSTATUS: form.PAYSTATUS,
        })
        : await process_update_contact({
          ATTENDEEID: form.ATTENDEEID,
          NAME: form.NAME.trim(),
          EMAIL: form.EMAIL.trim(),
          PHONE: form.PHONE.trim(),
        });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Peserta tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan peserta.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={mode === 'create' ? 'Tambah Peserta' : 'Ubah Kontak'}
      icon={mode === 'create' ? 'add' : 'edit'}
      width="44%"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Peserta" icon="user" columns={2}>
        {mode === 'create' && (
          <FrmRow label="Tipe tiket">
            <div>
              <select value={form.TICKETTYPEID} onChange={(e) => set('TICKETTYPEID', e.target.value)}>
                <option value="">Pilih tipe</option>
                {types.map((t) => (
                  <option key={t.TICKETTYPEID} value={t.TICKETTYPEID}>
                    {t.NAME} ({t.PRICE} • kuota {t.QUOTA})
                  </option>
                ))}
              </select>
              {errs.TICKETTYPEID && <span className="field-err">{errs.TICKETTYPEID}</span>}
            </div>
          </FrmRow>
        )}
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.NAME} onChange={(e) => set('NAME', e.target.value)} maxLength={100} />
            {errs.NAME && <span className="field-err">{errs.NAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Email">
          <div>
            <input className="input" value={form.EMAIL} onChange={(e) => set('EMAIL', e.target.value)} maxLength={100} />
            {errs.EMAIL && <span className="field-err">{errs.EMAIL}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Telepon">
          <div>
            <input className="input" value={form.PHONE} onChange={(e) => set('PHONE', e.target.value)} maxLength={30} />
            {errs.PHONE && <span className="field-err">{errs.PHONE}</span>}
          </div>
        </FrmRow>
        {mode === 'create' && (
          <FrmRow label="Bayar">
            <select value={form.PAYSTATUS} onChange={(e) => set('PAYSTATUS', e.target.value)}>
              <option value="BELUM_BAYAR">BELUM_BAYAR</option>
              <option value="LUNAS">LUNAS</option>
              <option value="REFUND">REFUND</option>
            </select>
          </FrmRow>
        )}
      </FrmSet>
    </Window>
  );
}
