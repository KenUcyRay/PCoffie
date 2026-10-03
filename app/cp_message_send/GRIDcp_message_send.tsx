// GRIDcp_message_send — form kirim pesan + pratinjau inbox + konfirmasi ringkasan.
// Target ALL/GROUP/USER: multi-checkbox group, pencarian multi-user.
// Pratinjau jumlah penerima diperbarui otomatis (debounce).
//
// State: form, groups, users, picked, preview, errs, busy, loading, err, canWrite
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import * as proxy from './api';
import type { SendForm, TargetType } from './api';

export type GridApi = {
  refresh: () => void;
  send: () => void;
};

type FieldErrors = { TITLE?: string; BODY?: string; TARGET?: string; EXPIRESAT?: string };

type GroupOpt = { DEFCODE: string; DEFNAME?: string };
type UserOpt = { USERID: number; USERLOGIN: string; USERNAME?: string; USERGROUP?: string };

const EMPTY: SendForm = {
  TITLE: '', BODY: '', PRIORITY: 'INFO', TARGETTYPE: 'ALL', TARGET: [], EXPIRESAT: '',
};

// Window konfirmasi berisi ringkasan kiriman (penekanan ALL/DARURAT).
function ConfirmSend({ summary, urgent, onYes }: {
  summary: { label: string; value: string }[]; urgent: boolean; onYes: () => void;
}) {
  const { close } = useModal();
  return (
    <Window
      title="Kirim Pesan?"
      icon="mail"
      width="520px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
          <Btn pid="btsend" className="primary" icon="mail" onClick={() => { close(); onYes(); }}>Kirim</Btn>
        </>
      }
    >
      {urgent && (
        <p className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>Pesan ini dikirim ke SEMUA user dan/atau berprioritas DARURAT. Pastikan isi sudah benar.</span>
        </p>
      )}
      <div className="table-wrap">
        <table className="grid">
          <tbody>
            {summary.map((s) => (
              <tr key={s.label}>
                <td style={{ width: 130 }}><b>{s.label}</b></td>
                <td>{s.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Window>
  );
}

const GRIDcp_message_send = forwardRef<GridApi>(function GRIDcp_message_send(_props, ref) {
  const { open } = useModal();
  const { checkMenuAccess } = useAuth();
  const [form, setForm] = useState<SendForm>(EMPTY);
  const [groups, setGroups] = useState<GroupOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [userQ, setUserQ] = useState('');
  const [picked, setPicked] = useState<UserOpt[]>([]);
  const [preview, setPreview] = useState<{ COUNT: number; SAMPLE: string }>({ COUNT: 0, SAMPLE: '' });
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [canWrite, setCanWrite] = useState(true);
  const prevTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idemKey = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_groups();
      if (parseBoolean(res?.success)) setGroups(res.Rows || []);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { load(); }, [load]);

  const searchUsers = useCallback(async (q: string) => {
    try {
      const res: any = await proxy.read_users(q);
      if (parseBoolean(res?.success)) setUsers(res.Rows || []);
    } catch { /* daftar user gagal: biarkan kosong */ }
  }, []);

  // Pratinjau jumlah penerima (debounce 500ms).
  const updatePreview = useCallback((f: SendForm, pick: UserOpt[]) => {
    if (prevTimer.current) clearTimeout(prevTimer.current);
    prevTimer.current = setTimeout(async () => {
      try {
        const targets = f.TARGETTYPE === 'GROUP'
          ? f.TARGET
          : f.TARGETTYPE === 'USER'
            ? pick.map((u) => u.USERID)
            : [];
        const res: any = await proxy.preview_count({ TARGETTYPE: f.TARGETTYPE, TARGET: targets });
        if (parseBoolean(res?.success)) {
          const row = (res.Rows || [])[0] || {};
          setPreview({ COUNT: Number(row.COUNT) || 0, SAMPLE: String(row.SAMPLE || '') });
        }
      } catch { /* pratinjau gagal: biarkan angka lama */ }
    }, 500);
  }, []);

  useEffect(() => () => { if (prevTimer.current) clearTimeout(prevTimer.current); }, []);

  const set = (k: keyof SendForm, v: SendForm[keyof SendForm]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      updatePreview(next, picked);
      return next;
    });
    setErrs((e) => ({ ...e, [k === 'TITLE' || k === 'BODY' || k === 'EXPIRESAT' ? k : 'TARGET']: undefined }));
  };

  const toggleGroup = (code: string, on: boolean) => {
    setForm((f) => {
      const cur = (f.TARGET as string[]).filter((x) => x !== code);
      if (on) cur.push(code);
      const next = { ...f, TARGET: cur };
      updatePreview(next, picked);
      return next;
    });
    setErrs((e) => ({ ...e, TARGET: undefined }));
  };

  const toggleUser = (u: UserOpt, on: boolean) => {
    setPicked((prev) => {
      const next = on ? [...prev.filter((x) => x.USERID !== u.USERID), u] : prev.filter((x) => x.USERID !== u.USERID);
      updatePreview(form, next);
      return next;
    });
    setErrs((e) => ({ ...e, TARGET: undefined }));
  };

  const targetCount = (): number => preview.COUNT;

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.TITLE.trim()) e.TITLE = 'Judul wajib diisi.';
    else if (form.TITLE.trim().length > 100) e.TITLE = 'Judul maksimal 100 karakter.';
    if (!form.BODY.trim()) e.BODY = 'Isi pesan wajib diisi.';
    else if (form.BODY.trim().length > 2000) e.BODY = 'Isi pesan maksimal 2000 karakter.';
    if (form.TARGETTYPE === 'GROUP' && (form.TARGET as string[]).length === 0) e.TARGET = 'Pilih minimal satu group.';
    if (form.TARGETTYPE === 'USER' && picked.length === 0) e.TARGET = 'Pilih minimal satu user.';
    if (form.TARGETTYPE !== 'ALL' && form.TARGETTYPE !== 'GROUP' && form.TARGETTYPE !== 'USER') e.TARGET = 'Jenis target harus ALL, GROUP, atau USER.';
    if (form.EXPIRESAT) {
      const d = new Date(form.EXPIRESAT.replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) e.EXPIRESAT = 'Tanggal tidak valid.';
      else if (d.getTime() <= Date.now()) e.EXPIRESAT = 'Waktu berakhir harus di masa depan.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const targetLabel = (): string => {
    if (form.TARGETTYPE === 'ALL') return 'Semua user aktif';
    if (form.TARGETTYPE === 'GROUP') {
      const names = (form.TARGET as string[]).map((c) => groups.find((g) => g.DEFCODE === c)?.DEFNAME || c);
      return names.join(', ') || '-';
    }
    return picked.map((u) => u.USERLOGIN).join(', ') || '-';
  };

  const doSend = useCallback(async (payload: any) => {
    setBusy(true);
    try {
      const res: any = await proxy.process_send(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pesan terkirim.', 'ok');
        setForm(EMPTY);
        setPicked([]);
        setUserQ('');
        setUsers([]);
        setErrs({});
        setPreview({ COUNT: 0, SAMPLE: '' });
      } else toast('Error', res?.message || 'Gagal mengirim pesan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  }, []);

  const send = useCallback(() => {
    if (busy || loading) return;
    if (!canWrite) { toast('Error', 'Anda tidak memiliki hak akses untuk mengirim pesan.', 'err'); return; }
    if (!validate()) return;
    const n = targetCount();
    if (n <= 0) { toast('Error', 'Tidak ada penerima aktif untuk target ini.', 'err'); return; }
    const urgent = form.TARGETTYPE === 'ALL' || form.PRIORITY === 'DARURAT';
    idemKey.current = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const payload = {
      TITLE: form.TITLE.trim(),
      BODY: form.BODY.trim(),
      PRIORITY: form.PRIORITY,
      TARGETTYPE: form.TARGETTYPE,
      TARGET: form.TARGETTYPE === 'GROUP' ? form.TARGET : form.TARGETTYPE === 'USER' ? picked.map((u) => u.USERID) : [],
      EXPIRESAT: form.EXPIRESAT ? form.EXPIRESAT.replace('T', ' ') + ':00' : '',
      IDEMPOTENCYKEY: idemKey.current,
    };
    open(
      <ConfirmSend
        summary={[
          { label: 'Judul', value: payload.TITLE },
          { label: 'Prioritas', value: payload.PRIORITY },
          { label: 'Target', value: form.TARGETTYPE === 'ALL' ? 'Semua user aktif' : `${form.TARGETTYPE} (${targetLabel()})` },
          { label: 'Penerima', value: `${n} user` },
          { label: 'Berakhir tampil', value: form.EXPIRESAT ? form.EXPIRESAT.replace('T', ' ') : 'Tidak dibatasi' },
        ]}
        urgent={urgent}
        onYes={() => doSend(payload)}
      />,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, loading, canWrite, form, picked, preview, open, doSend]);

  useImperativeHandle(ref, () => ({ refresh, send }), [refresh, send]);

  useEffect(() => {
    load();
    searchUsers('');
    checkMenuAccess('10050002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prioBadge = (p: string) => (
    <span className={`badge ${p === 'DARURAT' ? 'err' : p === 'PENTING' ? '' : 'ok'}`}>{p}</span>
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
          <FrmSet legend="Pesan" icon="mail" columns={2}>
            <FrmRow label="Judul">
              <div>
                <input className="input" value={form.TITLE} onChange={(e) => set('TITLE', e.target.value)} maxLength={100} />
                {errs.TITLE && <span className="field-err">{errs.TITLE}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Prioritas">
              <select value={form.PRIORITY} onChange={(e) => set('PRIORITY', e.target.value)}>
                <option value="INFO">INFO</option>
                <option value="PENTING">PENTING</option>
                <option value="DARURAT">DARURAT</option>
              </select>
            </FrmRow>
            <FrmRow label="Isi">
              <div>
                <textarea
                  className="input" rows={4}
                  value={form.BODY} onChange={(e) => set('BODY', e.target.value)} maxLength={2000}
                />
                <span className="loading-hint">{form.BODY.length}/2000 karakter. Teks biasa (tanpa HTML).</span>
                {errs.BODY && <span className="field-err">{errs.BODY}</span>}
              </div>
            </FrmRow>
            <FrmRow label="Berakhir tampil">
              <div>
                <input className="input" type="datetime-local" value={form.EXPIRESAT} onChange={(e) => set('EXPIRESAT', e.target.value)} />
                <span className="loading-hint">Opsional. Kosong = tampil terus.</span>
                {errs.EXPIRESAT && <span className="field-err">{errs.EXPIRESAT}</span>}
              </div>
            </FrmRow>
          </FrmSet>
          <FrmSet legend="Target" icon="user" columns={2}>
            <FrmRow label="Jenis target">
              <select
                value={form.TARGETTYPE}
                onChange={(e) => {
                  const t = e.target.value as TargetType;
                  set('TARGETTYPE', t);
                  set('TARGET', []);
                  if (t === 'USER') searchUsers(userQ);
                }}
              >
                <option value="ALL">Semua user aktif</option>
                <option value="GROUP">Group tertentu</option>
                <option value="USER">User tertentu</option>
              </select>
            </FrmRow>
            {form.TARGETTYPE === 'GROUP' && (
              <FrmRow label="Group">
                <div>
                  <ul className="akses-tree">
                    {groups.map((g) => (
                      <li key={g.DEFCODE}>
                        <label className="akses-row">
                          <input
                            type="checkbox"
                            checked={(form.TARGET as string[]).includes(g.DEFCODE)}
                            onChange={(e) => toggleGroup(g.DEFCODE, e.target.checked)}
                          />
                          <span className="tree-label">{g.DEFNAME || g.DEFCODE}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {errs.TARGET && <span className="field-err">{errs.TARGET}</span>}
                </div>
              </FrmRow>
            )}
            {form.TARGETTYPE === 'USER' && (
              <FrmRow label="User">
                <div>
                  <input
                    className="input" placeholder="Cari username…"
                    value={userQ}
                    onChange={(e) => { setUserQ(e.target.value); searchUsers(e.target.value); }}
                  />
                  <ul className="akses-tree">
                    {users.map((u) => (
                      <li key={u.USERID}>
                        <label className="akses-row">
                          <input
                            type="checkbox"
                            checked={picked.some((x) => x.USERID === u.USERID)}
                            onChange={(e) => toggleUser(u, e.target.checked)}
                          />
                          <span className="tree-label">{u.USERLOGIN}{u.USERNAME ? ` (${u.USERNAME})` : ''}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {picked.length > 0 && (
                    <span className="loading-hint">Terpilih: {picked.map((u) => u.USERLOGIN).join(', ')}</span>
                  )}
                  {errs.TARGET && <span className="field-err">{errs.TARGET}</span>}
                </div>
              </FrmRow>
            )}
          </FrmSet>
          <FrmSet legend="Pratinjau" icon="view" columns={1}>
            <div className="card-body">
              <p><b>{form.TITLE || '(tanpa judul)'}</b> {prioBadge(form.PRIORITY)}</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{form.BODY || '(tanpa isi)'}</p>
              <p className="loading-hint">
                Penerima: <b>{targetCount()} user</b>
                {preview.SAMPLE ? ` (${preview.SAMPLE}${targetCount() > 5 ? ', …' : ''})` : ''}
                {' '}• Target: {form.TARGETTYPE === 'ALL' ? 'Semua user aktif' : targetLabel() || '-'}
              </p>
            </div>
          </FrmSet>
          <div className="toolbar">
            <Btn
              pid="btsend" className="primary" icon="mail"
              disabled={busy || !canWrite}
              title={canWrite ? 'Kirim pesan' : 'Anda tidak memiliki hak akses untuk mengirim pesan'}
              onClick={send}
            >
              {busy ? 'Mengirim…' : 'Kirim'}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
});

export default GRIDcp_message_send;
