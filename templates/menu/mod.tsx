// TEMPLATE mainpage — padanan <mod>.js / TDK.mpph.mpph (ExtJS).
//
// Cara pakai: copy folder templates/menu/ menjadi app/<mcontrol>/ lalu
// rename file-file ini:
//   mod.tsx      -> <mcontrol>.tsx      (mainpage, default export)
//   Cmod.ts      -> C<mcontrol>.ts      (controller)
//   GRIDmod.tsx  -> GRID<mcontrol>.tsx  (grid + store + proxy)
//   FRMmod.tsx   -> FRM<mcontrol>.tsx   (form modal)
//   api.ts       -> api.ts              (proxy ke backend)
// Contoh: mcontrol = msupplier -> app/msupplier/msupplier.tsx, Cmsupplier.ts, dst.
//
// Isi file ini HARUS tipis: hanya menyambungkan controller dengan file kebutuhan
// menu (grid/form) — persis seperti mpph.js yang cuma berisi dockedItems toolbar
// + items GRID. TIDAK ADA state, TIDAK ADA async function, TIDAK ADA panggilan
// API di sini; semuanya milik GRID/FRM.
//
// Default export file ini = mainpage yang dirender MenuHost (tanpa <Shell>;
// Shell sudah dipasang oleh MenuHost, tiruan resolveStandardLeafClass).
'use client';
import { useEffect, useRef } from 'react';
import { Btn } from '@/components/Icon';
import { init as controller_init, btrefresh_click, btnew_click } from './Cmod';
import GRIDmod, { type GridApi } from './GRIDmod';

export default function mod() {
  // ExtJS reference: "mod" — di sini grid dipegang lewat ref.
  const grid = useRef<GridApi>(null);

  // initComponent: controller dijalankan sekali, sama seperti ExtJS.
  useEffect(() => { controller_init(); }, []);

  return (
    <div className="card">
      {/* dockedItems: toolbar atas (handler-nya di controller) */}
      <div className="toolbar">
        <Btn pid="btrefresh" icon="refresh" title="Refresh Data" onClick={() => btrefresh_click(grid.current)}>Refresh</Btn>
        <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(grid.current)}>Create</Btn>
      </div>

      {/* items: grid (isi data, paging, dan action column) */}
      <GRIDmod ref={grid} />
    </div>
  );
}