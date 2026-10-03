'use client';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { buildModuleTree, type MenuNode } from '@/lib/menu';
import Shell from '@/components/Shell';
import MenuHost from '@/components/MenuHost';
import LoginPage from '@/components/LoginPage';
import { Icon, iconForModule, iconForLeaf } from '@/components/Icon';

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

// Kumpulkan leaf (menu yang bisa dibuka) dalam urutan tampil.
function collectLeaves(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  const walk = (list: MenuNode[]) => list.forEach((n) => {
    if (n.children.length) walk(n.children);
    else if (n.mcontrol && n.mcontrol !== '-') out.push(n);
  });
  walk(nodes);
  return out;
}

function HomeView() {
  const { profile, menus, layoutMode } = useAuth();
  const { navigate } = useRoute();
  const { openTab } = useTabs();

  const modules = buildModuleTree(menus);
  const user = profile?.USERLOGIN || '-';
  const group = profile?.USERGROUP || '-';
  const mode = layoutMode === 'mode_desktop' ? 'Desktop' : 'Standard';
  const leaves = collectLeaves(modules.flatMap((m) => m.children));
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Sama seperti klik leaf di sidebar: buka tab + pindah halaman.
  const go = (mcontrol: string) => {
    const mc = String(mcontrol || '').toLowerCase();
    if (!mc || mc === '-') return;
    const path = '/' + mc;
    openTab(path);
    navigate(path);
  };

  return (
    <Shell title="Home">
      <div className="hero">
        <div className="hero-info">
          <p className="hero-hi">{greeting()}, {user}</p>
          <p className="hero-sub">{today} — {leaves.length} menu siap dibuka di {modules.length} modul.</p>
          <span className="hero-chip"><Icon name="users" size={13} /> {group} — Mode {mode}</span>
        </div>
        <span className="hero-deco"><Icon name="dashboard" size={76} /></span>
      </div>

      <div className="stat-grid">
        {[
          { icon: 'user' as const, label: 'User Login', value: user, tint: 0 },
          { icon: 'users' as const, label: 'Group', value: group, tint: 1 },
          { icon: 'grid' as const, label: 'Modul Aktif', value: String(modules.length), tint: 4 },
          { icon: 'chevR' as const, label: 'Menu Tersedia', value: String(leaves.length), tint: 2 },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <span className={`stat-ico tint-${s.tint}`}><Icon name={s.icon} size={18} /></span>
            <span className="stat-info"><b>{s.value}</b><span>{s.label}</span></span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <b><Icon name="grid" size={16} /> Jelajahi Modul</b>
          <span className="loading-hint">Klik kartu untuk membuka</span>
        </div>
        <div className="card-body">
          {modules.length > 0 ? (
            <div className="mod-cards">
              {modules.map((mod, i) => {
                const modLeaves = collectLeaves(mod.children);
                const first = modLeaves[0]?.mcontrol || '';
                return (
                  <div
                    key={mod.code}
                    className="mod-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => go(first)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(first); } }}
                    aria-label={`Buka ${mod.name}`}
                  >
                    <div className="mod-top">
                      <span className={`mod-ico tint-${i % 7}`}><Icon name={iconForModule(mod.code)} size={20} /></span>
                      <span className="mod-meta">
                        <b>{mod.name}</b>
                        <span>{modLeaves.length} menu</span>
                      </span>
                      <Icon name="chevR" size={15} />
                    </div>
                    {modLeaves.length > 0 && (
                      <div className="mod-chips">
                        {modLeaves.slice(0, 6).map((l) => (
                          <button
                            key={l.menuKey}
                            type="button"
                            className="mod-chip"
                            onClick={(e) => { e.stopPropagation(); go(l.mcontrol); }}
                          >
                            <Icon name={iconForLeaf(l.mcontrol)} size={12} />
                            {l.name}
                          </button>
                        ))}
                        {modLeaves.length > 6 && (
                          <span className="mod-more">+{modLeaves.length - 6} lainnya</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
  const { status, sessionEpoch } = useAuth();
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
  // key = sessionEpoch: setiap login berhasil (termasuk login ulang setelah
  // sesi habis) me-mount ulang isi halaman, sehingga pesan error lama
  // ("Sesi login habis...") tidak ikut tertinggal di halaman yang sama.
  if (current === '/') return <HomeView key={`home-${sessionEpoch}`} />;

  return <MenuHost key={`${current}-${sessionEpoch}`} mcontrol={current.replace(/^\//, '')} />;
}