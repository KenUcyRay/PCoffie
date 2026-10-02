// Mainpage menu cp_loginhistory (MCONTROL = cp_loginlog) — read-only.
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TIDAK ADA state / async function / panggilan API di file ini.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Ccp_loginhistory';
import GRIDcp_loginhistory, { type GridApi } from './GRIDcp_loginhistory';

export default function cp_loginhistory() {
  // ExtJS reference: "cp_loginlog"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="key"
        title="Login History"
        subtitle="Riwayat percobaan login, logout, dan pemblokiran. Hanya untuk melihat dan mencari."
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

        {/* items: ringkasan + grid (isi data, paging) */}
        <GRIDcp_loginhistory ref={grid} />
      </div>
    </>
  );
}
