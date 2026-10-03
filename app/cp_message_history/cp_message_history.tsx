// Mainpage menu cp_message_history (MCONTROL = cp_message_history).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Read-only + aksi Tarik (tanpa Tambah/Ubah/Hapus).
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Ccp_message_history';
import GRIDcp_message_history, { type GridApi } from './GRIDcp_message_history';

export default function cp_message_history() {
  // ExtJS reference: "cp_message_history"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="history"
        title="Message History"
        subtitle="Pesan terkirim, status baca penerima, dan penarikan pesan yang salah."
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

        {/* items: kartu ringkasan + grid (isi data, paging, dan action column) */}
        <GRIDcp_message_history ref={grid} />
      </div>
    </>
  );
}
