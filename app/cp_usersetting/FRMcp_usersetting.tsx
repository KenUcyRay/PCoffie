'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import FRMlist_department, { type Dept } from './FRMlist_department';
import { read_akses_department, process_create, process_update } from './api';
import { read_data as read_groups } from '../cp_usergroup/api';
import { Btn, EmptyRow, Icon } from '@/components/Icon';

export type UserForm = {
  USERID?: number;
  USERLOGIN: string;
  USERNAME: string;
  USEREMAIL: string;
  USERGROUP: string;
  USERACTIVE: string;
  USERPASSWORD?: string;
};

type Group = { DEFCODE: string; DEFNAME?: string };

// Padanan FRMcp_usersetting.js langit_v2: User Info + Password + Department Access + Save User.
export default function FRMcp_usersetting({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: UserForm;
  onSaved: () => void;
}) {
  const { close, open } = useModal();
  const [form, setForm] = useState<UserForm>(
    initial || { USERLOGIN: '', USERNAME: '', USEREMAIL: '', USERGROUP: '', USERACTIVE: 'YES', USERPASSWORD: '' },
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res: any = await read_groups({ q: '' });
      if (parseBoolean(res?.success)) {
        const g = res.Rows || [];
        setGroups(g);
        setForm((f) => (f.USERGROUP ? f : { ...f, USERGROUP: g[0]?.DEFCODE || '' }));
      }
    })();
  }, []);

  useEffect(() => {
    if (isNew || !form.USERLOGIN) return;
    (async () => {
      const res: any = await read_akses_department(form.USERLOGIN);
      if (parseBoolean(res?.success)) setDepts(res.Rows || []);
    })();
  }, [isNew, form.USERLOGIN]);

  const addDept = () => {
    open(<FRMlist_department onSelect={(picked) => setDepts(picked)} />);
  };

  const save = async () => {
    for (const k of ['USERLOGIN', 'USERNAME', 'USEREMAIL', 'USERGROUP'] as const) {
      if (!String(form[k] || '').trim()) { toast('Error', `${k} wajib diisi.`, 'err'); return; }
    }
    if (isNew && !form.USERPASSWORD) { toast('Error', 'USERPASSWORD wajib diisi.', 'err'); return; }
    if (!window.confirm('Simpan User Akses?')) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(form, depts) : await process_update(form, depts);
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
    <>
      <div className="modal-head">
        <Icon name={isNew ? 'add' : 'edit'} size={17} />
        {isNew ? 'Create User' : 'Edit User'}
      </div>

      <fieldset className="fset">
        <legend><Icon name="user" size={14} /> User Info</legend>
        <div className="fset-grid">
          <label>User Login<input className="input" value={form.USERLOGIN} readOnly={!isNew} onChange={(e) => setForm({ ...form, USERLOGIN: e.target.value })} /></label>
          <label>User Name<input className="input" value={form.USERNAME} onChange={(e) => setForm({ ...form, USERNAME: e.target.value })} /></label>
          <label>Email<input className="input" value={form.USEREMAIL} onChange={(e) => setForm({ ...form, USEREMAIL: e.target.value })} /></label>
          <label>Status Aktif
            <select value={form.USERACTIVE} onChange={(e) => setForm({ ...form, USERACTIVE: e.target.value })}>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </label>
          <label>Group
            <select value={form.USERGROUP} onChange={(e) => setForm({ ...form, USERGROUP: e.target.value })}>
              {groups.map((g) => <option key={g.DEFCODE} value={g.DEFCODE}>{g.DEFNAME || g.DEFCODE}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="fset">
        <legend><Icon name="lock" size={14} /> Password</legend>
        <div className="fset-grid">
          <label>Password<input className="input" type="password" value={form.USERPASSWORD || ''} onChange={(e) => setForm({ ...form, USERPASSWORD: e.target.value })} /></label>
        </div>
      </fieldset>

      <fieldset className="fset">
        <legend><Icon name="dept" size={14} /> Department Access</legend>
        <div className="modal-toolbar">
          <Btn icon="add" onClick={addDept}>Tambah Department</Btn>
          {depts.length > 0 && <Btn className="danger" icon="eraser" onClick={() => setDepts([])}>Clear</Btn>}
        </div>
        <table className="grid">
          <thead><tr><th>Kode</th><th>Department</th><th style={{ width: 90 }} /></tr></thead>
          <tbody>
            {depts.map((d) => (
              <tr key={d.DEPTCODE}>
                <td>{d.DEPTCODE}</td>
                <td>{d.DEPTNAME}</td>
                <td><Btn className="danger btn-sm" iconOnly icon="del" title={`Hapus ${d.DEPTNAME}`} aria-label={`Hapus ${d.DEPTNAME}`} onClick={() => setDepts(depts.filter((x) => x.DEPTCODE !== d.DEPTCODE))} /></td>
              </tr>
            ))}
            {!depts.length && <EmptyRow colSpan={3} />}
          </tbody>
        </table>
      </fieldset>

      <div className="modal-foot">
        <Btn className="primary" icon="save" disabled={busy} onClick={save}>Save User</Btn>
        <Btn icon="close" onClick={close}>Batal</Btn>
      </div>
    </>
  );
}