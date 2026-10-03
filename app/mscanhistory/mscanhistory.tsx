// Mainpage menu mscanhistory (MCONTROL = mscanhistory).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Read-only + export (tanpa Tambah/Ubah/Hapus).
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmscanhistory';
import GRIDmscanhistory, { type GridApi } from './GRIDmscanhistory';

export default function mscanhistory() {
  // ExtJS reference: "mscanhistory"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="history"
        title="Scan History"
        subtitle="Riwayat semua percobaan scan beserta hasilnya. Hanya baca."
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

        {/* items: ringkasan + grid riwayat */}
        <GRIDmscanhistory ref={grid} />
      </div>
    </>
  );
}
