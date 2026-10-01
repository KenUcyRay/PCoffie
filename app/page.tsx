'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { buildModuleTree } from '@/lib/menu';
import Shell from '@/components/Shell';
import { Icon, iconForModule } from '@/components/Icon';

export default function HomePage() {
  const { status, profile, menus, layoutMode } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' && status !== 'expired') return <div style={{ padding: 24 }}>Memuat…</div>;

  const modules = buildModuleTree(menus);

  return (
    <Shell title="Home">
      <div className="card">
        <h2 className="page-title"><Icon name="dashboard" size={20} /> Mode Standard</h2>
        <p style={{ color: '#475569' }}>Pilih menu dari panel kiri untuk membuka halaman.</p>
      </div>
      <div className="stat-grid">
        <div className="stat"><span><Icon name="user" size={13} /> User Login</span><b>{profile?.USERLOGIN || '-'}</b></div>
        <div className="stat"><span><Icon name="users" size={13} /> Group</span><b>{profile?.USERGROUP || '-'}</b></div>
        <div className="stat"><span><Icon name="layout" size={13} /> Mode Layout</span><b>{layoutMode === 'mode_desktop' ? 'Desktop' : 'Standard'}</b></div>
      </div>
      <div className="card">
        <b className="page-title"><Icon name="grid" size={16} /> Menu</b>
        <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
          {modules.map((mod) => (
            <div key={mod.code}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name={iconForModule(mod.code)} size={15} /> {mod.name}
              </div>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 14 }}>
                {mod.children.map((c) => <li key={c.menuKey}>{c.name}</li>)}
              </ul>
            </div>
          ))}
          {!modules.length && <p className="empty-hint"><Icon name="grid" size={16} /> Belum ada menu untuk user ini.</p>}
        </div>
      </div>
    </Shell>
  );
}