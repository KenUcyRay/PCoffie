// GRIDcp_userlogin — padanan GRIDcp_userlogin.js langit_v2, sekaligus
// "store + proxy"-nya. Pakai komponen reusable components/DataTable.tsx.
//
// State: filters, page, total, loading  |  Kolom: buildColumns(handlers)
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { parseBoolean } from '@/lib/api';
import { Btn } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn, selectColumn,
  type Column, type Filters,
} from '@/components/DataTable';
import FRMcp_userlogin, { type UserLoginForm } from './FRMcp_userlogin';
import * as proxy from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type UserLoginRow = {
  USERID?: number;
  USERLOGIN: string;
  USERNAME?: string;
  USERGROUP?: string;
  USEREMAIL?: string;
  USERACTIVE?: string;
  USERGROUPNAME?: string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (u: UserLoginRow) => void;
  remove: (u: UserLoginRow) => void;
};

const toForm = (u: UserLoginRow): UserLoginForm => ({
  USERID: u.USERID,
  USERLOGIN: u.USERLOGIN,
  USERNAME: u.USERNAME || '',
  USEREMAIL: u.USEREMAIL || '',
  USERGROUP: u.USERGROUP || '',
  USERACTIVE: u.USERACTIVE || 'YES',
});

function buildColumns(h: { onEdit: (u: UserLoginRow) => void; onRemove: (u: UserLoginRow) => void }): Column<UserLoginRow>[] {
  return [
    noColumn,
    actionsColumn<UserLoginRow>((u) => (
      <>
        <Btn
          className="danger btn-sm" iconOnly icon="del"
          title={`Delete ${u.USERLOGIN}`} aria-label={`Delete ${u.USERLOGIN}`}
          onClick={() => h.onRemove(u)}
        />
        <Btn
          className="btn-sm" iconOnly icon="edit"
          title={`Edit ${u.USERLOGIN}`} aria-label={`Edit ${u.USERLOGIN}`}
          onClick={() => h.onEdit(u)}
        />
      </>
    )),
    { key: 'USERLOGIN', label: 'User Login', width: 120, render: (u) => <a href="#">{u.USERLOGIN}</a> },
    { key: 'USERNAME', label: 'User Name', width: 160 },
    { key: 'USERGROUPNAME', label: 'Group', width: 110 },
    { key: 'USEREMAIL', label: 'Email', width: 200 },
    selectColumn<UserLoginRow>('USERACTIVE', 'Aktif', ['YES', 'NO']),
  ];
}

const GRIDcp_userlogin = forwardRef<GridApi>(function GRIDcp_userlogin(_props, ref) {
  const { open } = useModal();
  const [users, setUsers] = useState<UserLoginRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (opts?: { page?: number; filters?: Filters }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    setLoading(true);
    try {
      const res: any = await proxy.read_data({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f });
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
  }, [page, filters]);

  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {} });
  }, [load]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  const openUser = useCallback((u: UserLoginRow) => {
    open(<FRMcp_userlogin isNew={false} initial={toForm(u)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const removeUser = useCallback(async (u: UserLoginRow) => {
    if (!window.confirm(`Hapus User Login: ${u.USERLOGIN}?`)) return;
    const res: any = await proxy.process_delete(u);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const create = useCallback(() => {
    open(<FRMcp_userlogin isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  const columns = useMemo(() => buildColumns({ onEdit: openUser, onRemove: removeUser }), [openUser, removeUser]);

  useImperativeHandle(
    ref,
    () => ({ refresh, create, edit: openUser, remove: removeUser }),
    [refresh, create, openUser, removeUser],
  );

  useEffect(() => {
    load({ page: 0, filters: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid-box">
      <DataTable<UserLoginRow>
        columns={columns}
        rows={users}
        filters={filters}
        onFilter={onFilter}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(u) => String(u.USERID ?? u.USERLOGIN)}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_userlogin;