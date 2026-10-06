'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window,FrmRow,FrmSet } from '@/components/Window';
import { process_create,process_update } from './api';
export type PcForm={ PCID?:number; PCNO:string; ZONA:string; SPEK:string; HARGA_PERJAM:string; STATUS:string; ISAKTIF:string; SORTNO:string };
type E={PCNO?:string;HARGA_PERJAM?:string};
export default function FRMcp_pc({isNew,initial,onSaved}:{isNew:boolean;initial?:PcForm;onSaved:()=>void}){
  const {close}=useModal();
  const [form,setForm]=useState<PcForm>(initial||{PCNO:'',ZONA:'REGULER',SPEK:'',HARGA_PERJAM:'0',STATUS:'ready',ISAKTIF:'YES',SORTNO:'0'});
  const [errs,setErrs]=useState<E>({}); const [busy,setBusy]=useState(false);
  const set=(k:keyof PcForm,v:string)=>{ setForm(f=>({...f,[k]:v})); setErrs(e=>({...e,[k]:undefined})); };
  const validate=():boolean=>{ const e:E={}; if(!form.PCNO.trim()) e.PCNO='PCNO wajib.'; if(isNaN(Number(form.HARGA_PERJAM))||Number(form.HARGA_PERJAM)<0) e.HARGA_PERJAM='Harga tidak valid.'; setErrs(e); return !Object.keys(e).length; };
  const save=async()=>{ if(!validate()) return; if(!await confirmDialog({message:'Simpan PC?'})) return; setBusy(true); try{ const res:any=isNew?await process_create(form):await process_update(form); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); onSaved(); close(); }else toast('Error',res?.message,'err'); }catch(e:any){ toast('Error',e.message,'err'); }finally{ setBusy(false); } };
  return (<Window title={isNew?'Tambah PC':'Ubah PC'} icon={isNew?'add':'edit'} width="50%" footer={<><Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Batal</Btn></>}>
    <FrmSet legend="PC / Seat" icon="grid" columns={2}>
      <FrmRow label="PCNO"><div><input className="input" value={form.PCNO} readOnly={!isNew} onChange={e=>set('PCNO',e.target.value)} />{errs.PCNO&&<span className="field-err">{errs.PCNO}</span>}</div></FrmRow>
      <FrmRow label="Zona"><select value={form.ZONA} onChange={e=>set('ZONA',e.target.value)}><option value="REGULER">REGULER</option><option value="VIP">VIP</option><option value="VVIP">VVIP</option></select></FrmRow>
      <FrmRow label="Spek"><input className="input" value={form.SPEK} onChange={e=>set('SPEK',e.target.value)} /></FrmRow>
      <FrmRow label="Rp/Jam"><div><input className="input" type="number" value={form.HARGA_PERJAM} onChange={e=>set('HARGA_PERJAM',e.target.value)} />{errs.HARGA_PERJAM&&<span className="field-err">{errs.HARGA_PERJAM}</span>}</div></FrmRow>
      <FrmRow label="Status"><select value={form.STATUS} onChange={e=>set('STATUS',e.target.value)}><option value="ready">ready</option><option value="busy">busy</option><option value="maint">maint</option></select></FrmRow>
      <FrmRow label="Urut"><input className="input" type="number" value={form.SORTNO} onChange={e=>set('SORTNO',e.target.value)} /></FrmRow>
      <FrmRow label="Aktif"><select value={form.ISAKTIF} onChange={e=>set('ISAKTIF',e.target.value)}><option value="YES">Aktif</option><option value="NO">Nonaktif</option></select></FrmRow>
    </FrmSet>
  </Window>);
}
