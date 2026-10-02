// Mainpage menu cp_syslog (MCONTROL = cp_syslog) — read-only.
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TIDAK ADA state / async function / panggilan API di file ini.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { btrefresh_click } from './Ccp_syslog';
import GRIDcp_syslog, { type GridApi } from './GRIDcp_syslog';

export default function cp_syslog() {
  // ExtJS reference: "cp_syslog"
  const grid = useRef<GridApi>(null);

  return (
    <>
      <PageHead
        icon="alert"
        title="System Log"
        subtitle="Kesalahan dan kejadian teknis aplikasi. Hanya untuk melihat dan mencari."
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
        <GRIDcp_syslog ref={grid} />
      </div>
    </>
  );
}
