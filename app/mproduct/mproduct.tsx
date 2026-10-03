// Mainpage menu mproduct (MCONTROL = mproduct).
//
// Etalase katalog hanya-baca (kartu/tabel + detail). Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Cmproduct';
import GRIDmproduct, { type GridApi } from './GRIDmproduct';

export default function mproduct() {
  // ExtJS reference: "mproduct"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="box"
        title="Product List"
        subtitle="Etalase merchandise seperti yang dilihat pembeli."
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

        {/* items: katalog (kartu/tabel + detail) */}
        <GRIDmproduct ref={grid} />
      </div>
    </>
  );
}
