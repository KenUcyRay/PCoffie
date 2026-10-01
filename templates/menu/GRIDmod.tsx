// TEMPLATE GRID — padanan GRID<mod>.js langit_v2, sekaligus "store + proxy"-nya.
//
// Cara pakai: rename GRIDmod.tsx -> GRID<mcontrol>.tsx, sesuaikan type Row
// dengan kolom tabel, kolom <th>/<td>, dan nama endpoint di ./api.
//
// Semua logic ada DI FILE INI: state, paging, pencarian (tbar), paging toolbar
// (bbar), dan action column. Mainpage TIDAK menyimpan state — dia cuma pegang
// ref ke grid ini lalu meneruskannya ke controller.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Btn, EmptyRow, Icon } from '@/components/Icon';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { parseBoolean } from '@/lib/api';
import FRMmod, { type Form } from './FRMmod';
import * as proxy from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type Row = {
  KODE: string;
  NAMA?: string;
  [k: string]: any;
};

// Yang diexpose ke controller (ExtJS: reference ke grid).
export type GridApi = {
  refresh: () => void;
  create: () => void;
  edit: (r: Row) => void;
  remove: (r: Row) => void;
};

const toForm = (r: Row): Form => ({
  KODE: r.KODE,
  NAMA: r.NAMA || '',
});

const GRIDmod = forwardRef<GridApi>(function GRIDmod(_props, ref) {
  const { open } = useModal();
  const [rows, setRows] = useState<Row[]>([]);
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
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else toast('Error', res.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  // Dipanggil controller btrefresh_click: reset filter lalu reload.
  const refresh = useCallback(() => {
    setFilter('');
    setSearch('');
    load({ page: 0, q: '' });
  }, [load]);

  const doSearch = useCallback(() => {
    setSearch(filter);
    load({ page: 0, q: filter });
  }, [filter, load]);

  // Dipanggil controller btnew_click.
  const create = useCallback(() => {
    open(<FRMmod isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  const edit = useCallback((r: Row) => {
    open(<FRMmod isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const remove = useCallback(async (r: Row) => {
    if (!window.confirm(`Hapus data: ${r.KODE}?`)) return;
    const res: any = await proxy.process_delete(r);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  useImperativeHandle(ref, () => ({ refresh, create, edit, remove }), [refresh, create, edit, remove]);

  useEffect(() => {
    load({ page: 0, q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRow = page * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid-box">
      {/* tbar ala ExtJS */}
      <div className="toolbar">
        <span className="field-with-icon">
          <Icon name="search" size={15} />
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Cari data"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
          />
        </span>
        <Btn icon="search" onClick={doSearch}>Cari</Btn>
        {loading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Memuat…</span>}
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th style={{ width: 44 }} />
              <th style={{ width: 44 }} />
              <th>Kode</th>
              <th>Nama</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.KODE}>
                <td className="grid-num">{startRow + i + 1}</td>
                <td><Btn className="danger btn-sm" iconOnly icon="del" title={`Delete ${r.KODE}`} aria-label={`Delete ${r.KODE}`} onClick={() => remove(r)} /></td>
                <td><Btn className="btn-sm" iconOnly icon="edit" title={`Edit ${r.KODE}`} aria-label={`Edit ${r.KODE}`} onClick={() => edit(r)} /></td>
                <td>{r.KODE}</td>
                <td>{r.NAMA}</td>
              </tr>
            ))}
            {!rows.length && <EmptyRow colSpan={5} loading={loading} />}
          </tbody>
        </table>
      </div>

      {/* bbar ala ExtJS: paging toolbar */}
      <div className="toolbar bbar">
        <span className="count">
          {total === 0 ? '0 data' : `${startRow + 1}–${Math.min(startRow + PAGE_SIZE, total)} dari ${total}`}
        </span>
        <Btn icon="prev" disabled={page <= 0} onClick={() => load({ page: page - 1 })}>Prev</Btn>
        <span className="pageinfo">{page + 1}/{totalPages}</span>
        <Btn icon="next" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => load({ page: page + 1 })}>Next</Btn>
      </div>
    </div>
  );
});

export default GRIDmod;