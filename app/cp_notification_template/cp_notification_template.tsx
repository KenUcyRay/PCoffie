// Mainpage menu cp_notification_template (MCONTROL = cp_notification_template).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Read-only + aksi Ubah (tanpa Tambah/Hapus).
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click } from './Ccp_notification_template';
import GRIDcp_notification_template, { type GridApi } from './GRIDcp_notification_template';

export default function cp_notification_template() {
  // ExtJS reference: "cp_notification_template"
  const grid = useRef<GridApi>(null);

  useEffect(() => { controller_init(); }, []);

  return (
    <>
      <PageHead
        icon="mail"
        title="Notification Template"
        subtitle="Isi pesan otomatis sistem. Ubah judul, isi, dan status tanpa mengubah kode."
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

        {/* items: grid template (isi data, paging, dan action column) */}
        <GRIDcp_notification_template ref={grid} />
      </div>
    </>
  );
}
