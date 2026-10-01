'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { buildModuleTree } from '@/lib/menu';
import Shell from '@/components/Shell';
import { Icon, iconForModule, iconForLeaf } from '@/components/Icon';
import { PageHead } from '@/components/Page';

export default function HomePage() {
  const { status, profile, menus, layoutMode } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' && status !== 'expired') {
    return <div className="card"><div className="card-body"><span className="loading-hint"><Icon name="loading" size={16} className="spin" /> Memuat…</span></div></div>;
  }

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