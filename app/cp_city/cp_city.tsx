// Mainpage menu cp_city (MCONTROL = cp_city).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TIDAK ADA state / async function / panggilan API di file ini.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_city';
import GRIDcp_city, { type GridApi } from './GRIDcp_city';

export default function cp_city() {
  // ExtJS reference: "cp_city"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="dept"
        title="City Data"
        subtitle="Kelola kota beserta provinsi, zona waktu, dan status aktifnya."
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
        <GRIDcp_city ref={grid} />
      </div>
    </>
  );
}
