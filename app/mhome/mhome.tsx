// Mainpage menu mhome (Discovery Home) — ringkasan isi Discovery, hanya baca.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click } from './Cmhome';
import GRIDmhome, { type GridApi } from './GRIDmhome';

export default function mhome() {
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('20000001').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="dashboard"
        title="Discovery"
        subtitle="Ringkasan event, berita, promo, dan banner untuk aplikasi pembaca (hanya baca)."
      />
      <div className="card">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh Data" aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)} />
        </div>
        <GRIDmhome ref={grid} />
      </div>
    </>
  );
}