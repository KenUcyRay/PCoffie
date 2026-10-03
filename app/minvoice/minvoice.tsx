// Mainpage menu minvoice (MCONTROL = minvoice).
//
// Read-only: invoice terbit otomatis dari pembayaran (tanpa tambah/ubah/hapus).
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cminvoice';
import GRIDminvoice, { type GridApi } from './GRIDminvoice';

export default function minvoice() {
  // ExtJS reference: "minvoice"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="report"
        title="Invoice List"
        subtitle="Invoice terbit otomatis dari pembayaran, siap cetak."
      />

      <div className="card card-grid">
        {/* dockedItems: toolbar atas (tanpa Tambah: read-only) */}
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

        {/* items: ringkasan + grid invoice */}
        <GRIDminvoice ref={grid} />
      </div>
    </>
  );
}
