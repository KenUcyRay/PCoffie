import { forwardRef,useCallback,useEffect,useImperativeHandle,useMemo,useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn,Icon } from '@/components/Icon';
import { DataTable,GridPager,noColumn,actionsColumn,selectColumn,type Column,type Filters,type SortDir } from '@/components/DataTable';
import FRMcp_booking,{type BookingForm} from './FRMcp_booking';
import * as proxy from './api';
import type { SortState } from './api';
const PAGE_SIZE=15;
export type BookingRow={ BOOKINGID?:number; BOOKNO:string; USERLOGIN?:string; PCID?:number; PCNO?:string; PCZONA?:string; PAKETID?:number; PAKETNAMA?:string; TGL_BOOKING?:string; JAM_MULAI?:string; JAM_SELESAI?:string; DURASI_MENIT?:number; TOTAL?:number; PAYMETHOD?:string; PAYSTATUS?:string; STATUS?:string; NOTE?:string };
export type GridApi={ refresh:()=>void; create:()=>void; edit:(r:BookingRow)=>void; remove:(r:BookingRow)=>void };
const toForm=(r:BookingRow):BookingForm=>({ BOOKINGID:r.BOOKINGID, BOOKNO:r.BOOKNO, USERLOGIN:r.USERLOGIN||'', PCID:String(r.PCID||''), PAKETID:r.PAKETID?String(r.PAKETID):'', TGL_BOOKING:String(r.TGL_BOOKING||'').slice(0,10), JAM_MULAI:String(r.JAM_MULAI||'').slice(0,5), DURASI_MENIT:String(r.DURASI_MENIT||60), PAYMETHOD:r.PAYMETHOD||'qris', NOTE:r.NOTE||'' });
function buildColumns(h:{onEdit:(r:BookingRow)=>void;onRemove:(r:BookingRow)=>void;onStatus:(r:BookingRow,s:string)=>void}):Column<BookingRow>[]{
  return [noColumn,actionsColumn<BookingRow>((r)=>(<>
    <Btn className="btn-sm" iconOnly icon="edit" onClick={()=>h.onEdit(r)} />
    {r.STATUS==='pending'?<><Btn className="btn-sm primary" iconOnly icon="check" title="Approve" onClick={()=>h.onStatus(r,'approved')} /><Btn className="btn-sm danger" iconOnly icon="close" title="Cancel" onClick={()=>h.onStatus(r,'cancel')} /></>:null}
    {r.STATUS==='approved'?<><Btn className="btn-sm" iconOnly icon="check" title="Running" onClick={()=>h.onStatus(r,'running')} /><Btn className="btn-sm danger" iconOnly icon="close" onClick={()=>h.onStatus(r,'cancel')} /></>:null}
    {r.STATUS==='running'?<Btn className="btn-sm primary" iconOnly icon="check" title="Done" onClick={()=>h.onStatus(r,'done')} />:null}
    <Btn className="danger btn-sm" iconOnly icon="del" onClick={()=>h.onRemove(r)} />
  </>),280),
  {key:'BOOKNO',label:'Booking',width:120,sortable:true},
  {key:'USERLOGIN',label:'User',width:110,sortable:true},
  {key:'PCNO',label:'PC',width:80,sortable:true},
  {key:'TGL_BOOKING',label:'Tgl',width:100,sortable:true},
  {key:'JAM_MULAI',label:'Jam',width:100,sortable:true},
  {key:'DURASI_MENIT',label:'Menit',width:70,align:'right',sortable:true},
  {key:'TOTAL',label:'Total',width:110,align:'right',sortable:true},
  selectColumn<BookingRow>('STATUS','Status',['pending','approved','running','done','cancel']),
  selectColumn<BookingRow>('PAYMETHOD','Pay',['qris','transfer','cash']),
  ];
}
const GRIDcp_booking=forwardRef<GridApi>(function GRIDcp_booking(_props,ref){
  const {open}=useModal(); const {layoutMode}=useAuth();
  const [rows,setRows]=useState<BookingRow[]>([]); const [filters,setFilters]=useState<Filters>({}); const [sort,setSort]=useState<SortState>(null);
  const [page,setPage]=useState(0); const [total,setTotal]=useState(0); const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  const load=useCallback(async(opts?:{page?:number;filters?:Filters;sort?:SortState})=>{
    const p=Math.max(0,opts?.page??page); const f=opts?.filters??filters; const s=opts?.sort!==undefined?opts.sort:sort;
    setLoading(true); setErr('');
    try{ const res:any=await proxy.read_data({limit:PAGE_SIZE,offset:p*PAGE_SIZE,q:'',filters:f,sort:s??undefined}); if(parseBoolean(res?.success)){ setRows(res.Rows||[]); setTotal(Number(res.TotalRows)||0); setPage(p); setSort(s);}else setErr(res?.message||'Gagal.'); }catch(e:any){ setErr(e.message||'Gagal.'); }finally{ setLoading(false); }
  },[page,filters,sort]);
  const refresh=useCallback(()=>{ setFilters({}); load({page:0,filters:{},sort:null}); },[load]);
  const onFilter=useCallback((next:Filters)=>{ setFilters(next); load({page:0,filters:next}); },[load]);
  const onSort=useCallback((next:SortState)=>{ load({page:0,sort:next}); },[load]);
  const openRow=useCallback((r:BookingRow)=>{ open(<FRMcp_booking isNew={false} initial={toForm(r)} onSaved={()=>load({page})} />); },[load,open,page]);
  const removeRow=useCallback(async(r:BookingRow)=>{ if(!await confirmDialog({message:`Hapus ${r.BOOKNO}?`,okText:'Ya, Hapus',danger:true})) return; const res:any=await proxy.process_delete(r); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); load({page}); }else toast('Error',res?.message,'err'); },[load,page]);
  const changeStatus=useCallback(async(r:BookingRow,to:string)=>{ if(!await confirmDialog({message:`${r.BOOKNO}: ${r.STATUS} -> ${to}?`})) return; const res:any=await proxy.change_status({BOOKINGID:r.BOOKINGID,STATUS:to}); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); load({page}); }else toast('Error',res?.message,'err'); },[load,page]);
  const create=useCallback(()=>{ open(<FRMcp_booking isNew onSaved={()=>load({page:0})} />); },[load,open]);
  const rowMenu=useCallback((r:BookingRow,e:React.MouseEvent)=>{ e.preventDefault(); openContextMenu({x:e.clientX,y:e.clientY,items:[{label:`Ubah ${r.BOOKNO}`,icon:'edit',onClick:()=>openRow(r)},{label:`Hapus ${r.BOOKNO}`,icon:'del',danger:true,onClick:()=>removeRow(r)}]}); },[openRow,removeRow]);
  const columns=useMemo(()=>buildColumns({onEdit:openRow,onRemove:removeRow,onStatus:changeStatus}),[openRow,removeRow,changeStatus]);
  useImperativeHandle(ref,()=>({refresh,create,edit:openRow,remove:removeRow}),[refresh,create,openRow,removeRow]);
  useEffect(()=>{ load({page:0,filters:{},sort:null}); },[]);
  const sortDir:SortDir=sort?{key:sort.key,dir:sort.dir}:null;
  return (<div className="grid-box">
    {err&&<div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{err}</span><Btn className="btn-sm" icon="refresh" onClick={()=>load({page:0})}>Coba lagi</Btn></div>}
    <DataTable<BookingRow> columns={columns} rows={rows} filters={filters} onFilter={onFilter} sort={sortDir} onSort={onSort} startRow={page*PAGE_SIZE} loading={loading} rowKey={(r)=>String(r.BOOKINGID ?? r.BOOKNO)} onRowContextMenu={layoutMode==='mode_desktop'?rowMenu:undefined} />
    <GridPager total={total} page={page} pageSize={PAGE_SIZE} onPage={(p)=>load({page:p})} />
  </div>);
});
export default GRIDcp_booking;
