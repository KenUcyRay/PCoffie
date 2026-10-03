// Mainpage menu meventcity (Discovery) — katalog event per kota.
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init } from './Cmeventcity';
import GRIDmeventcity from './GRIDmeventcity';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';

export default function meventcity() {
  const refreshRef = useRef<(() => void) | undefined>(undefined);
  const { checkMenuAccess, menus } = useAuth();
  const { navigate } = useRoute();
  const { openTab } = useTabs();
  const [canManageCity, setCanManageCity] = useState(false);

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    const get = (mc: string) => (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    const row = get('cpcity');
    if (row) checkMenuAccess(String(row.MCODE)).then(setCanManageCity).catch(() => setCanManageCity(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHead
        icon="layout"
        title="Event by City"
        subtitle="Katalog event dikelompokkan per kota (hanya baca)."
      />
      <div className="card card-grid">
        <div className="toolbar">
          <Btn pid="btrefresh" iconOnly icon="refresh" title="Refresh Data" aria-label="Refresh Data"
            onClick={() => refreshRef.current && refreshRef.current()} />
          {canManageCity && (
            <Btn className="primary btn-sm" icon="edit"
              onClick={() => { openTab('/cpcity'); navigate('/cpcity'); }}>
              Kelola Kota
            </Btn>
          )}
        </div>
        <GRIDmeventcity onRefreshRef={refreshRef} />
      </div>
    </>
  );
}
