// Mainpage menu cp_usergroup (MCONTROL = cp_usergroup).
//
// Padanan TDK.mpph.mpph (ExtJS):
//   - controller  : Ccp_usergroup
//   - dockedItems : toolbar panel kiri (btrefresh, btnew) -> handler di controller
//   - items       : GRIDcp_usergroup (kiri) + FRMcp_usergroup (kanan)
//
// Dua panel saling terhubung lewat reference: grid meneruskan baris terpilih ke
// panel hak akses. Tidak ada state / async function / panggilan API di file ini.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_usergroup';
import GRIDcp_usergroup, { type GridApi } from './GRIDcp_usergroup';
import FRMcp_usergroup, { type AksesApi } from './FRMcp_usergroup';

export default function cp_usergroup() {
  // ExtJS reference: dua panel, masing-masing punya reference sendiri.
  const grid = useRef<GridApi>(null);
  const akses = useRef<AksesApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="lock"
        title="User Group"
        subtitle="Kelola group user beserta hak akses menu per group."
      />

      <div className="two-col">
        <div className="card">
          <div className="toolbar">
            <Btn
              pid="btrefresh"
              iconOnly
              icon="refresh"
              title="Refresh Data"
              aria-label="Refresh Data"
              onClick={() => btrefresh_click(grid.current)}
            />
            <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Add Group</Btn>
          </div>
          <GRIDcp_usergroup ref={grid} aksesRef={akses} />
        </div>

        <div className="card">
          <FRMcp_usergroup ref={akses} />
        </div>
      </div>
    </>
  );
}