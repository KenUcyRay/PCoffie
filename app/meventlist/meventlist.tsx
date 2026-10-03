// Mainpage menu meventlist (Discovery) — katalog event hanya baca.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click } from './Cmeventlist';
import GRIDmeventlist, { type GridApi } from './GRIDmeventlist';

export default function meventlist() {
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    // Halaman ini hanya baca: hak akses cek lagi untuk grid, tapi katalog
    // (yang publik di aplikasi pembeli) boleh dilihat semua orang di app.
    checkMenuAccess('20010002').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="layout"
        title="Event List"
        subtitle="Katalog event beserta tiketnya (hanya baca)."
      />
      <div className="card card-grid">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh Data" aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)} />
        </div>
        <GRIDmeventlist ref={grid} />
      </div>
    </>
  );
}
