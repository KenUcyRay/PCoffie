// Mainpage menu cp_setting (MCONTROL = cp_setting).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items form.
// Satu halaman form pengaturan aplikasi (bukan grid).
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click, btsave_click } from './Ccp_setting';
import GRIDcp_setting, { type GridApi } from './GRIDcp_setting';

export default function cp_setting() {
  // ExtJS reference: "cp_setting"
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('10060002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="gear"
        title="General Setting"
        subtitle="Identitas, kontak, aturan umum, teks hukum, dan pengirim email aplikasi."
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
            <Btn pid="btsave" className="primary" icon="save" onClick={() => btsave_click(grid.current)}>Simpan</Btn>
          )}
        </div>

        {/* items: form pengaturan (isi data + validasi per kolom) */}
        <GRIDcp_setting ref={grid} />
      </div>
    </>
  );
}
