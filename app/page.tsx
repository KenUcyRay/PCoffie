'use client';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/route';
import { buildModuleTree } from '@/lib/menu';
import Shell from '@/components/Shell';
import MenuHost from '@/components/MenuHost';
import LoginPage from '@/components/LoginPage';
import { Icon, iconForModule, iconForLeaf } from '@/components/Icon';
import { PageHead } from '@/components/Page';

// Satu-satunya route Next.js di aplikasi ini ("/tiket-app"). Halaman yang aktif
// ditentukan oleh state internal (lib/route), bukan oleh URL — meniru langit_v2
// yang index.html-nya kosong dan tidak pernah mengubah URL.

function Loading() {
  return (
    <div className="card">
      <div className="card-body">
        <span className="loading-hint"><Icon name="loading" size={16} className="spin" /> Memuat…</span>
      </div>
    </div>
  );
}

function HomeView() {
  const { profile, menus, layoutMode } = useAuth();

  const modules = buildModuleTree(menus);
  const user = profile?.USERLOGIN || '-';
  const group = profile?.USERGROUP || '-';
  const mode = layoutMode === 'mode_desktop' ? 'Desktop' : 'Standard';

  return (
    <Shell title="Home">
      <PageHead
        icon="dashboard"
        title="Dashboard"
        subtitle="Ringkasan sesi dan daftar menu yang tersedia untuk Anda."
      />

      <div className="stat-grid">
        <div className="stat">
          <span><Icon name="user" size={13} /> User Login</span>
          <b>{user}</b>
        </div>
        <div className="stat">
          <span><Icon name="users" size={13} /> Group</span>
          <b>{group}</b>
        </div>
        <div className="stat">
          <span><Icon name="layout" size={13} /> Mode Layout</span>
          <b>{mode}</b>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <b><Icon name="grid" size={16} /> Menu</b>
          <span className="loading-hint">{modules.length} modul</span>
        </div>
        <div className="card-body">
          {modules.length > 0 ? (
            <div className="menu-list">
              {modules.map((mod) => (
                <div key={mod.code} className="menu-group">
                  <div className="menu-group-head">
                    <Icon name={iconForModule(mod.code)} size={15} />
                    {mod.name}
                  </div>
                  <ul>
                    {mod.children.map((c) => (
                      <li key={c.menuKey}>
                        <Icon name={iconForLeaf(c.mcontrol)} size={13} />
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-hint"><Icon name="grid" size={16} /> Belum ada menu untuk user ini.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  const { status } = useAuth();
  const { current, navigate, ready } = useRoute();

  // Normalisasi rute terhadap status auth:
  //  guest               -> login (apa pun yang tersimpan di sessionStorage)
  //  sudah login         -> home (biar tidak tersangkut di /login)
  useEffect(() => {
    if (!ready) return;
    if (status === 'guest') {
      if (current !== '/login') navigate('/login');
      return;
    }
    if (status === 'authenticated' && current === '/login') navigate('/');
  }, [ready, status, current, navigate]);

  if (!ready) return <Loading />;
  if (status === 'guest') return <LoginPage />;
  if (status !== 'authenticated' && status !== 'expired') return <Loading />;
  // transien: effect di atas sedang mengarahkan /login -> /
  if (current === '/login') return <Loading />;
  if (current === '/') return <HomeView />;

  return <MenuHost mcontrol={current.replace(/^\//, '')} />;
}