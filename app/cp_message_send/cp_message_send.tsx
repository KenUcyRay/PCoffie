// Mainpage menu cp_message_send (MCONTROL = cp_message_send).
//
// Padanan TDK.mpph.mpph (ExtJS): controller + dockedItems toolbar + items form.
// Satu halaman form kirim pesan (bukan grid). Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click, btsend_click } from './Ccp_message_send';
import GRIDcp_message_send, { type GridApi } from './GRIDcp_message_send';

export default function cp_message_send() {
  // ExtJS reference: "cp_message_send"
  const grid = useRef<GridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('10050002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="mail"
        title="Send Message"
        subtitle="Kirim pengumuman dalam aplikasi ke semua user, group, atau user tertentu."
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
            <Btn pid="btsend" className="primary" icon="mail" onClick={() => btsend_click(grid.current)}>Kirim</Btn>
          )}
        </div>

        {/* items: form kirim + pratinjau */}
        <GRIDcp_message_send ref={grid} />
      </div>
    </>
  );
}
