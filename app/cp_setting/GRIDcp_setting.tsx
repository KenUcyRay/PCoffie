// GRIDcp_setting — form satu halaman pengaturan aplikasi (bukan grid).
// Lima bagian: Identitas (+pratinjau logo/favicon), Kontak, Umum, Hukum,
// Pengirim Email (+kirim email uji). Simpan membuka konfirmasi ringkasan.
//
// State: form, saved, errs, busy, loading, err, canWrite, uploading, testMail
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import * as proxy from './api';
import { assetUrl } from './api';
import type { SettingForm } from './api';

export type GridApi = {
  refresh: () => void;
  save: () => void;
};

type FieldErrors = Partial<Record<string, string>>;

type Diff = { label: string; old: string; cur: string };

// Label tiap kolom (dipakai ringkasan konfirmasi).
const LABELS: Record<string, string> = {
  APPNAME: 'Nama aplikasi', SLOGAN: 'Slogan', LOGO: 'Logo', FAVICON: 'Favicon',
  CONTACTEMAIL: 'Email kontak', CONTACTPHONE: 'Telepon', CONTACTWA: 'WhatsApp', ADDRESS: 'Alamat',
  TIMEZONE: 'Zona waktu', CURRENCY: 'Mata uang', DATEFORMAT: 'Format tanggal',
  TERMS: 'Syarat dan ketentuan', PRIVACY: 'Kebijakan privasi', TERMSVERSION: 'Versi teks hukum',
  MAILFROMNAME: 'Nama pengirim', MAILFROMEMAIL: 'Email pengirim',
  SMTPHOST: 'Server SMTP', SMTPPORT: 'Port SMTP', SMTPENCRYPTION: 'Enkripsi',
  SMTPUSERNAME: 'Username SMTP', SMTPPASSWORD: 'Password SMTP',
};

const SHORT = (s: string, n = 60) => {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : (t || '-');
};

const EMPTY: SettingForm = {
  APPNAME: 'Tiket APP', SLOGAN: '', LOGO: '', FAVICON: '',
  CONTACTEMAIL: '', CONTACTPHONE: '', CONTACTWA: '', ADDRESS: '',
  TIMEZONE: 'Asia/Jakarta', CURRENCY: 'RP', DATEFORMAT: '',
  TERMS: '', PRIVACY: '', TERMSVERSION: '',
  MAILFROMNAME: '', MAILFROMEMAIL: '', SMTPHOST: '', SMTPPORT: '',
  SMTPENCRYPTION: 'NONE', SMTPUSERNAME: '', SMTPPASSWORD: '',
};

const toForm = (r: any): SettingForm => ({
  APPNAME: String(r.APPNAME ?? 'Tiket APP'),
  SLOGAN: String(r.SLOGAN || ''),
  LOGO: String(r.LOGO || ''),
  FAVICON: String(r.FAVICON || ''),
  CONTACTEMAIL: String(r.CONTACTEMAIL || ''),
  CONTACTPHONE: String(r.CONTACTPHONE || ''),
  CONTACTWA: String(r.CONTACTWA || ''),
  ADDRESS: String(r.ADDRESS || ''),
  TIMEZONE: String(r.TIMEZONE || 'Asia/Jakarta'),
  CURRENCY: String(r.CURRENCY || 'RP'),
  DATEFORMAT: String(r.DATEFORMAT || ''),
  TERMS: String(r.TERMS || ''),
  PRIVACY: String(r.PRIVACY || ''),
  TERMSVERSION: String(r.TERMSVERSION || ''),
  MAILFROMNAME: String(r.MAILFROMNAME || ''),
  MAILFROMEMAIL: String(r.MAILFROMEMAIL || ''),
  SMTPHOST: String(r.SMTPHOST || ''),
  SMTPPORT: r.SMTPPORT == null ? '' : String(r.SMTPPORT),
  SMTPENCRYPTION: String(r.SMTPENCRYPTION || 'NONE'),
  SMTPUSERNAME: String(r.SMTPUSERNAME || ''),
  SMTPPASSWORD: '',
  HAS_PASSWORD: String(r.HAS_PASSWORD || 'NO'),
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
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr><th>Pengaturan</th><th>Lama</th><th>Baru</th></tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.label}>
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

const GRIDcp_setting = forwardRef<GridApi>(function GRIDcp_setting(_props, ref) {
  const { open } = useModal();
  const { checkMenuAccess } = useAuth();
  const [form, setForm] = useState<SettingForm>(EMPTY);
  const [saved, setSaved] = useState<SettingForm | null>(null);
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [canWrite, setCanWrite] = useState(true);
  const [uploading, setUploading] = useState('');
  const [testMail, setTestMail] = useState('');
  const [testingMail, setTestingMail] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

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

  const resetSection = useCallback((keys: (keyof SettingForm)[]) => {
    if (!saved) { load(); return; }
    setForm((f) => {
      const next = { ...f };
      for (const k of keys) (next as any)[k] = (saved as any)[k];
      return next;
    });
    setErrs((e) => {
      const next = { ...e };
      for (const k of keys) delete next[k as string];
      return next;
    });
    toast('Success', 'Bagian dikembalikan ke nilai tersimpan.', 'ok');
  }, [saved, load]);

  const set = (k: keyof SettingForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k as string]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.APPNAME.trim()) e.APPNAME = 'Nama aplikasi wajib diisi.';
    else if (form.APPNAME.trim().length > 100) e.APPNAME = 'Nama aplikasi maksimal 100 karakter.';
    if (form.SLOGAN.trim().length > 200) e.SLOGAN = 'Slogan maksimal 200 karakter.';
    for (const [k, label] of [['CONTACTEMAIL', 'Email kontak'], ['MAILFROMEMAIL', 'Email pengirim']] as const) {
      const v = (form as any)[k].trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) (e as any)[k] = `${label} tidak valid.`;
    }
    for (const [k, label] of [['CONTACTPHONE', 'Nomor telepon'], ['CONTACTWA', 'Nomor WhatsApp']] as const) {
      const v = (form as any)[k].trim();
      if (v && !/^[0-9+\-\s]+$/.test(v)) (e as any)[k] = `${label} hanya boleh angka, spasi, plus, dan strip.`;
    }
    if (!['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'].includes(form.TIMEZONE)) e.TIMEZONE = 'Zona waktu tidak valid.';
    if (form.CURRENCY !== 'RP') e.CURRENCY = 'Mata uang hanya RP.';
    if (form.TERMS.length > 20000) e.TERMS = 'Maksimal 20000 karakter.';
    if (form.PRIVACY.length > 20000) e.PRIVACY = 'Maksimal 20000 karakter.';
    if (form.SMTPHOST.trim()) {
      if (!/^\d+$/.test(form.SMTPPORT.trim()) || Number(form.SMTPPORT) < 1 || Number(form.SMTPPORT) > 65535) {
        e.SMTPPORT = 'Port SMTP harus 1 sampai 65535.';
      }
      if (!['NONE', 'SSL', 'TLS'].includes(form.SMTPENCRYPTION)) e.SMTPENCRYPTION = 'Enkripsi harus NONE, SSL, atau TLS.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const doSave = useCallback(async (payload: SettingForm) => {
    setBusy(true);
    try {
      const res: any = await proxy.process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pengaturan tersimpan.', 'ok');
        const f = { ...payload, SMTPPASSWORD: '', HAS_PASSWORD: payload.SMTPPASSWORD ? 'YES' : (saved?.HAS_PASSWORD || 'NO') };
        setForm(f);
        setSaved(f);
        setErrs({});
      } else toast('Error', res?.message || 'Gagal menyimpan pengaturan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  }, [saved]);

  const save = useCallback(() => {
    if (busy || loading) return;
    if (!canWrite) { toast('Error', 'Anda tidak memiliki hak akses untuk mengubah pengaturan ini.', 'err'); return; }
    if (!validate()) return;
    const base = saved || EMPTY;
    const diffs: Diff[] = (Object.keys(LABELS) as (keyof SettingForm)[])
      .filter((k) => {
        if (k === 'SMTPPASSWORD') return form.SMTPPASSWORD !== '';
        if (k === 'LOGO' || k === 'FAVICON') return false; // logo difoto lewat upload
        return String((form as any)[k] ?? '').trim() !== String((base as any)[k] ?? '').trim();
      })
      .map((k) => ({
        label: LABELS[k as string],
        old: k === 'SMTPPASSWORD' ? '***' : SHORT(String((base as any)[k] ?? '')),
        cur: k === 'SMTPPASSWORD' ? 'diubah' : SHORT(String((form as any)[k] ?? '').trim()),
      }));
    if (!diffs.length) { toast('Success', 'Tidak ada perubahan yang disimpan.', 'ok'); return; }
    open(<ConfirmDiff diffs={diffs} onYes={() => doSave({ ...form })} />);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, loading, canWrite, form, saved, open, doSave]);

  const doUpload = useCallback(async (kind: 'logo' | 'favicon', file: File) => {
    const okExt = kind === 'logo' ? /\.(png|jpe?g)$/i : /\.(png|jpe?g|ico)$/i;
    if (!okExt.test(file.name)) {
      toast('Error', kind === 'logo' ? 'Logo hanya boleh PNG atau JPG.' : 'Favicon hanya boleh PNG, JPG, atau ICO.', 'err');
      return;
    }
    if (file.size > 2 * 1024 * 1024) { toast('Error', 'Ukuran file maksimal 2MB.', 'err'); return; }
    setUploading(kind);
    try {
      const res: any = kind === 'logo' ? await proxy.upload_logo(file) : await proxy.upload_favicon(file);
      if (parseBoolean(res?.success) && res.path) {
        setForm((f) => ({ ...f, [kind === 'logo' ? 'LOGO' : 'FAVICON']: String(res.path) }));
        toast('Success', res.message || 'File berhasil diupload.', 'ok');
      } else toast('Error', res?.message || 'Upload file gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message || 'Upload file gagal.', 'err');
    } finally {
      setUploading('');
    }
  }, []);

  const sendTest = useCallback(async () => {
    if (testingMail) return;
    if (!testMail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testMail.trim())) {
      toast('Error', 'Isi alamat email tujuan uji yang valid.', 'err');
      return;
    }
    setTestingMail(true);
    try {
      const res: any = await proxy.send_test_email({
        TESTEMAIL: testMail.trim(),
        APPNAME: form.APPNAME,
        MAILFROMEMAIL: form.MAILFROMEMAIL,
        MAILFROMNAME: form.MAILFROMNAME,
        SMTPHOST: form.SMTPHOST,
        SMTPPORT: form.SMTPPORT,
        SMTPENCRYPTION: form.SMTPENCRYPTION,
        SMTPUSERNAME: form.SMTPUSERNAME,
        SMTPPASSWORD: form.SMTPPASSWORD,
      });
      if (parseBoolean(res?.success)) toast('Success', res.message || 'Email uji terkirim.', 'ok');
      else toast('Error', res?.message || 'Email uji gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setTestingMail(false);
    }
  }, [testingMail, testMail, form]);

  useImperativeHandle(ref, () => ({ refresh, save }), [refresh, save]);

  useEffect(() => {
    load();
    checkMenuAccess('10060002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SEC_IDENTITY: (keyof SettingForm)[] = ['APPNAME', 'SLOGAN', 'LOGO', 'FAVICON'];
  const SEC_CONTACT: (keyof SettingForm)[] = ['CONTACTEMAIL', 'CONTACTPHONE', 'CONTACTWA', 'ADDRESS'];
  const SEC_GENERAL: (keyof SettingForm)[] = ['TIMEZONE', 'CURRENCY', 'DATEFORMAT'];
  const SEC_LEGAL: (keyof SettingForm)[] = ['TERMS', 'PRIVACY', 'TERMSVERSION'];
  const SEC_MAIL: (keyof SettingForm)[] = ['MAILFROMNAME', 'MAILFROMEMAIL', 'SMTPHOST', 'SMTPPORT', 'SMTPENCRYPTION', 'SMTPUSERNAME', 'SMTPPASSWORD'];

  const resetBtn = (keys: (keyof SettingForm)[], label: string) => (
    <Btn className="btn-sm" icon="refresh" disabled={busy} onClick={() => resetSection(keys)} title={`Reset ${label} ke nilai tersimpan`}>
      Reset {label}
    </Btn>
  );

  const errOf = (k: string) => (errs as any)[k] as string | undefined;

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
          <FrmSet legend="Identitas" icon="layout" columns={2}>
            <FrmRow label="Nama aplikasi">
              <div>
                <input className="input" value={form.APPNAME} onChange={(e) => set('APPNAME', e.target.value)} maxLength={100} />
                {errOf('APPNAME') && <span className="field-err">{errOf('APPNAME')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Slogan">
              <div>
                <input className="input" value={form.SLOGAN} onChange={(e) => set('SLOGAN', e.target.value)} maxLength={200} />
                {errOf('SLOGAN') && <span className="field-err">{errOf('SLOGAN')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Logo">
              <div>
                {form.LOGO && <img src={assetUrl(form.LOGO)} alt="Logo" style={{ height: 40, marginBottom: 6, display: 'block' }} />}
                <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload('logo', f); e.target.value = ''; }} />
                <Btn className="btn-sm" icon="upload" disabled={!!uploading} onClick={() => logoRef.current?.click()}>
                  {uploading === 'logo' ? 'Mengupload…' : 'Upload Logo (PNG/JPG)'}
                </Btn>
                <span className="loading-hint">Maksimal 2MB.</span>
              </div>
            </FrmRow>
            <FrmRow label="Favicon">
              <div>
                {form.FAVICON && <img src={assetUrl(form.FAVICON)} alt="Favicon" style={{ height: 24, marginBottom: 6, display: 'block' }} />}
                <input ref={faviconRef} type="file" accept=".png,.jpg,.jpeg,.ico" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload('favicon', f); e.target.value = ''; }} />
                <Btn className="btn-sm" icon="upload" disabled={!!uploading} onClick={() => faviconRef.current?.click()}>
                  {uploading === 'favicon' ? 'Mengupload…' : 'Upload Favicon (PNG/JPG/ICO)'}
                </Btn>
                <span className="loading-hint">Maksimal 2MB.</span>
              </div>
            </FrmRow>
          </FrmSet>
          <div className="toolbar">{resetBtn(SEC_IDENTITY, 'Identitas')}</div>
          <FrmSet legend="Kontak" icon="dept" columns={2}>
            <FrmRow label="Email kontak">
              <div>
                <input className="input" value={form.CONTACTEMAIL} onChange={(e) => set('CONTACTEMAIL', e.target.value)} maxLength={100} />
                {errOf('CONTACTEMAIL') && <span className="field-err">{errOf('CONTACTEMAIL')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Telepon">
              <div>
                <input className="input" value={form.CONTACTPHONE} onChange={(e) => set('CONTACTPHONE', e.target.value)} maxLength={30} />
                {errOf('CONTACTPHONE') && <span className="field-err">{errOf('CONTACTPHONE')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="WhatsApp">
              <div>
                <input className="input" value={form.CONTACTWA} onChange={(e) => set('CONTACTWA', e.target.value)} maxLength={30} />
                {errOf('CONTACTWA') && <span className="field-err">{errOf('CONTACTWA')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Alamat">
              <div>
                <textarea className="input" rows={2} value={form.ADDRESS} onChange={(e) => set('ADDRESS', e.target.value)} maxLength={500} />
                {errOf('ADDRESS') && <span className="field-err">{errOf('ADDRESS')}</span>}
              </div>
            </FrmRow>
          </FrmSet>
          <div className="toolbar">{resetBtn(SEC_CONTACT, 'Kontak')}</div>
          <FrmSet legend="Pengaturan Umum" icon="gear" columns={2}>
            <FrmRow label="Zona waktu">
              <div>
                <select value={form.TIMEZONE} onChange={(e) => set('TIMEZONE', e.target.value)}>
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Makassar">Asia/Makassar</option>
                  <option value="Asia/Jayapura">Asia/Jayapura</option>
                </select>
                {errOf('TIMEZONE') && <span className="field-err">{errOf('TIMEZONE')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Mata uang">
              <select value={form.CURRENCY} onChange={(e) => set('CURRENCY', e.target.value)}>
                <option value="RP">RP</option>
              </select>
            </FrmRow>
            <FrmRow label="Format tanggal">
              <div>
                <input className="input" placeholder="cth. DD MMM YYYY" value={form.DATEFORMAT} onChange={(e) => set('DATEFORMAT', e.target.value)} maxLength={30} />
                {errOf('DATEFORMAT') && <span className="field-err">{errOf('DATEFORMAT')}</span>}
              </div>
            </FrmRow>
          </FrmSet>
          <div className="toolbar">{resetBtn(SEC_GENERAL, 'Umum')}</div>
          <FrmSet legend="Syarat & Privasi" icon="report" columns={1}>
            <FrmRow label="Syarat dan ketentuan">
              <div>
                <textarea className="input" rows={4} value={form.TERMS} onChange={(e) => set('TERMS', e.target.value)} />
                <span className="loading-hint">Teks biasa (tanpa HTML). {form.TERMS.length}/20000 karakter.</span>
                {errOf('TERMS') && <span className="field-err">{errOf('TERMS')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Kebijakan privasi">
              <div>
                <textarea className="input" rows={4} value={form.PRIVACY} onChange={(e) => set('PRIVACY', e.target.value)} />
                <span className="loading-hint">Teks biasa (tanpa HTML). {form.PRIVACY.length}/20000 karakter.</span>
                {errOf('PRIVACY') && <span className="field-err">{errOf('PRIVACY')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Versi teks">
              <div>
                <input className="input" placeholder="cth. 2026-10-03" value={form.TERMSVERSION} onChange={(e) => set('TERMSVERSION', e.target.value)} maxLength={50} />
                {errOf('TERMSVERSION') && <span className="field-err">{errOf('TERMSVERSION')}</span>}
              </div>
            </FrmRow>
          </FrmSet>
          <div className="toolbar">{resetBtn(SEC_LEGAL, 'Hukum')}</div>
          <FrmSet legend="Pengirim Email" icon="mail" columns={2}>
            <FrmRow label="Nama pengirim">
              <div>
                <input className="input" value={form.MAILFROMNAME} onChange={(e) => set('MAILFROMNAME', e.target.value)} maxLength={100} />
                {errOf('MAILFROMNAME') && <span className="field-err">{errOf('MAILFROMNAME')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Email pengirim">
              <div>
                <input className="input" value={form.MAILFROMEMAIL} onChange={(e) => set('MAILFROMEMAIL', e.target.value)} maxLength={100} />
                {errOf('MAILFROMEMAIL') && <span className="field-err">{errOf('MAILFROMEMAIL')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Server SMTP">
              <div>
                <input className="input" placeholder="cth. mail.contoh.id" value={form.SMTPHOST} onChange={(e) => set('SMTPHOST', e.target.value)} maxLength={100} />
                {errOf('SMTPHOST') && <span className="field-err">{errOf('SMTPHOST')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Port">
              <div>
                <input className="input" type="number" placeholder="cth. 587" value={form.SMTPPORT} onChange={(e) => set('SMTPPORT', e.target.value)} />
                {errOf('SMTPPORT') && <span className="field-err">{errOf('SMTPPORT')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Enkripsi">
              <div>
                <select value={form.SMTPENCRYPTION} onChange={(e) => set('SMTPENCRYPTION', e.target.value)}>
                  <option value="NONE">NONE</option>
                  <option value="SSL">SSL</option>
                  <option value="TLS">TLS</option>
                </select>
                {errOf('SMTPENCRYPTION') && <span className="field-err">{errOf('SMTPENCRYPTION')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Username SMTP">
              <div>
                <input className="input" value={form.SMTPUSERNAME} onChange={(e) => set('SMTPUSERNAME', e.target.value)} maxLength={100} />
                {errOf('SMTPUSERNAME') && <span className="field-err">{errOf('SMTPUSERNAME')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Password SMTP">
              <div>
                <input
                  className="input" type="password" autoComplete="new-password"
                  placeholder={form.HAS_PASSWORD === 'YES' ? 'Sudah terisi, kosongkan jika tidak diubah' : 'Belum diisi'}
                  value={form.SMTPPASSWORD} onChange={(e) => set('SMTPPASSWORD', e.target.value)}
                />
                <span className="loading-hint">Tidak pernah ditampilkan kembali.</span>
                {errOf('SMTPPASSWORD') && <span className="field-err">{errOf('SMTPPASSWORD')}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Email tujuan uji">
              <div>
                <input className="input" placeholder="cth. admin@contoh.id" value={testMail} onChange={(e) => setTestMail(e.target.value)} />
              </div>
            </FrmRow>
          </FrmSet>
          <div className="toolbar">
            {resetBtn(SEC_MAIL, 'Email')}
            <Btn className="btn-sm" icon="mail" disabled={testingMail || busy} onClick={sendTest}>
              {testingMail ? 'Mengirim…' : 'Kirim Email Uji'}
            </Btn>
          </div>
          <div className="toolbar">
            <Btn
              pid="btsave" className="primary" icon="save"
              disabled={busy || !canWrite}
              title={canWrite ? 'Simpan pengaturan' : 'Anda tidak memiliki hak akses untuk mengubah pengaturan ini'}
              onClick={save}
            >
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
});

export default GRIDcp_setting;
