'use client';
import { useEffect,useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_pc';
import GRIDcp_pc,{ type GridApi } from './GRIDcp_pc';
export default function cp_pc(){
  const grid=useRef<GridApi>(null);
  useEffect(()=>{ controller_init(); },[]);
  return (<>
    <PageHead icon="grid" title="PC / Seat" subtitle="Master PC + seat picker kursi bioskop. Zona & status ready/busy/maint." />
    <div className="card card-grid">
      <div className="toolbar">
        <Btn pid="btrefresh" iconOnly icon="refresh" onClick={()=>btrefresh_click(grid.current)} />
        <Btn pid="btnew" className="primary" icon="add" onClick={()=>btnew_click(grid.current)}>Tambah</Btn>
      </div>
      <GRIDcp_pc ref={grid} />
    </div>
  </>);
}
