// Mainpage menu cp_auditlog (MCONTROL = cp_auditlog) — read-only.
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// TIDAK ADA state / async function / panggilan API di file ini.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import GRIDcp_auditlog, { type GridApi } from './GRIDcp_auditlog';

export default function cp_auditlog() {
  // ExtJS reference: "cp_auditlog"
  const grid = useRef<GridApi>(null);

  return (
    <>
      <PageHead
        icon="history"
        title="Audit Log"
        subtitle="Riwayat perubahan data beserta siapa dan kapan. Hanya untuk melihat dan mencari."
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
            onClick={() => grid.current?.refresh()}
          />
        </div>

        {/* items: grid (isi data, paging, dan action column) */}
        <GRIDcp_auditlog ref={grid} />
      </div>
    </>
  );
}
