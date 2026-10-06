'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { init as controller_init, btrefresh_click, btnew_click } from './Ccp_paket';
import GRIDcp_paket, { type GridApi } from './GRIDcp_paket';
export default function cp_paket() {
  const grid = useRef<GridApi>(null);
  useEffect(() => { controller_init(); }, []);
  return (
    <>
      <PageHead icon="grid" title="Paket Warnet" subtitle="Kelola paket durasi & harga. Dipakai saat booking jam bebas — pilih atau tanpa paket." />
      <div className="card card-grid">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh" aria-label="Refresh" onClick={() => btrefresh_click(grid.current)} />
          <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Tambah</Btn>
        </div>
        <GRIDcp_paket ref={grid} />
      </div>
    </>
  );
}
