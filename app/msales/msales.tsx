// Mainpage menu msales (MCONTROL = msales).
//
// Read-only: laporan dari Payment History + refunds + payouts + withdrawals.
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn, Icon } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click } from './Cmsales';
import GRIDsales, { type GridApi } from './GRIDsales';

export default function msales() {
  // ExtJS reference: "msales"
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [allowed, setAllowed] = useState(true);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('70020002').then((ok) => setAllowed(ok)).catch(() => setAllowed(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="chart"
        title="Sales Report"
        subtitle="Laporan penjualan tiket, merchandise, dan pendapatan platform."
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

        {/* items: filter bar + tab + tren + tabel; tanpa hak akses tetap tampil halaman, data ditolak backend */}
        {allowed ? <GRIDsales ref={grid} /> : (
          <div className="card-body">
            <span className="loading-hint"><Icon name="lock" size={16} /> Anda tidak memiliki hak akses untuk menu ini.</span>
          </div>
        )}
      </div>
    </>
  );
}
