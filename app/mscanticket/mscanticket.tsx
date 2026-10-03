// Mainpage menu mscanticket (MCONTROL = mscanticket).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items scan.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmscanticket';
import GRIDmscanticket, { type GridApi } from './GRIDmscanticket';

export default function mscanticket() {
  // ExtJS reference: "mscanticket"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="search"
        title="Scan Ticket"
        subtitle="Check-in resmi di pintu masuk lewat kamera atau kode manual."
      />

      <div className="card card-grid">
        {/* dockedItems: toolbar atas (Refresh saja) */}
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

        {/* items: pilih event + kamera/manual + hasil + ringkasan */}
        <GRIDmscanticket ref={grid} />
      </div>
    </>
  );
}
