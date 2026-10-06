import { forwardRef,useCallback,useEffect,useImperativeHandle,useMemo,useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn,Icon } from '@/components/Icon';
import { DataTable,GridPager,noColumn,actionsColumn,selectColumn,type Column,type Filters,type SortDir } from '@/components/DataTable';
import FRMcp_pc,{type PcForm} from './FRMcp_pc';
import * as proxy from './api';
import type { SortState } from './api';
const PAGE_SIZE=25;
export type PcRow={ PCID?:number; PCNO:string; ZONA?:string; SPEK?:string; HARGA_PERJAM?:number; STATUS?:string; ISAKTIF?:string; SORTNO?:number };
export type GridApi={ refresh:()=>void; create:()=>void; edit:(r:PcRow)=>void; remove:(r:PcRow)=>void };
const toForm=(r:PcRow):PcForm=>({ PCID:r.PCID, PCNO:r.PCNO, ZONA:r.ZONA||'REGULER', SPEK:r.SPEK||'', HARGA_PERJAM:String(r.HARGA_PERJAM??'0'), STATUS:r.STATUS||'ready', ISAKTIF:r.ISAKTIF||'YES', SORTNO:String(r.SORTNO??'0') });
function buildColumns(h:{onEdit:(r:PcRow)=>void;onRemove:(r:PcRow)=>void;onToggle:(r:PcRow)=>void}):Column<PcRow>[]{
  return [noColumn,actionsColumn<PcRow>((r)=>(<><Btn className="danger btn-sm" iconOnly icon="del" onClick={()=>h.onRemove(r)} /><Btn className="btn-sm" iconOnly icon="edit" onClick={()=>h.onEdit(r)} /><Btn className="btn-sm" iconOnly icon={r.ISAKTIF==='YES'?'close':'check'} onClick={()=>h.onToggle(r)} /></>),120),{key:'PCNO',label:'PC',width:100,sortable:true},selectColumn<PcRow>('ZONA','Zona',['REGULER','VIP','VVIP']),{key:'SPEK',label:'Spek',width:220},{key:'HARGA_PERJAM',label:'Rp/Jam',width:110,align:'right',sortable:true},selectColumn<PcRow>('STATUS','Status',['ready','busy','maint']),selectColumn<PcRow>('ISAKTIF','Aktif',['YES','NO'])];
}
const GRIDcp_pc=forwardRef<GridApi>(function GRIDcp_pc(_props,ref){
  const {open}=useModal(); const {layoutMode}=useAuth();
  const [rows,setRows]=useState<PcRow[]>([]); const [filters,setFilters]=useState<Filters>({}); const [sort,setSort]=useState<SortState>(null);
  const [page,setPage]=useState(0); const [total,setTotal]=useState(0); const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  const load=useCallback(async(opts?:{page?:number;filters?:Filters;sort?:SortState})=>{
    const p=Math.max(0,opts?.page??page); const f=opts?.filters??filters; const s=opts?.sort!==undefined?opts.sort:sort;
    setLoading(true); setErr('');
    try{ const res:any=await proxy.read_data({limit:PAGE_SIZE,offset:p*PAGE_SIZE,q:'',filters:f,sort:s??undefined}); if(parseBoolean(res?.success)){ setRows(res.Rows||[]); setTotal(Number(res.TotalRows)||0); setPage(p); setSort(s);}else setErr(res?.message||'Gagal.'); }catch(e:any){ setErr(e.message||'Gagal.'); }finally{ setLoading(false); }
  },[page,filters,sort]);
  const refresh=useCallback(()=>{ setFilters({}); load({page:0,filters:{},sort:null}); },[load]);
  const onFilter=useCallback((next:Filters)=>{ setFilters(next); load({page:0,filters:next}); },[load]);
  const onSort=useCallback((next:SortState)=>{ load({page:0,sort:next}); },[load]);
  const openRow=useCallback((r:PcRow)=>{ open(<FRMcp_pc isNew={false} initial={toForm(r)} onSaved={()=>load({page})} />); },[load,open,page]);
  const toggleStatus=useCallback(async(r:PcRow)=>{ const a=r.ISAKTIF==='YES'; if(!await confirmDialog({message:`${a?'Nonaktifkan':'Aktifkan'} PC ${r.PCNO}?`})) return; const res:any=await proxy.change_status({PCID:r.PCID,ISAKTIF:a?'NO':'YES'}); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); load({page}); }else toast('Error',res?.message,'err'); },[load,page]);
  const removeRow=useCallback(async(r:PcRow)=>{ if(!await confirmDialog({message:`Hapus PC ${r.PCNO}?`,okText:'Ya, Hapus',danger:true})) return; const res:any=await proxy.process_delete(r); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); load({page}); }else toast('Error',res?.message,'err'); },[load,page]);
  const create=useCallback(()=>{ open(<FRMcp_pc isNew onSaved={()=>load({page:0})} />); },[load,open]);
  const rowMenu=useCallback((r:PcRow,e:React.MouseEvent)=>{ e.preventDefault(); openContextMenu({x:e.clientX,y:e.clientY,items:[{label:`Ubah ${r.PCNO}`,icon:'edit',onClick:()=>openRow(r)},{label:`${r.ISAKTIF==='YES'?'Nonaktifkan':'Aktifkan'} ${r.PCNO}`,icon:'check',onClick:()=>toggleStatus(r)},{label:`Hapus ${r.PCNO}`,icon:'del',danger:true,onClick:()=>removeRow(r)}]}); },[openRow,toggleStatus,removeRow]);
  const columns=useMemo(()=>buildColumns({onEdit:openRow,onRemove:removeRow,onToggle:toggleStatus}),[openRow,removeRow,toggleStatus]);
  useImperativeHandle(ref,()=>({refresh,create,edit:openRow,remove:removeRow}),[refresh,create,openRow,removeRow]);
  useEffect(()=>{ load({page:0,filters:{},sort:null}); },[]);
  const sortDir:SortDir=sort?{key:sort.key,dir:sort.dir}:null;
  return (<div className="grid-box">
    {err&&<div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{err}</span><Btn className="btn-sm" icon="refresh" onClick={()=>load({page:0})}>Coba lagi</Btn></div>}
    <DataTable<PcRow> columns={columns} rows={rows} filters={filters} onFilter={onFilter} sort={sortDir} onSort={onSort} startRow={page*PAGE_SIZE} loading={loading} rowKey={(r)=>String(r.PCID ?? r.PCNO)} onRowContextMenu={layoutMode==='mode_desktop'?rowMenu:undefined} />
    <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p)=>load({page:p})} />
  </div>);
});
export default GRIDcp_pc;
