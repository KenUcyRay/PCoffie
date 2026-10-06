'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, read_users } from './api';
import { read_active as readPakets } from '../cp_paket/api';
import { read_active as readPcs } from '../cp_pc/api';
export type BookingForm = { BOOKINGID?: number; BOOKNO?: string; USERLOGIN: string; PCID: string; PAKETID: string; TGL_BOOKING: string; JAM_MULAI: string; DURASI_MENIT: string; PAYMETHOD: string; NOTE: string };
type E = { USERLOGIN?: string; PCID?: string; TGL_BOOKING?: string; JAM_MULAI?: string; DURASI_MENIT?: string };
export default function FRMcp_booking({ isNew, initial, onSaved }: { isNew: boolean; initial?: BookingForm; onSaved: () => void }) {
  const { close } = useModal();
  const [form, setForm] = useState<BookingForm>(initial || { USERLOGIN:'', PCID:'', PAKETID:'', TGL_BOOKING:new Date().toISOString().slice(0,10), JAM_MULAI:'19:00', DURASI_MENIT:'60', PAYMETHOD:'qris', NOTE:'' });
  const [errs, setErrs] = useState<E>({}); const [busy,setBusy]=useState(false);
  const [users,setUsers]=useState<any[]>([]); const [pcs,setPcs]=useState<any[]>([]); const [pakets,setPakets]=useState<any[]>([]);
  useEffect(()=>{ read_users().then((r:any)=>{ if(parseBoolean(r?.success)) setUsers(r.Rows||[]); }).catch(()=>{}); readPcs().then((r:any)=>{ if(parseBoolean(r?.success)) setPcs(r.Rows||[]); }).catch(()=>{}); readPakets().then((r:any)=>{ if(parseBoolean(r?.success)) setPakets(r.Rows||[]); }).catch(()=>{}); },[]);
  const set = (k: keyof BookingForm, v: string) => { setForm((f)=>({...f,[k]:v})); setErrs((e)=>({...e,[k]:undefined})); };
  const validate=():boolean=>{ const e:E={}; if(!form.USERLOGIN.trim()) e.USERLOGIN='User wajib.'; if(!form.PCID) e.PCID='PC wajib.'; if(!form.TGL_BOOKING) e.TGL_BOOKING='Tanggal wajib.'; if(!form.JAM_MULAI) e.JAM_MULAI='Jam wajib.'; if(!/^\d+$/.test(form.DURASI_MENIT.trim())||Number(form.DURASI_MENIT)<15) e.DURASI_MENIT='Min 15.'; setErrs(e); return !Object.keys(e).length; };
  const save=async()=>{ if(!validate()) return; if(!await confirmDialog({ message: isNew?'Buat Booking?':'Simpan Booking?' })) return; setBusy(true); try{ const v={ USERLOGIN:form.USERLOGIN, PCID: form.PCID?Number(form.PCID):null, PAKETID: form.PAKETID?Number(form.PAKETID):null, TGL_BOOKING: form.TGL_BOOKING, JAM_MULAI: form.JAM_MULAI, DURASI_MENIT: Number(form.DURASI_MENIT), PAYMETHOD: form.PAYMETHOD, NOTE: form.NOTE, BOOKINGID: form.BOOKINGID }; const res:any=isNew?await process_create(v):await process_update(v); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); onSaved(); close(); }else toast('Error',res?.message,'err'); }catch(e:any){ toast('Error',e.message,'err'); }finally{ setBusy(false); } };
  return (<Window title={isNew?'Tambah Booking':'Ubah Booking'} icon={isNew?'add':'edit'} width="62%" footer={<><Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Batal</Btn></>}>
    <FrmSet legend="Booking — Operator buat, user request pending-approve" icon="grid" columns={2}>
      <FrmRow label="User (GROUP_USER)"><div><select className="input" value={form.USERLOGIN} onChange={(e)=>set('USERLOGIN',e.target.value)}><option value="">-- pilih user --</option>{users.map((u:any)=><option key={u.USERLOGIN} value={u.USERLOGIN}>{u.USERLOGIN} — {u.USERNAME}</option>)}</select>{errs.USERLOGIN&&<span className="field-err">{errs.USERLOGIN}</span>}</div></FrmRow>
      <FrmRow label="PC / Seat"><div><select className="input" value={form.PCID} onChange={(e)=>set('PCID',e.target.value)}><option value="">-- pilih PC --</option>{pcs.map((p:any)=><option key={p.PCID} value={p.PCID}>{p.PCNO} — {p.ZONA} — Rp{Number(p.HARGA_PERJAM).toLocaleString('id-ID')}/jam {p.STATUS!=='ready'?'('+p.STATUS+')':''}</option>)}</select>{errs.PCID&&<span className="field-err">{errs.PCID}</span>}</div></FrmRow>
      <FrmRow label="Paket (opsional)"><select className="input" value={form.PAKETID} onChange={(e)=>set('PAKETID',e.target.value)}><option value="">Tanpa paket — jam bebas</option>{pakets.map((p:any)=><option key={p.PAKETID} value={p.PAKETID}>{p.KODE} — {p.NAMA} ({p.DURASI_MENIT}m) Rp{Number(p.HARGA).toLocaleString('id-ID')}</option>)}</select></FrmRow>
      <FrmRow label="Tgl"><div><input className="input" type="date" value={form.TGL_BOOKING} onChange={(e)=>set('TGL_BOOKING',e.target.value)} />{errs.TGL_BOOKING&&<span className="field-err">{errs.TGL_BOOKING}</span>}</div></FrmRow>
      <FrmRow label="Jam Mulai"><div><input className="input" type="time" value={form.JAM_MULAI} onChange={(e)=>set('JAM_MULAI',e.target.value)} />{errs.JAM_MULAI&&<span className="field-err">{errs.JAM_MULAI}</span>}</div></FrmRow>
      <FrmRow label="Durasi (menit)"><div><input className="input" type="number" min={15} max={720} step={15} value={form.DURASI_MENIT} onChange={(e)=>set('DURASI_MENIT',e.target.value)} />{errs.DURASI_MENIT&&<span className="field-err">{errs.DURASI_MENIT}</span>}</div></FrmRow>
      <FrmRow label="Pay"><select value={form.PAYMETHOD} onChange={(e)=>set('PAYMETHOD',e.target.value)}><option value="qris">QRIS</option><option value="transfer">Transfer</option><option value="cash">Cash (kasir)</option></select></FrmRow>
      <FrmRow label="Catatan"><input className="input" value={form.NOTE} onChange={(e)=>set('NOTE',e.target.value)} placeholder="opsional" /></FrmRow>
    </FrmSet>
  </Window>);
}
