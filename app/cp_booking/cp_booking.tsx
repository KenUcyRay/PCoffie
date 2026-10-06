'use client';
import { useEffect,useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_booking';
import GRIDcp_booking,{ type GridApi } from './GRIDcp_booking';
export default function cp_booking(){
  const grid=useRef<GridApi>(null);
  useEffect(()=>{ controller_init(); },[]);
  return (<>
    <PageHead icon="grid" title="Booking Warnet" subtitle="Booking oleh operator — user request pending → approve. Pilih user + PC seat + paket opsional + jam bebas." />
    <div className="card card-grid">
      <div className="toolbar">
        <Btn pid="btrefresh" iconOnly icon="refresh" onClick={()=>btrefresh_click(grid.current)} />
        <Btn pid="btnew" className="primary" icon="add" onClick={()=>btnew_click(grid.current)}>Booking Baru</Btn>
      </div>
      <GRIDcp_booking ref={grid} />
    </div>
  </>);
}
