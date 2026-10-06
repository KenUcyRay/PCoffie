import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import { DataTable, GridPager, noColumn, actionsColumn, selectColumn, type Column, type Filters, type SortDir } from '@/components/DataTable';
import FRMcp_paket, { type PaketForm } from './FRMcp_paket';
import * as proxy from './api';
import type { SortState } from './api';
const PAGE_SIZE = 25;
export type PaketRow = { PAKETID?: number; KODE: string; NAMA?: string; ZONA?: string; DURASI_MENIT?: number; HARGA?: number; DESKRIPSI?: string; ISAKTIF?: string; SORTNO?: number };
export type GridApi = { refresh: () => void; create: () => void; edit: (r: PaketRow) => void; remove: (r: PaketRow) => void };
const toForm = (r: PaketRow): PaketForm => ({ PAKETID: r.PAKETID, KODE: r.KODE, NAMA: r.NAMA || '', ZONA: r.ZONA || 'REGULER', DURASI_MENIT: String(r.DURASI_MENIT ?? '60'), HARGA: String(r.HARGA ?? '0'), DESKRIPSI: r.DESKRIPSI || '', ISAKTIF: r.ISAKTIF || 'YES', SORTNO: String(r.SORTNO ?? '0') });
function buildColumns(h: { onEdit: (r: PaketRow) => void; onRemove: (r: PaketRow) => void; onToggle: (r: PaketRow) => void }): Column<PaketRow>[] {
  return [
    noColumn,
    actionsColumn<PaketRow>((r) => (<>
      <Btn className="danger btn-sm" iconOnly icon="del" onClick={() => h.onRemove(r)} />
      <Btn className="btn-sm" iconOnly icon="edit" onClick={() => h.onEdit(r)} />
      <Btn className="btn-sm" iconOnly icon={r.ISAKTIF==='YES'?'close':'check'} onClick={() => h.onToggle(r)} />
    </>), 120),
    { key: 'KODE', label: 'Kode', width: 110, sortable: true },
    { key: 'NAMA', label: 'Nama', width: 200, sortable: true },
    selectColumn<PaketRow>('ZONA', 'Zona', ['REGULER','VIP','VVIP']),
    { key: 'DURASI_MENIT', label: 'Menit', width: 80, align: 'right', sortable: true },
    { key: 'HARGA', label: 'Harga', width: 110, align: 'right', sortable: true },
    selectColumn<PaketRow>('ISAKTIF', 'Aktif', ['YES','NO']),
  ];
}
const GRIDcp_paket = forwardRef<GridApi>(function GRIDcp_paket(_props, ref) {
  const { open } = useModal(); const { layoutMode } = useAuth();
  const [rows, setRows] = useState<PaketRow[]>([]); const [filters, setFilters] = useState<Filters>({}); const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(async (opts?: { page?: number; filters?: Filters; sort?: SortState }) => {
    const p = Math.max(0, opts?.page ?? page); const f = opts?.filters ?? filters; const s = opts?.sort !== undefined ? opts.sort : sort;
    setLoading(true); setErr('');
    try { const res: any = await proxy.read_data({ limit: PAGE_SIZE, offset: p*PAGE_SIZE, q:'', filters: f, sort: s ?? undefined }); if(parseBoolean(res?.success)){ setRows(res.Rows||[]); setTotal(Number(res.TotalRows)||0); setPage(p); setSort(s); }else setErr(res?.message||'Gagal muat.'); } catch(e:any){ setErr(e.message||'Gagal muat.'); } finally{ setLoading(false); }
  },[page,filters,sort]);
  const refresh = useCallback(()=>{ setFilters({}); load({ page:0,filters:{},sort:null }); },[load]);
  const onFilter = useCallback((next:Filters)=>{ setFilters(next); load({ page:0,filters:next }); },[load]);
  const onSort = useCallback((next:SortState)=>{ load({ page:0,sort:next }); },[load]);
  const openRow = useCallback((r:PaketRow)=>{ open(<FRMcp_paket isNew={false} initial={toForm(r)} onSaved={()=>load({page})} />); },[load,open,page]);
  const toggleStatus = useCallback(async(r:PaketRow)=>{ const a=r.ISAKTIF==='YES'; if(!await confirmDialog({ message: `${a?'Nonaktifkan':'Aktifkan'} paket ${r.KODE}?` })) return; const res:any=await proxy.change_status({ PAKETID:r.PAKETID, ISAKTIF: a?'NO':'YES' }); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); load({page}); }else toast('Error',res?.message,'err'); },[load,page]);
  const removeRow = useCallback(async(r:PaketRow)=>{ if(!await confirmDialog({ message:`Hapus paket ${r.KODE}?`, okText:'Ya, Hapus', danger:true })) return; const res:any=await proxy.process_delete(r); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); load({page}); }else toast('Error',res?.message,'err'); },[load,page]);
  const create = useCallback(()=>{ open(<FRMcp_paket isNew onSaved={()=>load({page:0})} />); },[load,open]);
  const rowMenu = useCallback((r:PaketRow,e:React.MouseEvent)=>{ e.preventDefault(); openContextMenu({ x:e.clientX,y:e.clientY,items:[{label:`Ubah ${r.KODE}`,icon:'edit',onClick:()=>openRow(r)},{label:`${r.ISAKTIF==='YES'?'Nonaktifkan':'Aktifkan'} ${r.KODE}`,icon:'check',onClick:()=>toggleStatus(r)},{label:`Hapus ${r.KODE}`,icon:'del',danger:true,onClick:()=>removeRow(r)}]}); },[openRow,toggleStatus,removeRow]);
  const columns = useMemo(()=>buildColumns({ onEdit:openRow,onRemove:removeRow,onToggle:toggleStatus }),[openRow,removeRow,toggleStatus]);
  useImperativeHandle(ref,()=>({ refresh,create,edit:openRow,remove:removeRow }),[refresh,create,openRow,removeRow]);
  useEffect(()=>{ load({page:0,filters:{},sort:null}); },[]);
  const sortDir: SortDir = sort ? {key:sort.key,dir:sort.dir}:null;
  return (<div className="grid-box">
    {err && <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{err}</span><Btn className="btn-sm" icon="refresh" onClick={()=>load({page:0})}>Coba lagi</Btn></div>}
    <DataTable<PaketRow> columns={columns} rows={rows} filters={filters} onFilter={onFilter} sort={sortDir} onSort={onSort} startRow={page*PAGE_SIZE} loading={loading} rowKey={(r)=>String(r.PAKETID ?? r.KODE)} onRowContextMenu={layoutMode==='mode_desktop'?rowMenu:undefined} />
    <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p)=>load({page:p})} />
  </div>);
});
export default GRIDcp_paket;
