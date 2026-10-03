// GRIDmseller — tab Penjual: tabel + tambah/ubah/status/hapus.
// Pakai komponen reusable components/DataTable.tsx.
//
// State: rows, filters, page, total, loading, err
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import {
  DataTable, GridPager, noColumn, actionsColumn, selectColumn,
  type Column, type Filters,
} from '@/components/DataTable';
import FRMmseller, { type SellerForm } from './FRMmseller';
import * as proxy from './api';

// pageSize mengikuti store baku langit_v2 (25).
const PAGE_SIZE = 25;

export type SellerRow = {
  SELLERID?: number;
  SELLERCODE: string;
  SHOPNAME?: string;
  OWNERNAME?: string;
  PHONE?: string;
  EMAIL?: string;
  ADDRESS?: string;
  ISACTIVE?: string;
  PRODCOUNT?: number | string;
};

export type GridApi = {
  refresh: () => void;
  create: () => void;
};

const toForm = (r: SellerRow): SellerForm => ({
  SELLERID: r.SELLERID,
  SHOPNAME: r.SHOPNAME || '',
  OWNERNAME: r.OWNERNAME || '',
  PHONE: String(r.PHONE || ''),
  EMAIL: String(r.EMAIL || ''),
  ADDRESS: String(r.ADDRESS || ''),
});

function buildColumns(h: { onEdit: (r: SellerRow) => void; onRemove: (r: SellerRow) => void; onToggle: (r: SellerRow) => void }): Column<SellerRow>[] {
  return [
    noColumn,
    actionsColumn<SellerRow>((r) => (
      <>
        <Btn className="danger btn-sm" iconOnly icon="del"
          title={`Hapus ${r.SELLERCODE}`} aria-label={`Hapus ${r.SELLERCODE}`} onClick={() => h.onRemove(r)} />
        <Btn className="btn-sm" iconOnly icon="edit"
          title={`Ubah ${r.SELLERCODE}`} aria-label={`Ubah ${r.SELLERCODE}`} onClick={() => h.onEdit(r)} />
        <Btn className="btn-sm" iconOnly icon={String(r.ISACTIVE || '').toUpperCase() === 'YES' ? 'close' : 'check'}
          title={String(r.ISACTIVE || '').toUpperCase() === 'YES' ? `Nonaktifkan ${r.SELLERCODE}` : `Aktifkan ${r.SELLERCODE}`}
          aria-label={String(r.ISACTIVE || '').toUpperCase() === 'YES' ? `Nonaktifkan ${r.SELLERCODE}` : `Aktifkan ${r.SELLERCODE}`}
          onClick={() => h.onToggle(r)} />
      </>
    ), 120),
    { key: 'SELLERCODE', label: 'Kode', width: 100 },
    { key: 'SHOPNAME', label: 'Nama Toko', width: 180 },
    { key: 'OWNERNAME', label: 'Pemilik', width: 140 },
    { key: 'PHONE', label: 'Telepon', width: 120 },
    { key: 'PRODCOUNT', label: 'Produk', width: 70, align: 'right', filter: false },
    selectColumn<SellerRow>('ISACTIVE', 'Status', ['YES', 'NO']),
  ];
}

const GRIDmseller = forwardRef<GridApi>(function GRIDmseller(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (opts?: { page?: number; filters?: Filters }) => {
    const p = Math.max(0, opts?.page ?? page);
    const f = opts?.filters ?? filters;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_sellers({ limit: PAGE_SIZE, offset: p * PAGE_SIZE, q: '', filters: f });
      if (parseBoolean(res?.success)) {
        setRows(res.Rows || []);
        setTotal(Number(res.TotalRows) || 0);
        setPage(p);
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
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

  const openSeller = useCallback((r: SellerRow) => {
    open(<FRMmseller isNew={false} initial={toForm(r)} onSaved={() => load({ page })} />);
  }, [open, load, page]);

  const toggleStatus = useCallback(async (r: SellerRow) => {
    const active = String(r.ISACTIVE || '').toUpperCase() === 'YES';
    if (!await confirmDialog({ message: `${active ? 'Nonaktifkan' : 'Aktifkan'} penjual ${r.SHOPNAME}?${active ? ' Produknya ikut nonaktif.' : ''}` })) return;
    try {
      const res: any = await proxy.change_seller_status({ SELLERID: r.SELLERID, ISACTIVE: active ? 'NO' : 'YES' });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, page]);

  const removeSeller = useCallback(async (r: SellerRow) => {
    if (!await confirmDialog({ message: `Hapus penjual ${r.SHOPNAME}?`, okText: 'Ya, Hapus', danger: true })) return;
    try {
      const res: any = await proxy.process_seller_delete({ SELLERID: r.SELLERID });
      if (parseBoolean(res?.success)) { toast('Success', res.message, 'ok'); load({ page }); }
      else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, page]);

  const create = useCallback(() => {
    open(<FRMmseller isNew onSaved={() => load({ page: 0 })} />);
  }, [open, load]);

  // Klik-kanan baris (hanya mode desktop; standard tidak berubah).
  const rowMenu = useCallback((r: SellerRow, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${r.SHOPNAME}`, icon: 'edit', onClick: () => openSeller(r) },
        { label: `Hapus ${r.SHOPNAME}`, icon: 'del', danger: true, onClick: () => removeSeller(r) },
      ],
    });
  }, [openSeller, removeSeller]);

  const columns = useMemo(() => buildColumns({ onEdit: openSeller, onRemove: removeSeller, onToggle: toggleStatus }), [openSeller, removeSeller, toggleStatus]);

  useImperativeHandle(ref, () => ({ refresh, create }), [refresh, create]);

  useEffect(() => {
    load({ page: 0, filters: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid-box">
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({ page: 0 })}>Coba lagi</Btn>
        </div>
      )}
      <DataTable<SellerRow>
        columns={columns}
        rows={rows}
        filters={filters}
        onFilter={onFilter}
        startRow={page * PAGE_SIZE}
        loading={loading}
        rowKey={(r) => String(r.SELLERID ?? '')}
        onRowContextMenu={layoutMode === 'mode_desktop' ? rowMenu : undefined}
      />
      <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p) => load({ page: p })} />
    </div>
  );
});

export default GRIDmseller;
