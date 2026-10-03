// GRIDcp_security — form satu halaman pengaturan keamanan (bukan grid).
// Tiga bagian: Kebijakan Password, Proteksi Login, Sesi. Simpan membuka
// window konfirmasi berisi ringkasan nilai lama dibanding nilai baru.
//
// State: form, saved, errs, busy, loading, err, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import * as proxy from './api';
import type { SecurityForm } from './api';

export type GridApi = {
  refresh: () => void;
  save: () => void;
  reset: () => void;
};

type FieldErrors = Partial<Record<keyof SecurityForm, string>>;

type Diff = { key: keyof SecurityForm; label: string; old: string; cur: string };

// Label + satuan tiap kolom (dipakai form, hint, dan ringkasan konfirmasi).
const FIELDS: { key: keyof SecurityForm; label: string; hint: string }[] = [
  { key: 'PWDMINLEN', label: 'Panjang password minimum', hint: 'Karakter. Berlaku untuk user baru dan ganti password.' },
  { key: 'PWDREQUIREUPPER', label: 'Wajib huruf besar', hint: 'Password harus mengandung huruf besar (A-Z).' },
  { key: 'PWDREQUIREDIGIT', label: 'Wajib angka', hint: 'Password harus mengandung angka (0-9).' },
  { key: 'PWDREQUIRESYMBOL', label: 'Wajib simbol', hint: 'Password harus mengandung simbol (mis. !@#).' },
  { key: 'PWDEXPIRYDAYS', label: 'Masa berlaku password', hint: 'Hari. 0 = tidak kedaluwarsa. Disimpan, belum dienforce.' },
  { key: 'MAXFAILCOUNT', label: 'Batas gagal login', hint: 'Gagal beruntun sebelum akun/IP diblokir otomatis (kali).' },
  { key: 'BLOCKDURATIONMIN', label: 'Durasi blokir otomatis', hint: 'Menit. Lama blokir USERNAME/IP otomatis.' },
  { key: 'SESIDLEMIN', label: 'Sesi habis tidak aktif', hint: 'Menit. Sesi lewat batas menjadi KEDALUWARSA.' },
  { key: 'SESMAXHOURS', label: 'Masa berlaku maksimum sesi', hint: 'Jam. Berlaku sejak login, walau masih aktif.' },
  { key: 'MAXSESSION', label: 'Maksimum sesi per user', hint: 'Sesi aktif. 0 = tanpa batas; kelebihan mencabut yang terlama.' },
];

const SELECTS: (keyof SecurityForm)[] = ['PWDREQUIREUPPER', 'PWDREQUIREDIGIT', 'PWDREQUIRESYMBOL'];

const EMPTY: SecurityForm = {
  PWDMINLEN: '8', PWDREQUIREUPPER: 'YES', PWDREQUIREDIGIT: 'YES', PWDREQUIRESYMBOL: 'NO',
  PWDEXPIRYDAYS: '0', MAXFAILCOUNT: '5', BLOCKDURATIONMIN: '15',
  SESIDLEMIN: '30', SESMAXHOURS: '12', MAXSESSION: '3',
};

const toForm = (r: any): SecurityForm => ({
  PWDMINLEN: String(r.PWDMINLEN ?? '8'),
  PWDREQUIREUPPER: String(r.PWDREQUIREUPPER || 'YES'),
  PWDREQUIREDIGIT: String(r.PWDREQUIREDIGIT || 'YES'),
  PWDREQUIRESYMBOL: String(r.PWDREQUIRESYMBOL || 'NO'),
  PWDEXPIRYDAYS: String(r.PWDEXPIRYDAYS ?? '0'),
  MAXFAILCOUNT: String(r.MAXFAILCOUNT ?? '5'),
  BLOCKDURATIONMIN: String(r.BLOCKDURATIONMIN ?? '15'),
  SESIDLEMIN: String(r.SESIDLEMIN ?? '30'),
  SESMAXHOURS: String(r.SESMAXHOURS ?? '12'),
  MAXSESSION: String(r.MAXSESSION ?? '3'),
});

// Window konfirmasi berisi tabel lama vs baru (hanya kolom yang berubah).
function ConfirmDiff({ diffs, onYes }: { diffs: Diff[]; onYes: () => void }) {
  const { close } = useModal();
  return (
    <Window
      title="Simpan Pengaturan?"
      icon="save"
      width="520px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
          <Btn pid="btsave" className="primary" icon="save" onClick={() => { close(); onYes(); }}>Simpan</Btn>
        </>
      }
    >
      <p className="empty-hint"><Icon name="info" size={16} /> Perubahan berikut akan berlaku untuk kejadian berikutnya. Sesi yang sedang berjalan tidak terputus.</p>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr><th>Pengaturan</th><th>Lama</th><th>Baru</th></tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td>{d.old}</td>
                <td><b>{d.cur}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Window>
  );
}

const GRIDcp_security = forwardRef<GridApi>(function GRIDcp_security(_props, ref) {
  const { open } = useModal();
  const { checkMenuAccess } = useAuth();
  const [form, setForm] = useState<SecurityForm>(EMPTY);
  const [saved, setSaved] = useState<SecurityForm | null>(null);
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [canWrite, setCanWrite] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_setting();
      if (parseBoolean(res?.success)) {
        const f = toForm((res.Rows || [])[0] || {});
        setForm(f);
        setSaved(f);
        setErrs({});
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { load(); }, [load]);

  const reset = useCallback(() => {
    if (saved) {
      setForm(saved);
      setErrs({});
      toast('Success', 'Form dikembalikan ke nilai tersimpan.', 'ok');
    } else load();
  }, [saved, load]);

  const set = (k: keyof SecurityForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    const num = (k: keyof SecurityForm, label: string, min: number, max: number) => {
      const s = form[k].trim();
      if (s === '') e[k] = 'Wajib diisi.';
      else if (!/^-?\d+$/.test(s) || Number(s) < min || Number(s) > max) e[k] = `Harus angka bulat ${min} sampai ${max}.`;
    };
    num('PWDMINLEN', 'Panjang password minimum', 6, 64);
    num('PWDEXPIRYDAYS', 'Masa berlaku password', 0, 365);
    num('MAXFAILCOUNT', 'Batas gagal login', 3, 10);
    num('BLOCKDURATIONMIN', 'Durasi blokir otomatis', 1, 1440);
    num('SESIDLEMIN', 'Sesi habis tidak aktif', 5, 480);
    num('SESMAXHOURS', 'Masa berlaku maksimum sesi', 1, 72);
    num('MAXSESSION', 'Maksimum sesi per user', 0, 20);
    for (const k of SELECTS) {
      if (form[k] !== 'YES' && form[k] !== 'NO') e[k] = 'Pilih Ya atau Tidak.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const doSave = useCallback(async (payload: SecurityForm) => {
    setBusy(true);
    try {
      const res: any = await proxy.process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pengaturan tersimpan.', 'ok');
        setSaved(payload);
        setErrs({});
      } else toast('Error', res?.message || 'Gagal menyimpan pengaturan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(() => {
    if (busy || loading) return;
    if (!canWrite) { toast('Error', 'Anda tidak memiliki hak akses untuk mengubah pengaturan ini.', 'err'); return; }
    if (!validate()) return;
    const base = saved || EMPTY;
    const diffs: Diff[] = FIELDS
      .filter((f) => String(form[f.key]).trim() !== String(base[f.key]).trim())
      .map((f) => ({
        key: f.key,
        label: f.label,
        old: SELECTS.includes(f.key) ? (base[f.key] === 'YES' ? 'Ya' : 'Tidak') : String(base[f.key]),
        cur: SELECTS.includes(f.key) ? (form[f.key] === 'YES' ? 'Ya' : 'Tidak') : form[f.key].trim(),
      }));
    if (!diffs.length) { toast('Success', 'Tidak ada perubahan yang disimpan.', 'ok'); return; }
    open(<ConfirmDiff diffs={diffs} onYes={() => doSave({ ...form })} />);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, loading, canWrite, form, saved, open, doSave]);

  useImperativeHandle(ref, () => ({ refresh, save, reset }), [refresh, save, reset]);

  useEffect(() => {
    load();
    checkMenuAccess('10030002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderField = (key: keyof SecurityForm, label: string, hint: string) => (
    <FrmRow label={label}>
      <div>
        {SELECTS.includes(key) ? (
          <select value={form[key]} onChange={(e) => set(key, e.target.value)}>
            <option value="YES">Ya</option>
            <option value="NO">Tidak</option>
          </select>
        ) : (
          <input className="input" type="number" value={form[key]} onChange={(e) => set(key, e.target.value)} />
        )}
        <span className="loading-hint">{hint}</span>
        {errs[key] && <span className="field-err">{errs[key]}</span>}
      </div>
    </FrmRow>
  );

  return (
    <div className="grid-box">
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load()}>Coba lagi</Btn>
        </div>
      )}
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : (
        <>
          <FrmSet legend="Kebijakan Password" icon="lock" columns={2}>
            {renderField('PWDMINLEN', 'Panjang minimum', FIELDS[0].hint)}
            {renderField('PWDREQUIREUPPER', 'Wajib huruf besar', FIELDS[1].hint)}
            {renderField('PWDREQUIREDIGIT', 'Wajib angka', FIELDS[2].hint)}
            {renderField('PWDREQUIRESYMBOL', 'Wajib simbol', FIELDS[3].hint)}
            {renderField('PWDEXPIRYDAYS', 'Masa berlaku (hari)', FIELDS[4].hint)}
          </FrmSet>
          <FrmSet legend="Proteksi Login" icon="user" columns={2}>
            {renderField('MAXFAILCOUNT', 'Batas gagal login', FIELDS[5].hint)}
            {renderField('BLOCKDURATIONMIN', 'Durasi blokir (menit)', FIELDS[6].hint)}
          </FrmSet>
          <FrmSet legend="Sesi" icon="history" columns={2}>
            {renderField('SESIDLEMIN', 'Habis tidak aktif (menit)', FIELDS[7].hint)}
            {renderField('SESMAXHOURS', 'Maksimum sesi (jam)', FIELDS[8].hint)}
            {renderField('MAXSESSION', 'Maksimum per user', FIELDS[9].hint)}
          </FrmSet>
          <div className="toolbar">
            <Btn
              pid="btsave" className="primary" icon="save"
              disabled={busy || !canWrite}
              title={canWrite ? 'Simpan pengaturan' : 'Anda tidak memiliki hak akses untuk mengubah pengaturan ini'}
              onClick={save}
            >
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Btn>
            <Btn icon="refresh" disabled={busy} onClick={reset}>Reset</Btn>
          </div>
        </>
      )}
    </div>
  );
});

export default GRIDcp_security;
