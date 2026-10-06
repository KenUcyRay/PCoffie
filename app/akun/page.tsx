'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { isOk, portalPost } from '@/lib/portal/api';
import PortalNav from '@/components/PortalNav';

type BK = { BOOKINGID:number; BOOKNO:string; PCNO:string; PCZONA:string; PAKETNAMA:string|null; TGL_BOOKING:string; JAM_MULAI:string; JAM_SELESAI:string; DURASI_MENIT:number; TOTAL:number; PAYMETHOD:string; PAYSTATUS:string; STATUS:string; SYSCREATEDATE:string };

function AkunInner(){
  const sp = useSearchParams();
  const [rows,setRows]=useState<BK[]>([]); const [q,setQ]=useState(''); const [f,setF]=useState<'all'|'pending'|'approved'|'running'|'done'|'cancel'>('all');
  const [tab,setTab]=useState<'ringkas'|'aktif'|'riwayat'>('ringkas');
  const [pick,setPick]=useState<BK|null>(null); const [toast,setToast]=useState(''); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const pop=(m:string)=>{ setToast(m); setTimeout(()=>setToast(''),2600); };
  useEffect(()=>{
    const t = String(sp.get('tab') || '').toLowerCase();
    if (t === 'riwayat' || t === 'history') setTab('riwayat');
    else if (t === 'aktif' || t === 'reservasi' || t === 'reservation') setTab('aktif');
    else if (t === 'ringkas') setTab('ringkas');
  },[sp]);
  const load=async()=>{
    setLoading(true); setErr('');
    try{ const r:any=await portalPost('portal/warnet-my-bookings',{}); if(isOk(r)) setRows((r.Rows||[]).map((x:any)=>({...x,TOTAL:Number(x.TOTAL),DURASI_MENIT:Number(x.DURASI_MENIT)}))); else setErr(r?.message||'Gagal muat.'); }catch(e:any){ setErr(e?.message||'Silakan login dulu.'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);
  const filtered=useMemo(()=>{
    let r=[...rows];
    if(tab==='aktif') r=r.filter(x=>['pending','approved','running'].includes(x.STATUS));
    if(tab==='riwayat') r=r.filter(x=>['done','cancel'].includes(x.STATUS));
    if(f!=='all') r=r.filter(x=>x.STATUS===f);
    if(q.trim()){ const s=q.toLowerCase(); r=r.filter(x=> `${x.BOOKNO} ${x.PCNO} ${x.PAKETNAMA||''}`.toLowerCase().includes(s)); }
    return r;
  },[rows,tab,f,q]);
  const stats=useMemo(()=>({ total:rows.length, pending:rows.filter(x=>x.STATUS==='pending').length, approved:rows.filter(x=>x.STATUS==='approved').length, running:rows.filter(x=>x.STATUS==='running').length, done:rows.filter(x=>x.STATUS==='done').length, spend:rows.filter(x=>x.STATUS!=='cancel').reduce((a,b)=>a+Number(b.TOTAL),0) }),[rows]);
  const cancel=async(b:BK)=>{
    if(b.STATUS!=='pending') return pop('Hanya pending yang bisa dibatalkan Anda.');
    try{ const r:any=await portalPost('portal/warnet-booking-cancel',{ bookingid: b.BOOKINGID }); if(isOk(r)){ pop('Booking dibatalkan.'); load(); }else pop(r?.message||'Gagal batal.'); }catch(e:any){ pop(e?.message||'Gagal batal.'); }
  };
  return (
    <div className="pc-dark" style={{ minHeight:'100vh', background:'#020617' }}>
      <PortalNav />
      <div className="pc-dash-wrap">
        <aside className="pc-dash-nav">
          <div style={{ padding:'6px 8px 10px', display:'flex', gap:10, borderBottom:'1px solid #1e3a5f', marginBottom:6, alignItems:'center' }}>
            <span style={{ width:36, height:36, borderRadius:9, background:'#3b82f6', display:'grid', placeItems:'center', color:'#fff', fontWeight:800 }}>U</span>
            <span style={{ display:'grid' }}><b style={{ fontSize:12, color:'#fff' }}>Profil Kamu</b><small style={{ fontSize:11, color:'#64748b' }}>Akun pembeli</small></span>
          </div>
          {([{k:'ringkas',t:'Ringkasan'},{k:'aktif',t:'Reservasi'},{k:'riwayat',t:'History'}] as const).map(n=>(
            <button key={n.k} onClick={()=>setTab(n.k)} className={`pc-dash-link${tab===n.k?' is-on':''}`}>{n.t}</button>
          ))}
          <div style={{ marginTop:8, paddingTop:10, borderTop:'1px solid #1e3a5f', display:'grid', gap:6 }}>
            <button onClick={()=>pop('Operator approve di Console → Booking.')} className="pc-dash-link">ℹ Alur: pending → approve</button>
            <Link href="/reservasi" className="pc-dash-link" style={{ textDecoration:'none' }}>→ Buat Request Baru</Link>
          </div>
        </aside>
        <main style={{ display:'grid', gap:16, minWidth:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div><h1 style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{tab==='ringkas'?'Profil Kamu':tab==='aktif'?'Reservasi Aktif': 'History'}</h1><p style={{ fontSize:11, color:'#64748b', marginTop:4 }}>Kelola reservasi & riwayat — cancel pending milik sendiri, approve operator di Console.</p></div>
            <div style={{ display:'flex', gap:8 }}><Link href="/reservasi" className="pc-btn-primary" style={{ textDecoration:'none' }}>+ Reservasi</Link><button onClick={load} className="pc-btn-ghost">↻ Refresh</button></div>
          </div>
          {err ? <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', color:'#fca5a5', padding:'10px 12px', borderRadius:10, fontSize:12 }}>{err} <Link href="/login" style={{ color:'#fff', fontWeight:700 }}>Login →</Link></div> : null}
          <div className="pc-stat-grid">
            <button onClick={()=>{setTab('ringkas');setF('all');}} className="pc-stat" style={{ cursor:'pointer', textAlign:'left' }}><b>{stats.total}</b><span>Total</span></button>
            <button onClick={()=>{setTab('aktif');setF('pending');}} className="pc-stat" style={{ cursor:'pointer', textAlign:'left' }}><b>{stats.pending}</b><span>Pending</span></button>
            <button onClick={()=>{setTab('aktif');setF('approved');}} className="pc-stat" style={{ cursor:'pointer', textAlign:'left' }}><b>{stats.approved}</b><span>Approved</span></button>
            <button className="pc-stat" style={{ textAlign:'left' }}><b>Rp{stats.spend.toLocaleString('id-ID')}</b><span>Spend</span></button>
          </div>
          <div className="pc-card-dark" style={{ display:'grid', gap:12 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari BOOKNO / PC…" className="pc-input-dark" style={{ maxWidth:240 }} />
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {(['all','pending','approved','running','done','cancel'] as const).map(s=>(
                  <button key={s} onClick={()=>setF(s)} className={`pc-chip${f===s?' is-on':''}`}>{s==='all'?'Semua':s}</button>
                ))}
              </div>
              <button onClick={()=>{setQ('');setF('all');}} className="pc-chip">Reset</button>
            </div>
            {loading ? <div style={{ padding:20, textAlign:'center', color:'#64748b' }}>Memuat…</div> : filtered.length===0 ? <div style={{ padding:24, textAlign:'center', color:'#64748b', fontSize:12 }}>Belum ada booking di filter ini.</div> : (
              <div style={{ display:'grid', gap:10 }}>
                {filtered.map(b=>(
                  <div key={b.BOOKINGID} className="pc-booking" style={{ position:'relative' }}>
                    <div className="pc-booking-head">
                      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                        <b style={{ color:'#fff', fontSize:12 }}>{b.BOOKNO}</b>
                        <span className="pc-badge" style={{ background:b.PCZONA==='VIP'?'#3b82f6':b.PCZONA==='VVIP'?'#7c3aed':'#162447', color:'#fff', border:0 }}>{b.PCNO} • {b.PCZONA}</span>
                        <span className={`pc-badge ${b.STATUS==='pending'?'pc-badge-busy':b.STATUS==='cancel'?'pc-badge-busy':'pc-badge-ok'}`} style={{ textTransform:'uppercase' }}>{b.STATUS}</span>
                      </div>
                      <span style={{ fontSize:11, color:'#64748b' }}>{String(b.TGL_BOOKING).slice(0,10)} • {String(b.JAM_MULAI).slice(0,5)}–{String(b.JAM_SELESAI).slice(0,5)} • {b.DURASI_MENIT}m • {b.PAYMETHOD.toUpperCase()}</span>
                    </div>
                    <div className="pc-booking-body">
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', fontSize:12, color:'#cbd5e1' }}>
                        <span>{b.PAKETNAMA ? `Paket ${b.PAKETNAMA}` : 'Tanpa paket'} — <b style={{ color:'#3b82f6' }}>Rp{Number(b.TOTAL).toLocaleString('id-ID')}</b></span>
                        <span style={{ fontSize:11, color:'#64748b' }}>{b.PAYSTATUS}</span>
                      </div>
                    </div>
                    <div className="pc-booking-actions">
                      <button onClick={()=>setPick(b)} className="pc-btn-ghost" style={{ height:32, fontSize:12 }}>Detail</button>
                      {b.STATUS==='pending' ? <button onClick={()=>cancel(b)} className="pc-btn-ghost" style={{ height:32, fontSize:12, borderColor:'rgba(239,68,68,.35)', color:'#f87171' }}>Batalkan (saya)</button> : null}
                      {b.STATUS==='approved' ? <span style={{ fontSize:11, color:'#4ade80', alignSelf:'center', fontWeight:700 }}>✓ Approved — tunggu running</span> : null}
                      <button onClick={()=>pop('Share '+b.BOOKNO)} className="pc-chip" style={{ marginLeft:'auto' }}>Share</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><Link href="/reservasi" className="pc-btn-ghost" style={{ textDecoration:'none' }}>+ Request Booking</Link></div>
          </div>
        </main>
      </div>
      {pick ? (
        <div onClick={()=>setPick(null)} style={{ position:'fixed', inset:0, background:'rgba(2,6,23,.7)', backdropFilter:'blur(4px)', display:'grid', placeItems:'center', padding:16, zIndex:50 }}>
          <div onClick={e=>e.stopPropagation()} className="pc-card-dark" style={{ width:'100%', maxWidth:420, display:'grid', gap:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><b style={{ color:'#fff' }}>{pick.BOOKNO}</b><button onClick={()=>setPick(null)} className="pc-btn-ghost" style={{ height:32, width:32, padding:0, borderRadius:8 }}>✕</button></div>
            <div style={{ display:'grid', gap:8, background:'#020617', border:'1px solid #1e3a5f', borderRadius:12, padding:14 }}>
              <span className="pc-kv"><dt>PC</dt><dd>{pick.PCNO} ({pick.PCZONA})</dd></span>
              <span className="pc-kv"><dt>Paket</dt><dd>{pick.PAKETNAMA||'—'}</dd></span>
              <span className="pc-kv"><dt>Jadwal</dt><dd>{String(pick.TGL_BOOKING).slice(0,10)} {String(pick.JAM_MULAI).slice(0,5)} • {pick.DURASI_MENIT}m</dd></span>
              <span className="pc-kv"><dt>Status</dt><dd style={{ textTransform:'uppercase' }}>{pick.STATUS}</dd></span>
              <span className="pc-kv"><dt>Pay</dt><dd>{pick.PAYMETHOD} / {pick.PAYSTATUS}</dd></span>
              <span className="pc-kv is-total"><dt>Total</dt><dd>Rp{Number(pick.TOTAL).toLocaleString('id-ID')}</dd></span>
            </div>
            <div style={{ display:'flex', gap:8 }}><button onClick={()=>setPick(null)} className="pc-btn-ghost" style={{ flex:1 }}>Tutup</button>{pick.STATUS==='pending'?<button onClick={()=>{ cancel(pick); setPick(null); }} className="pc-btn-ghost" style={{ flex:1, borderColor:'rgba(239,68,68,.35)', color:'#f87171' }}>Batalkan</button>:null}</div>
          </div>
        </div>
      ):null}
      {toast ? <div className="pc-toast">✓ {toast}</div> : null}
    </div>
  );
}

export default function AkunPage(){
  return <Suspense fallback={<div className="pc-dark" style={{ minHeight:'100vh', background:'#020617', display:'grid', placeItems:'center', color:'#64748b' }}>Memuat…</div>}><AkunInner /></Suspense>;
}
