// Mainpage menu mmypurchase (MCONTROL = mmypurchase).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click, btnew_click } from './Cmmypurchase';
import GRIDmmypurchase, { type GridApi } from './GRIDmmypurchase';

export default function mmypurchase() {
  // ExtJS reference: "mmypurchase"
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('50010003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="download"
        title="My Purchase"
        subtitle="Pesanan atas nama pembeli: buat, pantau, terima, dan keluhan."
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
          {canWrite && (
            <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Buat Pesanan</Btn>
          )}
        </div>

        {/* items: ringkasan + grid pesanan */}
        <GRIDmmypurchase ref={grid} />
      </div>
    </>
  );
}
