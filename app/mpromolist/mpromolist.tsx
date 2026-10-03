// Mainpage menu mpromolist (Discovery) — katalog kode promo hanya baca.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click } from './Cmpromolist';
import GRIDmpromolist, { type GridApi } from './GRIDmpromolist';

export default function mpromolist() {
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('20020003').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="ticket"
        title="Promo List"
        subtitle="Katalog kode promo beserta masa berlaku dan kuotanya (hanya baca)."
      />
      <div className="card card-grid">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh Data" aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)} />
        </div>
        <GRIDmpromolist ref={grid} />
      </div>
    </>
  );
}