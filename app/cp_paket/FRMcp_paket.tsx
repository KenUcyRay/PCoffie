'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { Btn } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update } from './api';
export type PaketForm = { PAKETID?: number; KODE: string; NAMA: string; ZONA: string; DURASI_MENIT: string; HARGA: string; DESKRIPSI: string; ISAKTIF: string; SORTNO: string };
type E = { KODE?: string; NAMA?: string; DURASI_MENIT?: string; HARGA?: string };
export default function FRMcp_paket({ isNew, initial, onSaved }: { isNew: boolean; initial?: PaketForm; onSaved: () => void }) {
  const { close } = useModal();
  const [form, setForm] = useState<PaketForm>(initial || { KODE:'', NAMA:'', ZONA:'REGULER', DURASI_MENIT:'60', HARGA:'0', DESKRIPSI:'', ISAKTIF:'YES', SORTNO:'0' });
  const [errs, setErrs] = useState<E>({}); const [busy,setBusy]=useState(false);
  const set = (k: keyof PaketForm, v: string) => { setForm((f)=>({...f,[k]:v})); setErrs((e)=>({...e,[k]:undefined})); };
  const validate=():boolean=>{ const e:E={}; if(!form.KODE.trim()) e.KODE='Kode wajib.'; if(!form.NAMA.trim()) e.NAMA='Nama wajib.'; if(!/^\d+$/.test(form.DURASI_MENIT.trim())||Number(form.DURASI_MENIT)<15) e.DURASI_MENIT='Min 15 menit.'; if(isNaN(Number(form.HARGA))||Number(form.HARGA)<0) e.HARGA='Harga tidak valid.'; setErrs(e); return !Object.keys(e).length; };
  const save=async()=>{ if(!validate()) return; if(!await confirmDialog({ message:'Simpan Paket?' })) return; setBusy(true); try{ const res:any=isNew?await process_create(form):await process_update(form); if(parseBoolean(res?.success)){ toast('Success',res.message,'ok'); onSaved(); close(); }else toast('Error',res?.message,'err'); }catch(e:any){ toast('Error',e.message,'err'); }finally{ setBusy(false); } };
  return (<Window title={isNew?'Tambah Paket':'Ubah Paket'} icon={isNew?'add':'edit'} width="50%" footer={<><Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn><span className="frm-foot-gap" /><Btn icon="close" onClick={close}>Batal</Btn></>}>
    <FrmSet legend="Paket" icon="grid" columns={2}>
      <FrmRow label="Kode"><div><input className="input" value={form.KODE} readOnly={!isNew} onChange={(e)=>set('KODE',e.target.value)} />{errs.KODE&&<span className="field-err">{errs.KODE}</span>}</div></FrmRow>
      <FrmRow label="Nama"><div><input className="input" value={form.NAMA} onChange={(e)=>set('NAMA',e.target.value)} />{errs.NAMA&&<span className="field-err">{errs.NAMA}</span>}</div></FrmRow>
      <FrmRow label="Zona"><select value={form.ZONA} onChange={(e)=>set('ZONA',e.target.value)}><option value="REGULER">REGULER</option><option value="VIP">VIP</option><option value="VVIP">VVIP</option></select></FrmRow>
      <FrmRow label="Menit"><div><input className="input" type="number" min={15} value={form.DURASI_MENIT} onChange={(e)=>set('DURASI_MENIT',e.target.value)} />{errs.DURASI_MENIT&&<span className="field-err">{errs.DURASI_MENIT}</span>}</div></FrmRow>
      <FrmRow label="Harga"><div><input className="input" type="number" min={0} step={100} value={form.HARGA} onChange={(e)=>set('HARGA',e.target.value)} />{errs.HARGA&&<span className="field-err">{errs.HARGA}</span>}</div></FrmRow>
      <FrmRow label="Urut"><input className="input" type="number" value={form.SORTNO} onChange={(e)=>set('SORTNO',e.target.value)} /></FrmRow>
      <FrmRow label="Deskripsi"><input className="input" value={form.DESKRIPSI} onChange={(e)=>set('DESKRIPSI',e.target.value)} /></FrmRow>
      <FrmRow label="Aktif"><select value={form.ISAKTIF} onChange={(e)=>set('ISAKTIF',e.target.value)}><option value="YES">Aktif</option><option value="NO">Nonaktif</option></select></FrmRow>
    </FrmSet>
  </Window>);
}
