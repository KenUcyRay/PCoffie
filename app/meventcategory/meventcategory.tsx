// Mainpage menu meventcategory (Discovery) — katalog event per kategori.
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init } from './Cmeventcategory';
import GRIDmeventcategory from './GRIDmeventcategory';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';

export default function meventcategory() {
  const refreshRef = useRef<(() => void) | undefined>(undefined);
  const { checkMenuAccess, menus } = useAuth();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const [canManageCat, setCanManageCat] = useState(false);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    const get = (mc: string) => (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    const row = get('cpcategory');
    if (row) checkMenuAccess(String(row.MCODE)).then(setCanManageCat).catch(() => setCanManageCat(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="layout"
        title="Event by Category"
        subtitle="Katalog event dikelompokkan per kategori (hanya baca)."
      />
      <div className="card card-grid">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh Data" aria-label="Refresh Data"
            onClick={() => refreshRef.current && refreshRef.current()} />
          {canManageCat && (
            <Btn className="primary btn-sm" icon="edit"
              onClick={() => { openTab('/cpcategory'); navigate('/cpcategory'); }}>
              Kelola Kategori
            </Btn>
          )}
        </div>
        <GRIDmeventcategory onRefreshRef={refreshRef} />
      </div>
    </>
  );
}
