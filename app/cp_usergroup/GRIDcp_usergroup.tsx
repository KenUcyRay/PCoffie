// GRIDcp_usergroup — padanan GRIDcp_usergroup.js langit_v2 (grid group di panel
// kiri) + "store + proxy"-nya. Pakai komponen reusable components/DataTable.tsx.
//
// State: filters, page, total, loading  |  Kolom: buildColumns(handlers)
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters,
} from '@/components/DataTable';
import * as proxy from './api';
import type { AksesApi } from './FRMcp_usergroup';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type GroupRow = { DEFID?: string | number; DEFMODULE?: string; DEFCODE: string; DEFNAME?: string };

export type GridApi = {
  refresh: () => void;
  create: () => void;
  remove: (g: GroupRow) => void;
};

type Props = {
  /** Reference ke panel hak akses; dipakai saat baris group diklik. */
  aksesRef?: React.RefObject<AksesApi>;
};

function buildColumns(h: { onSelect: (g: GroupRow) => void; onRemove: (g: GroupRow) => void }): Column<GroupRow>[] {
  return [
    noColumn,
    actionsColumn<GroupRow>((g) => (
      <Btn
        className="danger btn-sm" iconOnly icon="del"
        title={`Hapus group ${g.DEFCODE}`} aria-label={`Hapus group ${g.DEFCODE}`}
        onClick={() => h.onRemove(g)}
      />
    )),
    {
      key: 'DEFCODE',
      label: 'Group',
      width: 160,
      render: (g) => (
        <a href="#" onClick={(e) => { e.preventDefault(); h.onSelect(g); }}>{g.DEFCODE}</a>
      ),
    },
  ];
}

const GRIDcp_usergroup = forwardRef<GridApi, Props>(function GRIDcp_usergroup(
  { aksesRef }: Props,
  ref,
) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selected, setSelected] = useState<GroupRow | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { layoutMode } = useAuth();

  const load = useCallback(async (opts?: { page?: number; filters?: Filters }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    setLoading(true);
    try {
      const res: any = await proxy.read_data({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f });
      if (parseBoolean(res?.success)) {
        setGroups(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    aksesRef?.current?.clear();
  }, [aksesRef]);

  // Dipanggil controller btrefresh_click.
  const refresh = useCallback(() => {
    setFilters({});
    clearSelection();
    load({ page: 0, filters: {} });
  }, [load, clearSelection]);

  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  // Baris diklik -> teruskan ke panel hak akses (ExtJS: select handler).
  const select = useCallback((g: GroupRow) => {
    setSelected(g);
    aksesRef?.current?.load(g);
  }, [aksesRef]);

  // Dipanggil controller btnew_click.
  const create = useCallback(() => {
    const name = window.prompt('Masukkan nama group:');
    if (!name) return;
    const value = name.trim();
    if (!/^[A-Z_-]+$/.test(value)) {
      toast('Error', "Hanya boleh huruf A-Z, '-' dan '_' (tanpa spasi, tanpa huruf kecil).", 'err');
      return;
    }
    (async () => {
      const res: any = await proxy.create_group({ DEFCODE: value, DEFNAME: value });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
      else toast('Error', res?.message, 'err');
    })();
  }, [load, page]);

  const removeUser = useCallback(async (g: GroupRow) => {
    if (!await confirmDialog({ message: `Hapus User Group: ${g.DEFCODE}?`, okText: 'Ya, Hapus', danger: true })) return;
    const res: any = await proxy.delete_akses_group(g);
    if (parseBoolean(res?.success)) {
      toast('Success', res.message, 'ok');
      if (selected?.DEFCODE === g.DEFCODE) clearSelection();
      load({ page });
    } else toast('Error', res?.message, 'err');
  }, [load, page, selected, clearSelection]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((g: GroupRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Buka akses ${g.DEFCODE}`, icon: 'chevR', onClick: () => select(g) },
        { label: `Hapus ${g.DEFCODE}`, icon: 'del', danger: true, onClick: () => removeUser(g) },
      ],
    });
  }, [select, removeUser]);

  const columns = useMemo(() => buildColumns({ onSelect: select, onRemove: removeUser }), [select, removeUser]);

  useImperativeHandle(ref, () => ({ refresh, create, remove: removeUser }), [refresh, create, removeUser]);

  useEffect(() => {
    load({ page: 0, filters: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid-box">
      <DataTable<GroupRow>
        columns={columns}
        rows={groups}
        filters={filters}
        onFilter={onFilter}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(g) => g.DEFCODE}
        isActive={(g) => selected?.DEFCODE === g.DEFCODE}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDcp_usergroup;