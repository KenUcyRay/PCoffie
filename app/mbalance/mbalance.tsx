// Mainpage menu mbalance (MCONTROL = mbalance).
//
// Read-only: saldo dihitung dari buku besar (tanpa koreksi saldo).
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmbalance';
import GRIDmbalance, { type GridApi } from './GRIDmbalance';

export default function mbalance() {
  // ExtJS reference: "mbalance"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="form"
        title="Seller Balance"
        subtitle="Saldo tertahan dan tersedia penjual dari buku besar."
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

        {/* items: ringkasan + grid penjual */}
        <GRIDmbalance ref={grid} />
      </div>
    </>
  );
}
