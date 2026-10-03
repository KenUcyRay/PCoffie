// Mainpage menu cp_security (MCONTROL = cp_security).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items form.
// Satu halaman form (bukan grid): Simpan membuka konfirmasi berisi ringkasan
// nilai lama dibanding nilai baru; Reset kembali ke nilai tersimpan.
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click, btsave_click, btreset_click } from './Ccp_security';
import GRIDcp_security, { type GridApi } from './GRIDcp_security';

export default function cp_security() {
  // ExtJS reference: "cp_security"
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('10030002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="lock"
        title="Security Setting"
        subtitle="Kebijakan password, proteksi login, dan sesi yang berlaku untuk semua user."
      />

      <div className="card card-grid">
        {/* dockedItems: toolbar atas (Refresh + Simpan + Reset) */}
        <div className="toolbar">
          <Btn
            pid="btrefresh"
            iconOnly
            icon="refresh"
            title="Refresh Data"
            aria-label="Refresh Data"
            onClick={() => btrefresh_click(grid.current)}
          />
          <Btn
            pid="btsave" className="primary" icon="save"
            disabled={!canWrite}
            title={canWrite ? 'Simpan pengaturan' : 'Anda tidak memiliki hak akses untuk mengubah pengaturan ini'}
            onClick={() => btsave_click(grid.current)}
          >
            Simpan
          </Btn>
          <Btn pid="btreset" icon="refresh" onClick={() => btreset_click(grid.current)}>Reset</Btn>
        </div>

        {/* items: form pengaturan (isi data + validasi per kolom) */}
        <GRIDcp_security ref={grid} />
      </div>
    </>
  );
}
