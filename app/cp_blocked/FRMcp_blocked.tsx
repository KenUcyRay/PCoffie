// Padanan FRM blokir: tambah blokir manual (jenis + nilai + alasan + durasi).
// Durasi: 1 jam, 24 jam, 7 hari, permanen, atau tanggal tertentu.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create } from './api';

export type BlockForm = {
  BLOCKTYPE: string;
  BLOCKVALUE: string;
  REASON: string;
  DURATION: string;
  ENDAT: string;
};

type FieldErrors = { BLOCKVALUE?: string; REASON?: string; ENDAT?: string };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 'Y-m-d H:i:s' untuk ENDTIME backend (waktu lokal browser).
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function endtimeOf(f: BlockForm): string {
  const now = new Date();
  if (f.DURATION === '1H') return fmtLocal(new Date(now.getTime() + 3600 * 1000));
  if (f.DURATION === '24H') return fmtLocal(new Date(now.getTime() + 24 * 3600 * 1000));
  if (f.DURATION === '7D') return fmtLocal(new Date(now.getTime() + 7 * 24 * 3600 * 1000));
  if (f.DURATION === 'DATE' && f.ENDAT) {
    const d = new Date(f.ENDAT.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return fmtLocal(d);
  }
  return '';
}

function looksLikeIP(v: string): boolean {
  const s = v.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    return s.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255);
  }
  return s.includes(':');
}

export default function FRMcp_blocked({
  onSaved,
}: {
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<BlockForm>(
    { BLOCKTYPE: 'USERNAME', BLOCKVALUE: '', REASON: '', DURATION: '24H', ENDAT: '' },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof BlockForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (form.BLOCKTYPE !== 'USERNAME' && form.BLOCKTYPE !== 'IP') {
      toast('Error', 'Jenis blokir harus USERNAME atau IP.', 'err');
      return false;
    }
    if (!form.BLOCKVALUE.trim()) e.BLOCKVALUE = 'Nilai wajib diisi.';
    else if (form.BLOCKVALUE.trim().length > 45) e.BLOCKVALUE = 'Nilai maksimal 45 karakter.';
    else if (form.BLOCKTYPE === 'IP' && !looksLikeIP(form.BLOCKVALUE)) e.BLOCKVALUE = 'Nilai IP tidak valid (IPv4/IPv6).';
    if (!form.REASON.trim()) e.REASON = 'Alasan wajib diisi.';
    else if (form.REASON.trim().length > 200) e.REASON = 'Alasan maksimal 200 karakter.';
    if (form.DURATION === 'DATE') {
      if (!form.ENDAT) e.ENDAT = 'Tanggal berakhir wajib diisi.';
      else {
        const d = new Date(form.ENDAT.replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) e.ENDAT = 'Tanggal tidak valid.';
        else if (d.getTime() <= Date.now()) e.ENDAT = 'Waktu berakhir harus di masa depan.';
      }
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: `Blokir ${form.BLOCKTYPE} ${form.BLOCKVALUE.trim()}?` })) return;
    setBusy(true);
    try {
      const res: any = await process_create({
        BLOCKTYPE: form.BLOCKTYPE,
        BLOCKVALUE: form.BLOCKVALUE.trim(),
        REASON: form.REASON.trim(),
        ENDTIME: endtimeOf(form),
      });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Blokir tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan blokir.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="Tambah Blokir"
      icon="add"
      width="44%"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Blokir" icon="alertCircle" columns={2}>
        <FrmRow label="Jenis">
          <select value={form.BLOCKTYPE} onChange={(e) => set('BLOCKTYPE', e.target.value)}>
            <option value="USERNAME">USERNAME</option>
            <option value="IP">IP</option>
          </select>
        </FrmRow>
        <FrmRow label="Nilai">
          <div>
            <input
              className="input"
              placeholder={form.BLOCKTYPE === 'IP' ? 'cth. 192.168.1.10' : 'cth. username'}
              value={form.BLOCKVALUE}
              onChange={(e) => set('BLOCKVALUE', e.target.value)}
            />
            {errs.BLOCKVALUE && <span className="field-err">{errs.BLOCKVALUE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Alasan">
          <div>
            <input
              className="input"
              placeholder="Alasan pemblokiran"
              value={form.REASON}
              onChange={(e) => set('REASON', e.target.value)}
            />
            {errs.REASON && <span className="field-err">{errs.REASON}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Durasi">
          <select value={form.DURATION} onChange={(e) => set('DURATION', e.target.value)}>
            <option value="1H">1 jam</option>
            <option value="24H">24 jam</option>
            <option value="7D">7 hari</option>
            <option value="PERM">Permanen</option>
            <option value="DATE">Tanggal tertentu</option>
          </select>
        </FrmRow>
        {form.DURATION === 'DATE' && (
          <FrmRow label="Berakhir">
            <div>
              <input
                className="input" type="datetime-local"
                value={form.ENDAT}
                onChange={(e) => set('ENDAT', e.target.value)}
              />
              {errs.ENDAT && <span className="field-err">{errs.ENDAT}</span>}
            </div>
          </FrmRow>
        )}
      </FrmSet>
    </Window>
  );
}
