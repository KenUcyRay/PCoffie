// Mainpage menu mwithdraw (MCONTROL = mwithdraw).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items GRID.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click, btnew_click } from './Cmwithdraw';
import GRIDmwithdraw, { type GridApi } from './GRIDmwithdraw';

export default function mwithdraw() {
  // ExtJS reference: "mwithdraw"
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('70030003').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="form"
        title="Withdrawal"
        subtitle="Penarikan saldo tersedia penjual ke rekening bank."
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
            <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Ajukan</Btn>
          )}
        </div>

        {/* items: ringkasan + grid penarikan */}
        <GRIDmwithdraw ref={grid} />
      </div>
    </>
  );
}
