// Mainpage menu cp_bank (MCONTROL = cp_bank).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TIDAK ADA state / async function / panggilan API di file ini.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_bank';
import GRIDcp_bank, { type GridApi } from './GRIDcp_bank';

export default function cp_bank() {
  // ExtJS reference: "cp_bank"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="dept"
        title="Bank Data"
        subtitle="Kelola bank beserta kode transfer dan status aktifnya."
      />

      <div className="card card-grid">
        {/* dockedItems: toolbar atas */}
        <div className="toolbar">
          <Btn
            pid="btrefresh"
            iconOnly
            icon="refresh"
            title="Refresh Data"
            aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)}
          />
          <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Tambah</Btn>
        </div>

        {/* items: grid (isi data, paging, dan action column) */}
        <GRIDcp_bank ref={grid} />
      </div>
    </>
  );
}
