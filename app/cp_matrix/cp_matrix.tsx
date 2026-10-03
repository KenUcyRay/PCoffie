// Mainpage menu cp_matrix (MCONTROL = cp_matrix).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TANPA tombol tambah (module dibuat via seeder). Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Ccp_matrix';
import GRIDcp_matrix, { type GridApi } from './GRIDcp_matrix';

export default function cp_matrix() {
  // ExtJS reference: "cp_matrix"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="grid"
        title="Module List"
        subtitle="Lihat module aplikasi dan atur nama tampilan serta urutannya."
      />

      <div className="card card-grid">
        {/* dockedItems: toolbar atas (Refresh saja; tanpa Tambah) */}
        <div className="toolbar">
          <Btn
            pid="btrefresh"
            iconOnly
            icon="refresh"
            title="Refresh Data"
            aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)}
          />
        </div>

        {/* items: grid (isi data, paging, dan action column) */}
        <GRIDcp_matrix ref={grid} />
      </div>
    </>
  );
}
