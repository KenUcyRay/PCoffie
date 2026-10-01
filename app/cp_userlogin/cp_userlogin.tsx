// Mainpage menu cp_userlogin (MCONTROL = cp_userlogin).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TIDAK ADA state / async function / panggilan API di file ini.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_userlogin';
import GRIDcp_userlogin, { type GridApi } from './GRIDcp_userlogin';

export default function cp_userlogin() {
  // ExtJS reference: "cp_userlogin"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <div className="card">
      {/* dockedItems: toolbar atas */}
      <div className="toolbar">
        <Btn pid="btrefresh" icon="refresh" title="Refresh Data" onClick={() => btrefresh_click(grid.current)}>Refresh</Btn>
        <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Create User</Btn>
      </div>

      {/* items: grid (isi data, paging, dan action column) */}
      <GRIDcp_userlogin ref={grid} />
    </div>
  );
}