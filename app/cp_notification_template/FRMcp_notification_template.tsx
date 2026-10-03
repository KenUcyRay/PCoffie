// Padanan FRM template: ubah judul + isi + status, pratinjau live,
// kirim email uji (EMAIL), reset ke bawaan. Kode/saluran hanya tampil.
// Penanda diklik untuk disisipkan ke posisi kursor.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { read_detail, process_update, preview, reset_default, send_test_email } from './api';

export type TemplateForm = {
  TEMPLATEID?: number;
  SUBJECT: string;
  BODY: string;
  ISACTIVE: string;
};

type FieldErrors = { SUBJECT?: string; BODY?: string };
type Placeholder = { name: string; contoh: string; deskripsi: string };

function parsePlaceholders(raw: unknown): Placeholder[] {
  if (!raw) return [];
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!j || typeof j !== 'object') return [];
    return Object.keys(j).map((k) => ({
      name: k,
      contoh: String((j as any)[k]?.contoh ?? (j as any)[k] ?? ''),
      deskripsi: String((j as any)[k]?.deskripsi ?? ''),
    }));
  } catch {
    return [];
  }
}

export default function FRMcp_notification_template({
  templateid,
  canWrite,
  onSaved,
}: {
  templateid: number;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [info, setInfo] = useState<any>(null);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [form, setForm] = useState<TemplateForm>({ SUBJECT: '', BODY: '', ISACTIVE: 'YES' });
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [prevSubj, setPrevSubj] = useState('');
  const [prevBody, setPrevBody] = useState('');
  const [testMail, setTestMail] = useState('');
  const [testingMail, setTestingMail] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const prevTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await read_detail(templateid);
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        setInfo(row);
        setPlaceholders(parsePlaceholders(row.PLACEHOLDERS));
        setForm({ TEMPLATEID: templateid, SUBJECT: String(row.SUBJECT || ''), BODY: String(row.BODY || ''), ISACTIVE: String(row.ISACTIVE || 'YES') });
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [templateid]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (prevTimer.current) clearTimeout(prevTimer.current); }, []);

  // Pratinjau live memakai contoh nilai (debounce 500ms).
  const updatePreview = useCallback((subj: string, body: string) => {
    if (prevTimer.current) clearTimeout(prevTimer.current);
    prevTimer.current = setTimeout(async () => {
      try {
        const res: any = await preview({ TEMPLATEID: templateid, SUBJECT: subj, BODY: body });
        if (parseBoolean(res?.success)) {
          const row = (res.Rows || [])[0] || {};
          setPrevSubj(String(row.SUBJECT || ''));
          setPrevBody(String(row.BODY || ''));
        }
      } catch { /* pratinjau gagal: biarkan yang lama */ }
    }, 500);
  }, [templateid]);

  useEffect(() => { updatePreview(form.SUBJECT, form.BODY); }, [form.SUBJECT, form.BODY, updatePreview]);

  const set = (k: keyof TemplateForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  // Sisipkan penanda ke posisi kursor area isi.
  const insertTag = (name: string) => {
    const tag = `{{${name}}}`;
    const el = bodyRef.current;
    if (!el) { set('BODY', `${form.BODY}${tag}`); return; }
    const s = el.selectionStart ?? form.BODY.length;
    const epos = el.selectionEnd ?? form.BODY.length;
    const next = form.BODY.slice(0, s) + tag + form.BODY.slice(epos);
    set('BODY', next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + tag.length, s + tag.length);
    });
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.SUBJECT.trim()) e.SUBJECT = 'Judul wajib diisi.';
    else if (form.SUBJECT.trim().length > 150) e.SUBJECT = 'Judul maksimal 150 karakter.';
    if (!form.BODY.trim()) e.BODY = 'Isi wajib diisi.';
    else if (form.BODY.trim().length > 5000) e.BODY = 'Isi maksimal 5000 karakter.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (form.ISACTIVE === 'NO' && !await confirmDialog({ message: `Nonaktifkan template ${info?.CODE || ''}? Sistem tidak akan mengirim pesan ini.`, okText: 'Ya, Nonaktifkan' })) return;
    if (form.ISACTIVE !== 'NO' && !await confirmDialog({ message: 'Simpan Template?' })) return;
    setBusy(true);
    try {
      const res: any = await process_update({ TEMPLATEID: templateid, SUBJECT: form.SUBJECT.trim(), BODY: form.BODY.trim(), ISACTIVE: form.ISACTIVE });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Template tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan template.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!await confirmDialog({ message: `Kembalikan template ${info?.CODE || ''} ke bawaan? Judul dan isi saat ini diganti.`, okText: 'Ya, Kembalikan', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await reset_default({ TEMPLATEID: templateid });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Template dikembalikan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal mengembalikan template.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (testingMail) return;
    if (!testMail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testMail.trim())) {
      toast('Error', 'Isi alamat email tujuan uji yang valid.', 'err');
      return;
    }
    setTestingMail(true);
    try {
      const res: any = await send_test_email({ TEMPLATEID: templateid, TESTEMAIL: testMail.trim() });
      if (parseBoolean(res?.success)) toast('Success', res.message || 'Email uji terkirim.', 'ok');
      else toast('Error', res?.message || 'Email uji gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setTestingMail(false);
    }
  };

  const isEmail = String(info?.CHANNEL || '').toUpperCase() === 'EMAIL';

  return (
    <Window
      title={`Ubah Template ${info?.CODE || ''}`}
      icon="edit"
      width="720px"
      footer={
        <>
          <Btn
            className="btn-sm" icon="refresh" disabled={busy}
            title="Kembalikan judul dan isi ke bawaan"
            onClick={doReset}
          >
            Reset ke Bawaan
          </Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy || !canWrite} onClick={save}>Simpan</Btn>
        </>
      }
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load()}>Coba lagi</Btn>
        </div>
      ) : (
        <>
          <FrmSet legend="Template" icon="mail" columns={2}>
            <FrmRow label="Kode"><span><b>{info?.CODE}</b></span></FrmRow>
            <FrmRow label="Saluran"><span>{info?.CHANNEL}</span></FrmRow>
            <FrmRow label="Nama"><span>{info?.NAME}</span></FrmRow>
            <FrmRow label="Dipakai"><span>{info?.DESCR || '-'}</span></FrmRow>
            <FrmRow label="Judul">
              <div>
                <input className="input" value={form.SUBJECT} onChange={(e) => set('SUBJECT', e.target.value)} maxLength={150} />
                {errs.SUBJECT && <span className="field-err">{errs.SUBJECT}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Status">
              <select value={form.ISACTIVE} onChange={(e) => set('ISACTIVE', e.target.value)}>
                <option value="YES">Aktif</option>
                <option value="NO">Nonaktif</option>
              </select>
            </FrmRow>
            <FrmRow label="Isi">
              <div>
                <textarea ref={bodyRef} className="input" rows={6} value={form.BODY} onChange={(e) => set('BODY', e.target.value)} maxLength={5000} />
                <span className="loading-hint">{form.BODY.length}/5000 karakter.</span>
                {errs.BODY && <span className="field-err">{errs.BODY}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Penanda">
              <div>
                {placeholders.length === 0 && <span className="loading-hint">Tidak ada penanda.</span>}
                {placeholders.map((p) => (
                  <Btn
                    key={p.name} className="btn-sm" icon="add"
                    title={p.deskripsi ? `${p.name}: ${p.deskripsi} (cth. ${p.contoh})` : `Sisipkan {{${p.name}}}`}
                    onClick={() => insertTag(p.name)}
                    style={{ marginRight: 4, marginBottom: 4 }}
                  >
                    {`{{${p.name}}}`}
                  </Btn>
                ))}
                <span className="loading-hint">Klik untuk sisipkan ke posisi kursor.</span>
              </div>
            </FrmRow>
          </FrmSet>
          <FrmSet legend="Pratinjau" icon="view" columns={1}>
            <div className="card-body">
              <p><b>{prevSubj || '(judul)'}</b></p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{prevBody || '(isi)'}</p>
            </div>
          </FrmSet>
          {isEmail && (
            <FrmSet legend="Email Uji" icon="mail" columns={1}>
              <FrmRow label="Tujuan">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" placeholder="cth. admin@contoh.id" value={testMail} onChange={(e) => setTestMail(e.target.value)} />
                  <Btn className="btn-sm" icon="mail" disabled={testingMail || busy} onClick={sendTest}>
                    {testingMail ? 'Mengirim…' : 'Kirim'}
                  </Btn>
                </div>
              </FrmRow>
            </FrmSet>
          )}
        </>
      )}
    </Window>
  );
}
