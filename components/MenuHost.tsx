'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Shell from './Shell';
import { Icon } from './Icon';
import { PageHead } from './Page';

// Resolusi menu ala langit_v2 (resolveStandardLeafClass):
// MCONTROL -> folder app/<mcontrol>/<mcontrol>.tsx (default export = mainpage).
// webpackExclude di bawah menjaga file rute Next (layout/page/loading/dll)
// tidak ikut ter-bundle ke client. Kalau folder belum ada, menu tetap
// muncul di sidebar (driven dtmenu); saat diklik tampil pesan
// "menu Control: <mcontrol> tidak ditemukan" (persis langit_v2).
export default function MenuHost({ mcontrol }: { mcontrol: string }) {
  const { status, menus } = useAuth();
  const router = useRouter();
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  const menuRow: any = (menus || []).find(
    (m: any) => String(m.MCONTROL || '').toLowerCase() === mcontrol.toLowerCase(),
  );
  const title = String(menuRow?.MNAME || mcontrol || 'Application');

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    let alive = true;
    setState('loading');
    setComp(null);
    if (!mcontrol) {
      setState('missing');
      return () => { alive = false; };
    }
    import(
      /* webpackInclude: /[/\\][A-Za-z0-9_()[\]-]+[/\\](?!page\.|layout\.|loading\.|error\.|not-found\.|template\.|default\.)[A-Za-z0-9_]+\.tsx$/ */
      `@/app/${mcontrol}/${mcontrol}`
    )
      .then((m: any) => {
        if (!alive) return;
        if (typeof m?.default === 'function') { setComp(() => m.default); setState('ready'); }
        else setState('missing');
      })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [mcontrol]);

  if (status !== 'authenticated' && status !== 'expired') return <div style={{ padding: 24 }}>Memuat…</div>;

  if (state === 'missing') {
    return (
      <Shell title={title}>
        <PageHead
          icon="alertCircle"
          title="Halaman belum dibuat"
          subtitle={`menu Control: ${mcontrol} tidak ditemukan`}
        />
        <div className="card">
          <div className="card-body">
            <p className="empty-hint">
              <Icon name="info" size={16} />
              Menu ini sudah punya hak akses (CPMENUACCESS), tetapi halaman-nya belum dibuat di repo.
            </p>
            <p>
              Buat folder <code>app/{mcontrol}/</code> berisi <code>{mcontrol}.tsx</code> (mainpage, default export),
              <code> C{mcontrol}.ts</code> (controller), <code>GRID{mcontrol}.tsx</code> / <code>FRM{mcontrol}.tsx</code>,
              lalu salin <code>templates/menu/</code> sebagai titik awal.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (state === 'loading' || !Comp) {
    return (
      <Shell title={title}>
        <div className="card">
          <div className="card-body">
            <span className="loading-hint"><Icon name="loading" size={16} className="spin" /> Memuat…</span>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={title}>
      <Comp />
    </Shell>
  );
}