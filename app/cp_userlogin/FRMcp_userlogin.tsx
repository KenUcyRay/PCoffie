// Padanan FRM user login: User Info + Password + Save User.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { read_group_combo, process_create, process_update } from './api';

export type UserLoginForm = {
  USERID?: number;
  USERLOGIN: string;
  USERNAME: string;
  USEREMAIL: string;
  USERGROUP: string;
  USERACTIVE: string;
  USERPASSWORD?: string;
};

type Group = { DEFCODE: string; DEFNAME?: string };

export default function FRMcp_userlogin({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: UserLoginForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<UserLoginForm>(
    initial || { USERLOGIN: '', USERNAME: '', USEREMAIL: '', USERGROUP: '', USERACTIVE: 'YES', USERPASSWORD: '' },
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res: any = await read_group_combo();
      if (parseBoolean(res?.success)) {
        const g = res.Rows || [];
        setGroups(g);
        setForm((f) => (f.USERGROUP ? f : { ...f, USERGROUP: g[0]?.DEFCODE || '' }));
      }
    })();
  }, []);

  const save = async () => {
    for (const k of ['USERLOGIN', 'USERNAME', 'USEREMAIL', 'USERGROUP'] as const) {
      if (!String(form[k] || '').trim()) { toast('Error', `${k} wajib diisi.`, 'err'); return; }
    }
    if (isNew && !form.USERPASSWORD) { toast('Error', 'USERPASSWORD wajib diisi.', 'err'); return; }
    if (!window.confirm('Simpan User Login?')) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form) : await process_update(form);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'User tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan user.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Create User Login' : 'Edit User Login'}
      icon={isNew ? 'add' : 'edit'}
      width="44%"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Save User</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="User Info" icon="user" columns={2}>
        <FrmRow label="User Login">
          <input className="input" value={form.USERLOGIN} readOnly={!isNew} onChange={(e) => setForm({ ...form, USERLOGIN: e.target.value })} />
        </FrmRow>
        <FrmRow label="User Name">
          <input className="input" value={form.USERNAME} onChange={(e) => setForm({ ...form, USERNAME: e.target.value })} />
        </FrmRow>
        <FrmRow label="Email">
          <input className="input" value={form.USEREMAIL} onChange={(e) => setForm({ ...form, USEREMAIL: e.target.value })} />
        </FrmRow>
        <FrmRow label="Status Aktif">
          <select value={form.USERACTIVE} onChange={(e) => setForm({ ...form, USERACTIVE: e.target.value })}>
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </FrmRow>
        <FrmRow label="Group">
          <select value={form.USERGROUP} onChange={(e) => setForm({ ...form, USERGROUP: e.target.value })}>
            {groups.map((g) => <option key={g.DEFCODE} value={g.DEFCODE}>{g.DEFNAME || g.DEFCODE}</option>)}
          </select>
        </FrmRow>
      </FrmSet>

      <FrmSet legend="Password" icon="lock" columns={2}>
        <FrmRow label="Password">
          <input className="input" type="password" value={form.USERPASSWORD || ''} onChange={(e) => setForm({ ...form, USERPASSWORD: e.target.value })} />
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
