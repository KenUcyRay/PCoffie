// GRIDcp_usersetting — padanan GRIDcp_usersetting.js langit_v2, sekaligus
// "store + proxy"-nya: state, paging, pencarian, dan semua aksi grid lived di
// sini. Mainpage (cp_usersetting.tsx) TIDAK boleh nyimpen logic apa pun — dia
// cuma nyambungin toolbar -> controller -> grid lewat ref.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Btn, EmptyRow, Icon } from '@/components/Icon';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { parseBoolean } from '@/lib/api';
import FRMcp_usersetting, { type UserForm } from './FRMcp_usersetting';
import * as proxy from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type UserRow = {
  USERID?: number;
  USERLOGIN: string;
  USERNAME?: string;
  USERGROUP?: string;
  USEREMAIL?: string;
  USERACTIVE?: string;
  USERDEPT?: string;
};

// Yang diexpose ke controller (ExtJS: reference ke grid).
export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (u: UserRow) => void;
  remove: (u: UserRow) => void;
};

const toForm = (u: UserRow): UserForm => ({
  USERID: u.USERID,
  USERLOGIN: u.USERLOGIN,
  USERNAME: u.USERNAME || '',
  USEREMAIL: u.USEREMAIL || '',
  USERGROUP: u.USERGROUP || '',
  USERACTIVE: u.USERACTIVE || 'YES',
});

const GRIDcp_usersetting = forwardRef<GridApi>(function GRIDcp_usersetting(_props, ref) {
  const { open } = useModal();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (opts?: { page?: number; q?: string }) => {
    const p = Math.max(0, opts?.page ?? page);
    const q = opts?.q ?? search;
    setLoading(true);
    try {
      const res: any = await proxy.read_data({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q });
      if (parseBoolean(res?.success)) {
        setUsers(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else toast('Error', res.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  // Dipanggil controller btrefresh_click: reset pilihan + filter lalu reload.
  const refresh = useCallback(() => {
    setFilter('');
    setSearch('');
    load({ page: 0, q: '' });
  }, [load]);

  const doSearch = useCallback(() => {
    setSearch(filter);
    load({ page: 0, q: filter });
  }, [filter, load]);

  // Dipanggil controller btnew_click: buka form create.
  const create = useCallback(() => {
    open(<FRMcp_usersetting isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  const edit = useCallback((u: UserRow) => {
    open(<FRMcp_usersetting isNew={false} initial={toForm(u)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const remove = useCallback(async (u: UserRow) => {
    if (!window.confirm(`Hapus User Login: ${u.USERLOGIN}?`)) return;
    const res: any = await proxy.process_delete(u);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  useImperativeHandle(ref, () => ({ refresh, create, edit, remove }), [refresh, create, edit, remove]);

  // Load awal: grid autoLoad sendiri seperti ExtJS grid yang di-declare di view.
  useEffect(() => {
    load({ page: 0, q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRow = page * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid-box">
      {/* tbar ala ExtJS: filter + pencarian milik grid, bukan mainpage */}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <span className="field-with-icon">
          <Icon name="search" size={15} />
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Cari user (login/nama/group/email)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
          />
        </span>
        <Btn icon="search" onClick={doSearch}>Cari</Btn>
        {loading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Memuat…</span>}
      </div>

      <table className="grid" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th style={{ width: 44 }}>#</th>
            <th style={{ width: 44 }} />
            <th style={{ width: 44 }} />
            <th>User Login</th>
            <th>User Name</th>
            <th>Group</th>
            <th>Email</th>
            <th>Aktif</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.USERID ?? u.USERLOGIN}>
              <td style={{ textAlign: 'right', color: '#64748b' }}>{startRow + i + 1}</td>
              <td><Btn className="danger btn-sm" iconOnly icon="del" title={`Delete ${u.USERLOGIN}`} aria-label={`Delete ${u.USERLOGIN}`} onClick={() => remove(u)} /></td>
              <td><Btn className="btn-sm" iconOnly icon="edit" title={`Edit ${u.USERLOGIN}`} aria-label={`Edit ${u.USERLOGIN}`} onClick={() => edit(u)} /></td>
              <td>{u.USERLOGIN}</td>
              <td>{u.USERNAME}</td>
              <td>{u.USERGROUP}</td>
              <td>{u.USEREMAIL}</td>
              <td>{u.USERACTIVE}</td>
            </tr>
          ))}
          {!users.length && <EmptyRow colSpan={8} loading={loading} />}
        </tbody>
      </table>

      {/* bbar ala ExtJS: paging toolbar milik grid */}
      <div className="toolbar" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ color: '#64748b', fontSize: 13 }}>
          {total === 0 ? '0 data' : `${startRow + 1}–${Math.min(startRow + PAGE_SIZE, total)} dari ${total}`}
        </span>
        <Btn icon="prev" disabled={page <= 0} onClick={() => load({ page: page - 1 })}>Prev</Btn>
        <span style={{ fontSize: 13 }}>{page + 1}/{totalPages}</span>
        <Btn icon="next" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => load({ page: page + 1 })}>Next</Btn>
      </div>
    </div>
  );
});

export default GRIDcp_usersetting;