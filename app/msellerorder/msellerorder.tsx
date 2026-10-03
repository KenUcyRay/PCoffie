// Mainpage menu msellerorder (MCONTROL = msellerorder).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Read-only + aksi seller (tanpa Tambah). Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmsellerorder';
import GRIDmsellerorder, { type GridApi } from './GRIDmsellerorder';

export default function msellerorder() {
  // ExtJS reference: "msellerorder"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="report"
        title="Seller Order"
        subtitle="Proses pesanan dari sisi penjual: proses, kirim, keluhan, retur."
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

        {/* items: ringkasan + grid pesanan seller */}
        <GRIDmsellerorder ref={grid} />
      </div>
    </>
  );
}
