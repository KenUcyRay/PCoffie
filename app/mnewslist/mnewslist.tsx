// Mainpage menu mnewslist (Discovery) — daftar berita hanya baca.
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click } from './Cmnewslist';
import GRIDmnewslist, { type GridApi } from './GRIDmnewslist';

export default function mnewslist() {
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('20020002').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="layout"
        title="News List"
        subtitle="Daftar berita terbit beserta detailnya (hanya baca)."
      />
      <div className="card card-grid">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh Data" aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)} />
        </div>
        <GRIDmnewslist ref={grid} />
      </div>
    </>
  );
}