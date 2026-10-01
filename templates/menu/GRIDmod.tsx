// TEMPLATE GRID — padanan GRID<mod>.js langit_v2, sekaligus "store + proxy"-nya.
//
// Cara pakai: rename GRIDmod.tsx -> GRID<mcontrol>.tsx, lalu ubah HANYA bagian
// buildColumns() (label/key/filter) dan nama baris di api.ts.
//
// Gaya seragam dengan semua menu (jangan menulis ulang):
//   - Toolbar TIDAK ada di sini; tombolnya milik mainpage (dockedItems).
//   - Tidak ada kotak pencarian global / tombol "Cari".
//   - Header + baris filter per kolom + isi tabel: components/DataTable.tsx
//   - Baris paging: GridPager dari file yang sama
//   - State: filters, page, total, loading
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { parseBoolean } from '@/lib/api';
import { Btn } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn,
  type Column, type Filters,
} from '@/components/DataTable';
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

// Definisi kolom — GANTI SESUAI TABEL ANDA.
function buildColumns(h: { onEdit: (r: Row) => void; onRemove: (r: Row) => void }): Column<Row>[] {
  return [
    noColumn,
    actionsColumn<Row>((r) => (
      <>
        <Btn
          className="danger btn-sm" iconOnly icon="del"
          title={`Delete ${r.KODE}`} aria-label={`Delete ${r.KODE}`}
          onClick={() => h.onRemove(r)}
        />
        <Btn
          className="btn-sm" iconOnly icon="edit"
          title={`Edit ${r.KODE}`} aria-label={`Edit ${r.KODE}`}
          onClick={() => h.onEdit(r)}
        />
      </>
    )),
    { key: 'KODE', label: 'Kode', width: 140 },
    { key: 'NAMA', label: 'Nama', width: 240 },
  ];
}

const GRIDmod = forwardRef<GridApi>(function GRIDmod(_props, ref) {
  const { open } = useModal();
  const [rows, setRows] = useState<Row[]>([]);
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
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else toast('Error', res.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // Dipanggil controller btrefresh_click.
  const refresh = useCallback(() => {
    setFilters({});
    load({ page: 0, filters: {} });
  }, [load]);

  // Filter kolom: jalan otomatis 300ms, reset ke halaman 1.
  const onFilter = useCallback((next: Filters) => {
    setFilters(next);
    load({ page: 0, filters: next });
  }, [load]);

  // Dipanggil controller btnew_click.
  const create = useCallback(() => {
    open(<FRMmod isNew onSaved={() => load({ page: 0 })} />);
  }, [load, open]);

  const editRow = useCallback((r: Row) => {
    open(<FRMmod isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [load, open, page]);

  const removeRow = useCallback(async (r: Row) => {
    if (!window.confirm(`Hapus data: ${r.KODE}?`)) return;
    const res: any = await proxy.process_delete(r);
    if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
    else toast('Error', res?.message, 'err');
  }, [load, page]);

  const columns = useMemo(() => buildColumns({ onEdit: editRow, onRemove: removeRow }), [editRow, removeRow]);

  useImperativeHandle(
    ref,
    () => ({ refresh, create, edit: editRow, remove: removeRow }),
    [refresh, create, editRow, removeRow],
  );

  useEffect(() => {
    load({ page: 0, filters: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid-box">
      <DataTable<Row>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => r.KODE}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmod;