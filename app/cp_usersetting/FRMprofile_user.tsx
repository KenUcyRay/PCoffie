'use client';
import { useEffect, useState } from 'react';
import { apiPost, parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import type { Dept } from './FRMlist_department';
import { change_password } from './api';
import { Btn, EmptyRow, Icon } from '@/components/Icon';

// Padanan FRMprofile_user.js langit_v2: info user read-only + Change Password + Department Access.
export default function FRMprofile_user() {
  const { close } = useModal();
  const [pw, setPw] = useState({ USERLOGIN: '', USERPASSWORD: '', NEWPASSWORD: '', CONFIRMPASSWORD: '' });
  const [info, setInfo] = useState({ USERNAME: '', USEREMAIL: '', USERGROUP: '' });
  const [depts, setDepts] = useState<Dept[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const me: any = await apiPost('auth/me', { method: 'me' }, { skipAuthExpiredHandler: true });
      let prof: any = me?.profile;
      if (typeof prof === 'string') { try { prof = JSON.parse(prof); } catch { prof = {}; } }
      if (Array.isArray(prof)) prof = prof[0] || {};
      const login = prof?.USERLOGIN || '';
      if (!alive || !login) return;
      setPw((v) => ({ ...v, USERLOGIN: login }));
      setInfo({ USERNAME: prof?.USERNAME || '', USEREMAIL: prof?.USEREMAIL || '', USERGROUP: prof?.USERGROUP || '' });

      const res: any = await apiPost('home/cpuser/cpuser', {
        method: 'read_akses_department',
        vdata: JSON.stringify({ USERLOGIN: login }),
      });
      if (alive && parseBoolean(res?.success)) setDepts(res.Rows || []);
    })();
    return () => { alive = false; };
  }, []);

  const doChangePassword = async () => {
    if (!pw.USERPASSWORD || !pw.NEWPASSWORD || !pw.CONFIRMPASSWORD) {
      toast('Error', 'Lengkapi Old/New/Confirm Password.', 'err');
      return;
    }
    if (pw.NEWPASSWORD !== pw.CONFIRMPASSWORD) {
      toast('Error', 'Password baru tidak sesuai dengan Confirm Password', 'err');
      return;
    }
    if (!window.confirm('Konfirmasi perubahan password')) return;
    setBusy(true);
    try {
      const res: any = await change_password(pw);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Password berhasil diubah.', 'ok');
        close();
      } else toast('Error', res?.message || 'Gagal proses perubahan password', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-head"><Icon name="userCircle" size={17} /> User Profile</div>
      <fieldset className="fset">
        <legend><Icon name="user" size={14} /> User Info</legend>
        <div className="fset-grid">
          <label>User Login<input className="input" value={pw.USERLOGIN} readOnly /></label>
          <label>User Name<input className="input" value={info.USERNAME} readOnly /></label>
          <label>Email<input className="input" value={info.USEREMAIL} readOnly /></label>
          <label>Group<input className="input" value={info.USERGROUP} readOnly /></label>
        </div>
      </fieldset>

      <fieldset className="fset">
        <legend><Icon name="key" size={14} /> Change Password</legend>
        <div className="fset-grid">
          <label>Old Password<input className="input" type="password" value={pw.USERPASSWORD} onChange={(e) => setPw({ ...pw, USERPASSWORD: e.target.value })} /></label>
          <label>New Password<input className="input" type="password" value={pw.NEWPASSWORD} onChange={(e) => setPw({ ...pw, NEWPASSWORD: e.target.value })} /></label>
          <label>Confirm Password<input className="input" type="password" value={pw.CONFIRMPASSWORD} onChange={(e) => setPw({ ...pw, CONFIRMPASSWORD: e.target.value })} /></label>
          <div><Btn className="primary" icon="key" disabled={busy} onClick={doChangePassword}>Change Password</Btn></div>
        </div>
      </fieldset>

      <fieldset className="fset">
        <legend><Icon name="dept" size={14} /> Department Access</legend>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Kode</th><th>Department</th></tr></thead>
            <tbody>
              {depts.map((d) => <tr key={d.DEPTCODE}><td>{d.DEPTCODE}</td><td>{d.DEPTNAME}</td></tr>)}
              {!depts.length && <EmptyRow colSpan={2} />}
            </tbody>
          </table>
        </div>
      </fieldset>

      <div className="modal-foot">
        <Btn icon="close" onClick={close}>Close</Btn>
      </div>
    </>
  );
}