// GRIDcp_usergroup — padanan GRIDcp_usergroup.js langit_v2 (grid group di panel
// kiri), sekaligus "store + proxy"-nya: paging, pencarian, dan aksi grid lived
// di sini. Mainpage tidak menyimpan state apa pun; baris yang diklik diteruskan
// ke panel hak akses (FRMcp_usergroup) lewat reference `aksesRef` — persis
// seperti reference: '...' di ExtJS.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Btn, EmptyRow, Icon } from '@/components/Icon';
import { toast } from '@/components/toast';
import { parseBoolean } from '@/lib/api';
import * as proxy from './api';
import type { AksesApi } from './FRMcp_usergroup';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type GroupRow = { DEFID?: string | number; DEFMODULE?: string; DEFCODE: string; DEFNAME?: string };

// Yang diexpose ke controller (ExtJS: reference ke grid).
export type GridApi = {
  refresh: () => void;
  create: () => void;
  remove: (g: GroupRow) => void;
};

type Props = {
  /** Reference ke panel hak akses; dipakai saat baris group diklik. */
  aksesRef?: React.RefObject<AksesApi>;
};

const GRIDcp_usergroup = forwardRef<GridApi, Props>(function GRIDcp_usergroup(
  { aksesRef }: Props,
  ref,
) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selected, setSelected] = useState<GroupRow | null>(null);
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
        setGroups(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    aksesRef?.current?.clear();
  }, [aksesRef]);

  // Dipanggil controller btrefresh_click: reset pilihan + filter lalu reload.
  const refresh = useCallback(() => {
    setFilter('');
    setSearch('');
    clearSelection();
    load({ page: 0, q: '' });
  }, [load, clearSelection, aksesRef]);

  const doSearch = useCallback(() => {
    setSearch(filter);
    load({ page: 0, q: filter });
  }, [filter, load]);

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

  const remove = useCallback(async (g: GroupRow) => {
    if (!window.confirm(`Hapus User Group: ${g.DEFCODE}?`)) return;
    const res: any = await proxy.delete_akses_group(g);
    if (parseBoolean(res?.success)) {
      toast('Success', res.message, 'ok');
      if (selected?.DEFCODE === g.DEFCODE) clearSelection();
      load({ page });
    } else toast('Error', res?.message, 'err');
  }, [load, page, selected, clearSelection]);

  useImperativeHandle(ref, () => ({ refresh, create, remove }), [refresh, create, remove]);

  useEffect(() => {
    load({ page: 0, q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRow = page * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid-box">
      {/* tbar ala ExtJS */}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <span className="field-with-icon">
          <Icon name="search" size={15} />
          <input
            className="input"
            style={{ maxWidth: 200 }}
            placeholder="Cari group"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
          />
        </span>
        <Btn icon="search" onClick={doSearch}>Cari</Btn>
        {loading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Memuat…</span>}
      </div>

      <table className="grid" style={{ marginTop: 10, minWidth: 0 }}>
        <thead><tr><th style={{ width: 40 }}>#</th><th>Group</th><th style={{ width: 70 }} /></tr></thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.DEFCODE} style={selected?.DEFCODE === g.DEFCODE ? { background: '#eff6ff' } : undefined}>
              <td style={{ textAlign: 'right', color: '#64748b' }}>{startRow + i + 1}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); select(g); }}>{g.DEFCODE}</a></td>
              <td>
                <Btn
                  className="danger btn-sm"
                  iconOnly
                  icon="del"
                  title={`Hapus group ${g.DEFCODE}`}
                  aria-label={`Hapus group ${g.DEFCODE}`}
                  onClick={() => remove(g)}
                />
              </td>
            </tr>
          ))}
          {!groups.length && <EmptyRow colSpan={3} loading={loading} />}
        </tbody>
      </table>

      {/* bbar ala ExtJS */}
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

export default GRIDcp_usergroup;