// Mainpage menu mproductdata (MCONTROL = mproductdata).
//
// Dua tab lokal: Produk dan Penjual (tiap tab GRID independen + refresh sendiri).
// Tanpa <Shell> (dipasang MenuHost).
'use client';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { useAuth } from '@/lib/auth';
import { init as controller_init, btrefresh_click, btnew_click } from './Cmproductdata';
import type { GridApi as ProductGridApi } from './GRIDmproductdata';
import type { GridApi as SellerGridApi } from './GRIDmseller';
import GRIDmproductdata from './GRIDmproductdata';
import GRIDmseller from './GRIDmseller';

export default function mproductdata() {
  // ExtJS reference: "mproductdata"
  const productGrid = useRef<ProductGridApi>(null);
  const sellerGrid = useRef<SellerGridApi>(null);
  const { checkMenuAccess } = useAuth();
  const [canWrite, setCanWrite] = useState(true);
  const [tab, setTab] = useState<'produk' | 'penjual'>('produk');

  useEffect(() => { controller_init(); }, []);
  useEffect(() => {
    checkMenuAccess('50020002').then((ok) => setCanWrite(ok)).catch(() => setCanWrite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = tab === 'produk' ? productGrid.current : sellerGrid.current;

  return (
    <>
      <PageHead
        icon="form"
        title="Product Data"
        subtitle="Produk merchandise dan penjualnya."
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
            onClick={() => btrefresh_click(active)}
          />
          {canWrite && (
            <Btn pid="btnew" className="primary" icon="add" onClick={() => btnew_click(active)}>Tambah</Btn>
          )}
          <span className="spacer" />
          <Btn
            className={tab === 'produk' ? 'primary btn-sm' : 'btn-sm'}
            onClick={() => setTab('produk')}
          >
            Produk
          </Btn>
          <Btn
            className={tab === 'penjual' ? 'primary btn-sm' : 'btn-sm'}
            onClick={() => setTab('penjual')}
          >
            Penjual
          </Btn>
        </div>

        {/* items: tab aktif (GRID lain tetap mount agar state tidak hilang) */}
        <div style={tab === 'produk' ? undefined : { display: 'none' }}>
          <GRIDmproductdata ref={productGrid} />
        </div>
        <div style={tab === 'penjual' ? undefined : { display: 'none' }}>
          <GRIDmseller ref={sellerGrid} />
        </div>
      </div>
    </>
  );
}
