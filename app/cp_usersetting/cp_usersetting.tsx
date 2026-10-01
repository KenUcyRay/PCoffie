// Mainpage menu cp_usersetting (MCONTROL = cp_usersetting).
//
// Padanan TDK.mpph.mpph (ExtJS) — isinya cuma:
//   - controller     : Ccp_usersetting
//   - dockedItems    : toolbar (btrefresh, btnew) yang handler-nya di controller
//   - items          : GRIDcp_usersetting (grid + store + proxy)
//
// TIDAK ADA state, TIDAK ADA async function, TIDAK ADA panggilan API di sini.
// Menu ini dipanggil default oleh MenuHost, jadi TANPA <Shell> (Shell dipasang
// oleh MenuHost, tiruan resolveStandardLeafClass).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_usersetting';
import GRIDcp_usersetting, { type GridApi } from './GRIDcp_usersetting';

export default function cp_usersetting() {
  // ExtJS reference: "mpph" — di sini grid dipegang lewat ref.
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
      <GRIDcp_usersetting ref={grid} />
    </div>
  );
}