'use client';
import { useEffect, useState } from 'react';
import { apiPost, parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { change_password } from './api';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';

// Padanan FRMprofile_user.js langit_v2: info user read-only + Change Password.
export default function FRMprofile_user() {
  const { close } = useModal();
  const [pw, setPw] = useState({ USERLOGIN: '', USERPASSWORD: '', NEWPASSWORD: '', CONFIRMPASSWORD: '' });
  const [info, setInfo] = useState({ USERNAME: '', USEREMAIL: '', USERGROUP: '' });
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
    <Window
      title="User Profile"
      icon="userCircle"
      width="52%"
      footer={
        <>
          <span className="spacer" />
          <Btn icon="close" onClick={close}>Close</Btn>
        </>
      }
    >
      <FrmSet legend="User Info" icon="user" columns={2}>
        <FrmRow label="User Login"><input className="input" value={pw.USERLOGIN} readOnly /></FrmRow>
        <FrmRow label="User Name"><input className="input" value={info.USERNAME} readOnly /></FrmRow>
        <FrmRow label="Email"><input className="input" value={info.USEREMAIL} readOnly /></FrmRow>
        <FrmRow label="Group"><input className="input" value={info.USERGROUP} readOnly /></FrmRow>
      </FrmSet>

      <FrmSet legend="Change Password" icon="key" columns={1}>
        <FrmRow label="Old Password">
          <input className="input" type="password" value={pw.USERPASSWORD} onChange={(e) => setPw({ ...pw, USERPASSWORD: e.target.value })} />
        </FrmRow>
        <FrmRow label="New Password">
          <input className="input" type="password" value={pw.NEWPASSWORD} onChange={(e) => setPw({ ...pw, NEWPASSWORD: e.target.value })} />
        </FrmRow>
        <FrmRow label="Confirm Password">
          <input className="input" type="password" value={pw.CONFIRMPASSWORD} onChange={(e) => setPw({ ...pw, CONFIRMPASSWORD: e.target.value })} />
        </FrmRow>
        <div>
          <Btn pid="btsave" className="primary" icon="key" disabled={busy} onClick={doChangePassword}>Change Password</Btn>
        </div>
      </FrmSet>
    </Window>
  );
}
