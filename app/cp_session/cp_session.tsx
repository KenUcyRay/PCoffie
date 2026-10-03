// Mainpage menu cp_session (MCONTROL = cp_session).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Read-only + aksi Cabut (tanpa Tambah). Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Ccp_session';
import GRIDcp_session, { type GridApi } from './GRIDcp_session';

export default function cp_session() {
  // ExtJS reference: "cp_session"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="history"
        title="Session List"
        subtitle="Sesi login yang sedang aktif. Cabut sesi untuk meminta user login ulang."
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

        {/* items: kartu ringkasan + grid (isi data, paging, dan action column) */}
        <GRIDcp_session ref={grid} />
      </div>
    </>
  );
}
