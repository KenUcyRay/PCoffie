'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalNav from '@/components/PortalNav';

type Paket = { PAKETID:number; KODE:string; NAMA:string; ZONA:string; DURASI_MENIT:number; HARGA:number; DESKRIPSI:string };
type Pc = { PCID:number; PCNO:string; ZONA:string; SPEK:string; HARGA_PERJAM:number; STATUS:string; AVAILABLE?:string };

function ReservasiInner() {
  const sp = useSearchParams(); const router = useRouter();
  const [pakets,setPakets]=useState<Paket[]>([]); const [pcs,setPcs]=useState<Pc[]>([]);
  const [zone,setZone]=useState<'all'|'REGULER'|'VIP'|'VVIP'>('all');
  const [paketId,setPaketId]=useState<string>(''); const [pick,setPick]=useState<string>('');
  const [tgl,setTgl]=useState(()=>new Date().toISOString().slice(0,10)); const [jam,setJam]=useState('19:00'); const [dur,setDur]=useState(60);
  const [pay,setPay]=useState<'qris'|'transfer'>('qris'); const [toast,setToast]=useState(''); const [busy,setBusy]=useState(false);
  const pop=(m:string)=>{ setToast(m); setTimeout(()=>setToast(''),2600); };
  useEffect(()=>{ portalPost('portal/public/warnet-pakets',{},{auth:false}).then((r:any)=>{ if(isOk(r)) setPakets((r.Rows||[]).map((x:any)=>({...x,HARGA:Number(x.HARGA)}))); }).catch(()=>{}); },[]);
  useEffect(()=>{
    const qp = sp.get('paket');
    if (qp && !paketId) setPaketId(String(qp));
  },[sp]);
  useEffect(()=>{
    const pkt = pakets.find(x=>String(x.PAKETID)===paketId);
    if (pkt) setDur(Number(pkt.DURASI_MENIT));
  },[paketId, pakets]);
  useEffect(()=>{
    if(!tgl||!jam) return;
    portalPost('portal/public/warnet-pcs',{ tgl, jam, dur, zona: zone==='all'?'':zone },{auth:false}).then((r:any)=>{
      if(isOk(r)) setPcs((r.Rows||[]).map((x:any)=>({...x,HARGA_PERJAM:Number(x.HARGA_PERJAM)})));
    }).catch(()=>{});
  },[tgl,jam,dur,zone]);
  const pc = useMemo(()=>pcs.find(x=>String(x.PCID)===pick)||null,[pcs,pick]);
  const paket = useMemo(()=>pakets.find(x=>String(x.PAKETID)===paketId)||null,[pakets,paketId]);
  const isPaket = !!paket;
  const total = paket ? Number(paket.HARGA) : pc ? Math.ceil(dur/60)*Number(pc.HARGA_PERJAM) : 0;
  const request = async()=>{
    if(!pick) return pop('Pilih PC dulu.');
    setBusy(true);
    try{
      const r:any=await portalPost('portal/warnet-booking-request',{ pcid: Number(pick), paketid: paketId?Number(paketId):null, tgl, jam, dur, paymethod: pay });
      if(isOk(r)){ pop(`Request pending: ${r.bookno||'OK'} — tunggu approve operator.`); setTimeout(()=>router.push('/akun?tab=aktif'),900); }
      else pop(r?.message||'Gagal request.');
    }catch(e:any){ pop(e?.message||'Gagal request — login dulu.'); }
    setBusy(false);
  };
  return (
    <div className="pc-dark" style={{ minHeight:'100vh', background:'#020617' }}>
      <PortalNav />
      <div className="pc-book-wrap">
        <div style={{ display:'grid', gap:16 }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Reservasi — Request Booking</h1>
            <p style={{ fontSize:12, color:'#64748b', marginTop:4 }}>Pilih paket (opsional) + tgl/jam + PC kosong. Paket mengunci durasi — tgl & jam tetap pilih. Submit → pending → operator approve → cek di Profil Kamu.</p>
          </div>
          <div className="pc-card-dark" style={{ display:'grid', gap:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#cbd5e1' }}>Paket (opsional)</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={()=>setPaketId('')} className={`pc-chip${paketId===''?' is-on':''}`}>Tanpa paket — jam bebas</button>
              {pakets.map(p=>(
                <button key={p.PAKETID} onClick={()=>{ setPaketId(String(p.PAKETID)); }} className={`pc-chip${String(p.PAKETID)===paketId?' is-on':''}`}>{p.KODE} • {p.DURASI_MENIT}m • Rp{Number(p.HARGA).toLocaleString('id-ID')}</button>
              ))}
            </div>
            {paket ? <small style={{ color:'#94a3b8', fontSize:11 }}>{paket.NAMA} — {paket.DESKRIPSI} — durasi terkunci {paket.DURASI_MENIT}m — total paket Rp{Number(paket.HARGA).toLocaleString('id-ID')}</small> : <small style={{ color:'#64748b', fontSize:11 }}>Tanpa paket: total = durasi × Rp/jam PC. Pilih durasi bebas.</small>}
          </div>

          <div className="pc-card-dark" style={{ display:'grid', gap:12 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#cbd5e1' }}>Zona</label>
              {(['all','REGULER','VIP','VVIP'] as const).map(z=>(
                <button key={z} onClick={()=>setZone(z)} className={`pc-zone-tab${zone===z?' is-on':''}`}>{z==='all'?'Semua':z}</button>
              ))}
            </div>
            <div style={{ display:'grid', gap:8, gridTemplateColumns:'repeat(3, minmax(0,1fr))' }}>
              <label style={{ display:'grid', gap:6 }}><span style={{ fontSize:11, color:'#cbd5e1', fontWeight:700 }}>Tgl</span><input type="date" value={tgl} onChange={e=>setTgl(e.target.value)} className="pc-input-dark" /></label>
              <label style={{ display:'grid', gap:6 }}><span style={{ fontSize:11, color:'#cbd5e1', fontWeight:700 }}>Jam</span><input type="time" value={jam} onChange={e=>setJam(e.target.value)} className="pc-input-dark" /></label>
              <label style={{ display:'grid', gap:6 }}><span style={{ fontSize:11, color: isPaket ? '#94a3b8' : '#cbd5e1', fontWeight:700 }}>Durasi (menit){isPaket ? ' — terkunci paket' : ''}</span><input type="number" min={15} max={720} step={15} value={dur} onChange={e=>setDur(Number(e.target.value)||60)} className="pc-input-dark" disabled={isPaket} style={isPaket ? { opacity: .6, cursor: 'not-allowed' } : undefined} /></label>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {[60,120,180,240,480].map(m=>(
                <button key={m} onClick={()=>!isPaket && setDur(m)} disabled={isPaket} className={`pc-chip${dur===m?' is-on':''}`} style={isPaket ? { opacity: .45, cursor: 'not-allowed' } : undefined}>{m>=60?`${m/60}j`: `${m}m`}</button>
              ))}
              <span style={{ fontSize:11, color:'#64748b' }}>{isPaket ? 'Durasi terkunci paket — tgl & jam tetap pilih.' : 'Klik cepat atau isi manual.'}</span>
            </div>
            <div className="pc-pc-grid">
              {pcs.length===0 ? <small style={{ color:'#64748b' }}>Memuat PC… pilih zona/tgl/jam dulu.</small> : pcs.map(p=>(
                <button key={p.PCID} disabled={p.AVAILABLE==='NO'} onClick={()=>setPick(String(p.PCID))} className={`pc-pc-card${String(p.PCID)===pick?' is-on':''}${p.AVAILABLE==='NO'?' is-busy':''}`} style={{ opacity: p.AVAILABLE==='NO'?0.45:1 }}>
                  <span style={{ display:'flex', justifyContent:'space-between', gap:8 }}><b>{p.PCNO}</b><span className={`pc-badge ${p.AVAILABLE==='NO'?'pc-badge-busy':'pc-badge-ok'}`}>{p.AVAILABLE==='NO'?'TERPAKAI':'KOSONG'}</span></span>
                  <small style={{ color:'#64748b', fontSize:11 }}>{p.SPEK} • {p.ZONA}</small>
                  <small style={{ color:'#3b82f6', fontWeight:800 }}>Rp{Number(p.HARGA_PERJAM).toLocaleString('id-ID')}/jam</small>
                </button>
              ))}
            </div>
            <small style={{ color:'#64748b', fontSize:11 }}>Seat kosong biru — klik untuk pick. Abu = sudah booked/maint pada tgl+jam tersebut.</small>
          </div>

          <div className="pc-card-dark" style={{ display:'grid', gap:10 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#cbd5e1' }}>Pay: QRIS / Transfer (tidak cash di portal — cash di kasir via operator)</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setPay('qris')} className={`pc-pay-opt${pay==='qris'?' is-on':''}`}><input type="radio" checked={pay==='qris'} readOnly /> QRIS</button>
              <button onClick={()=>setPay('transfer')} className={`pc-pay-opt${pay==='transfer'?' is-on':''}`}><input type="radio" checked={pay==='transfer'} readOnly /> Transfer</button>
            </div>
            <button disabled={busy||!pick} onClick={request} className="pc-btn-primary" style={{ width:'100%', opacity: !pick||busy?0.5:1 }}>{busy?'Memproses…':'Request Booking (pending approve)'}</button>
            <small style={{ color:'#64748b', fontSize:11 }}>Setelah request, cek <Link href="/akun" style={{ color:'#3b82f6' }}>Profil Kamu</Link>. Batal sendiri hanya saat pending.</small>
          </div>
        </div>

        <aside className="pc-summary">
          <div className="pc-card-dark" style={{ display:'grid', gap:8 }}>
            <h3 style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Ringkasan</h3>
            <span className="pc-kv"><dt>Paket</dt><dd>{paket?`${paket.KODE}`:'Tanpa paket'}</dd></span>
            <span className="pc-kv"><dt>PC</dt><dd>{pc?`${pc.PCNO} ${pc.ZONA}`:'—'}</dd></span>
            <span className="pc-kv"><dt>Jadwal</dt><dd>{tgl} {jam} • {dur}m{isPaket ? ' (paket)' : ''}</dd></span>
            <span className="pc-kv"><dt>Pay</dt><dd style={{ textTransform:'uppercase' }}>{pay}</dd></span>
            <span className="pc-kv is-total"><dt>Total</dt><dd>Rp{total.toLocaleString('id-ID')}</dd></span>
            <Link href="/akun" className="pc-btn-ghost" style={{ justifyContent:'center', textDecoration:'none' }}>Ke Profil Kamu →</Link>
          </div>
        </aside>
      </div>
      {toast ? <div className="pc-toast">✓ {toast}</div> : null}
    </div>
  );
}

export default function ReservasiPage() {
  return <Suspense fallback={<div className="pc-dark" style={{ minHeight:'100vh', background:'#020617', display:'grid', placeItems:'center', color:'#64748b' }}>Memuat…</div>}><ReservasiInner /></Suspense>;
}
