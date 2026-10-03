// Mainpage menu mmyticket (MCONTROL = mmyticket).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmyticket';
import GRIDmmyticket, { type GridApi } from './GRIDmmyticket';

export default function mmyticket() {
  // ExtJS reference: "mmyticket"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="ticket"
        title="My Ticket"
        subtitle="Tiket terbit: lihat QR, kirim ulang, buat ulang QR, dan batalkan."
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

        {/* items: ringkasan + grid tiket */}
        <GRIDmmyticket ref={grid} />
      </div>
    </>
  );
}
