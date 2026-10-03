// Mainpage menu mpayout (MCONTROL = mpayout).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmpayout';
import GRIDmpayout, { type GridApi } from './GRIDmpayout';

export default function mpayout() {
  // ExtJS reference: "mpayout"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="form"
        title="Payout Request"
        subtitle="Pencairan hasil penjualan tiket ke penyelenggara."
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
        </div>

        {/* items: tab Siap Dicairkan + Riwayat Payout */}
        <GRIDmpayout ref={grid} />
      </div>
    </>
  );
}
