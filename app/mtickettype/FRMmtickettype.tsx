// Padanan FRM tipe tiket: nama + benefit + harga + kuota + batas + periode + urutan + status.
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

export type TicketForm = {
  TICKETTYPEID?: number;
  EVENTID?: number;
  NAME: string;
  DESCR: string;
  PRICE: string;
  QUOTA: string;
  MAXPERSON: string;
  SALESTART: string;
  SALEEND: string;
  SORTORDER: string;
  ISACTIVE: string;
};

type FieldErrors = Partial<Record<keyof TicketForm, string>>;

const toBackend = (v: string): string => (v ? v.replace('T', ' ') + ':00' : '');

export default function FRMmtickettype({
  isNew,
  initial,
  eventId,
  onSaved,
}: {
  isNew: boolean;
  initial?: TicketForm;
  eventId: number;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<TicketForm>(
    initial || {
      EVENTID: eventId, NAME: '', DESCR: '', PRICE: '', QUOTA: '',
      MAXPERSON: '1', SALESTART: '', SALEEND: '', SORTORDER: '0', ISACTIVE: 'YES',
    },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof TicketForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.NAME.trim()) e.NAME = 'Nama wajib diisi.';
    else if (form.NAME.trim().length > 100) e.NAME = 'Nama maksimal 100 karakter.';
    if (form.PRICE.trim() === '' || Number.isNaN(Number(form.PRICE)) || Number(form.PRICE) < 0) {
      e.PRICE = 'Harga wajib diisi dan tidak boleh negatif (0 = gratis).';
    }
    if (!/^\d+$/.test(form.QUOTA.trim()) || Number(form.QUOTA) < 1) e.QUOTA = 'Kuota wajib diisi minimal 1.';
    if (!/^\d+$/.test(form.MAXPERSON.trim()) || Number(form.MAXPERSON) < 1) e.MAXPERSON = 'Batas per orang minimal 1.';
    else if (Number(form.MAXPERSON) > Number(form.QUOTA)) e.MAXPERSON = 'Batas per orang tidak boleh melebihi kuota.';
    if (form.SALESTART && form.SALEEND && form.SALEEND < form.SALESTART) e.SALEEND = 'Akhir jual tidak boleh sebelum mulai jual.';
    if (form.SORTORDER.trim() !== '' && (!/^-?\d+$/.test(form.SORTORDER.trim()) || Number(form.SORTORDER) < 0)) {
      e.SORTORDER = 'Urutan harus angka bulat tidak negatif.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: isNew ? 'Simpan Tipe Tiket?' : 'Simpan perubahan Tipe Tiket?' })) return;
    setBusy(true);
    try {
      const payload = {
        TICKETTYPEID: form.TICKETTYPEID,
        EVENTID: eventId,
        NAME: form.NAME.trim(),
        DESCR: form.DESCR.trim(),
        PRICE: form.PRICE.trim(),
        QUOTA: form.QUOTA.trim(),
        MAXPERSON: form.MAXPERSON.trim(),
        SALESTART: toBackend(form.SALESTART),
        SALEEND: toBackend(form.SALEEND),
        SORTORDER: form.SORTORDER.trim() === '' ? '0' : form.SORTORDER.trim(),
        ISACTIVE: form.ISACTIVE,
      };
      const res: any = isNew ? await process_create(payload) : await process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Tipe tiket tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan tipe tiket.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Tipe Tiket' : 'Ubah Tipe Tiket'}
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
      <FrmSet legend="Tipe Tiket" icon="ticket" columns={2}>
        <FrmRow label="Nama">
          <div>
            <input className="input" placeholder="cth. Regular, VIP" value={form.NAME} onChange={(e) => set('NAME', e.target.value)} maxLength={100} />
            {errs.NAME && <span className="field-err">{errs.NAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Status">
          <select value={form.ISACTIVE} onChange={(e) => set('ISACTIVE', e.target.value)}>
            <option value="YES">Aktif</option>
            <option value="NO">Nonaktif</option>
          </select>
        </FrmRow>
        <FrmRow label="Benefit">
          <div>
            <textarea className="input" rows={2} value={form.DESCR} onChange={(e) => set('DESCR', e.target.value)} maxLength={500} />
          </div>
        </FrmRow>
        <FrmRow label="Harga (Rp)">
          <div>
            <input className="input" type="number" min={0} placeholder="0 = gratis" value={form.PRICE} onChange={(e) => set('PRICE', e.target.value)} />
            {errs.PRICE && <span className="field-err">{errs.PRICE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kuota">
          <div>
            <input className="input" type="number" min={1} value={form.QUOTA} onChange={(e) => set('QUOTA', e.target.value)} />
            {errs.QUOTA && <span className="field-err">{errs.QUOTA}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Batas/orang">
          <div>
            <input className="input" type="number" min={1} value={form.MAXPERSON} onChange={(e) => set('MAXPERSON', e.target.value)} />
            {errs.MAXPERSON && <span className="field-err">{errs.MAXPERSON}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Mulai jual">
          <input className="input" type="datetime-local" value={form.SALESTART} onChange={(e) => set('SALESTART', e.target.value)} />
        </FrmRow>
        <FrmRow label="Akhir jual">
          <div>
            <input className="input" type="datetime-local" value={form.SALEEND} onChange={(e) => set('SALEEND', e.target.value)} />
            {errs.SALEEND && <span className="field-err">{errs.SALEEND}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Urutan">
          <div>
            <input className="input" type="number" min={0} value={form.SORTORDER} onChange={(e) => set('SORTORDER', e.target.value)} />
            {errs.SORTORDER && <span className="field-err">{errs.SORTORDER}</span>}
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
