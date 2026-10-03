// Mainpage menu cp_menu (MCONTROL = cp_menu).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TANPA tombol tambah (menu dibuat via seeder). Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Ccp_menu';
import GRIDcp_menu, { type GridApi } from './GRIDcp_menu';

export default function cp_menu() {
  // ExtJS reference: "cp_menu"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="menu"
        title="Menu List"
        subtitle="Lihat struktur menu per module dan atur nama serta urutannya."
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

        {/* items: dropdown module + tree + pencarian */}
        <GRIDcp_menu ref={grid} />
      </div>
    </>
  );
}
