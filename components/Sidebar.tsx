// Sidebar tiket-app — padanan Cmode_standard.js sidebar langti_v2, ditulis ulang
// dengan gaya modern (navy + aksen biru) TANPA mengubah struktur menu atau route.
//
// STRUKTUR TIDAK DIUBAH: menu tetap dibangun dari `auth/me` -> `dtmenu`
// (lihat lib/menu.ts :: buildModuleTree) dengan bentuk
//   Home
//   <Module>            (grup, level 0)
//     <Menu grup>       (sub-grup, level 1)
//       <Menu leaf>     (halaman, level 2)
//
// Yang berubah hanya tampilan + perilaku:
//   - header 64px berisi logo 40x40 gradasi, nama app, dan tombol toggle
//     (toggle ada DI DALAM sidebar; di desktop burger top bar disembunyikan)
//   - mode collapse 264px <-> 64px, ikon di kolom tetap 40px (tidak bergeser)
//   - submenu animate grid-template-rows 0fr -> 1fr, chevron berputar 180deg
//   - footer = kartu profil + popup (User Profile / Logout)
//   - mobile (<768px) = drawer slide-out + overlay, selalu mode penuh
//   - Ctrl+B / Cmd+B toggle, Esc menutup drawer & popup
//   - pilihan collapsed disimpan di localStorage
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/lib/auth';
import { buildModuleTree, type MenuNode, type ModuleNode } from '@/lib/menu';
import { useTabs } from '@/lib/tabs';
import { useCurrentPath, useRoute } from '@/lib/route';
import { useModal } from './Modal';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { toast } from './toast';
import { Icon, iconForModule, iconForLeaf, type IconName } from './Icon';
import UserProfileModal from '@/app/cp_usersetting/FRMprofile_user';

const STORE_KEY = 'appcore::sidebar::collapsed';
// Batas yang sama antara JS (matchMedia) dan CSS media query di app/layout.tsx.
const MOBILE_MAX = 768;

// Dipakai halaman Home: setelah user klik kartu/chip menu, sidebar menutup
// semua grup kecuali jalur menu itu lalu scroll module-nya ke paling atas
// (pola event sama seperti toast/confirmDialog).
export function focusSidebar(mcontrol: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('appcore:sidebar-focus', { detail: { mcontrol } }));
}

function readCollapsed(): boolean {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean): void {
  try {
    if (v) localStorage.setItem(STORE_KEY, '1');
    else localStorage.removeItem(STORE_KEY);
  } catch { /* localStorage diblokir — abaikan */ }
}

// ModuleNode (dari CPMATRIX) diperlakukan sebagai grup level 0 agar bisa
// dirender dengan recursion yang sama seperti MenuNode.
function moduleAsNode(m: ModuleNode): MenuNode {
  return {
    code: m.code,
    mcode: m.code,
    mcontrol: '',
    name: m.name,
    expanded: true,
    leaf: false,
    menuKey: m.code,
    children: m.children,
    raw: {} as any,
  };
}

function iconOf(n: MenuNode, depth: number): IconName {
  if (depth === 0) return iconForModule(n.code);
  if (n.children.length) return 'folderOpen';
  return iconForLeaf(n.mcontrol);
}

// API yang dibuka ke top bar (tombol burger mobile).
export type SidebarApi = {
  toggleDrawer: () => void;
  closeDrawer: () => void;
};

type Props = {
  /** Nama aplikasi di header. */
  appName?: string;
};

const Sidebar = forwardRef<SidebarApi, Props>(function Sidebar({ appName = 'Tiket APP' }, ref) {
  const { profile, menus, logout, checkMenuAccess } = useAuth();
  const { navigate } = useRoute();
  const pathname = useCurrentPath();
  const { openTab } = useTabs();
  const { open } = useModal();
  const isNarrow = useIsNarrow(MOBILE_MAX);

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const inited = useRef(false);

  const nodes = useMemo(() => buildModuleTree(menus).map(moduleAsNode), [menus]);

  // Pilihan collapsed dibaca dari localStorage setelah mount (aman untuk SSR).
  useEffect(() => { setCollapsed(readCollapsed()); }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => { const next = !v; writeCollapsed(next); return next; });
  }, []);

  // Semua grup (Module Support, User Akses, dst) terbuka secara default.
  useEffect(() => {
    if (inited.current || !nodes.length) return;
    inited.current = true;
    const all = new Set<string>();
    const walk = (list: MenuNode[]) => list.forEach((n) => {
      if (!n.children.length) return;
      all.add(n.menuKey);
      walk(n.children);
    });
    walk(nodes);
    setOpenMenus(all);
  }, [nodes]);

  // Menu key milik grup yang memuat halaman aktif (untuk highlight saat collapsed).
  const activeKeys = useMemo(() => {
    const set = new Set<string>();
    const walk = (list: MenuNode[], trail: string[]) => {
      for (const n of list) {
        const t = [...trail, n.menuKey];
        if (n.children.length) { walk(n.children, t); continue; }
        if (n.mcontrol && '/' + n.mcontrol === pathname) t.forEach((k) => set.add(k));
      }
    };
    walk(nodes, []);
    return set;
  }, [nodes, pathname]);

  const closeAll = useCallback(() => {
    setDrawerOpen(false);
    setPopOpen(false);
    setTip(null);
  }, []);

  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);
  useImperativeHandle(ref, () => ({ toggleDrawer, closeDrawer: () => setDrawerOpen(false) }), [toggleDrawer]);

  // Ctrl+B / Cmd+B
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key !== 'b' && e.key !== 'B') return;
      e.preventDefault();
      if (isNarrow) setDrawerOpen((v) => !v);
      else toggleCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNarrow, toggleCollapsed]);

  // Esc menutup drawer / popup / tooltip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAll]);

  // Klik di luar menutup popup profil.
  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: PointerEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [popOpen]);

  const toggleGroup = (n: MenuNode) => {
    setTip(null);
    if (isNarrow) {
      setOpenMenus((prev) => {
        const next = new Set(prev);
        if (next.has(n.menuKey)) next.delete(n.menuKey); else next.add(n.menuKey);
        return next;
      });
      return;
    }
    // Saat collapsed: klik grup otomatis buka sidebar DAN buka grup tersebut.
    if (collapsed) {
      setCollapsed(false);
      writeCollapsed(false);
      setOpenMenus((prev) => new Set(prev).add(n.menuKey));
      return;
    }
    setOpenMenus((prev) => {
      const next = new Set(prev);
      if (next.has(n.menuKey)) next.delete(n.menuKey); else next.add(n.menuKey);
      return next;
    });
  };

  const clickLeaf = async (n: MenuNode) => {
    setTip(null);
    if (!n.mcontrol) {
      toast('Error', `menu Control: ${n.name} tidak ditemukan`, 'err');
      return;
    }
    if (n.mcode) {
      const ok = await checkMenuAccess(n.mcode);
      if (!ok) {
        toast('Error', 'Anda tidak memiliki hak akses untuk membuka menu ini.', 'err');
        return;
      }
    }
    const path = '/' + n.mcontrol;
    openTab(path);
    navigate(path);
    if (isNarrow) setDrawerOpen(false);
  };

  const goHome = () => {
    setTip(null);
    openTab('/');
    navigate('/');
    if (isNarrow) setDrawerOpen(false);
  };

  // Tutup semua grup kecuali jalur menuju mcontrol, lalu scroll module-nya
  // ke paling atas nav (smooth). Dipicu dari Home via focusSidebar().
  const focusMenu = useCallback((mcontrol: string) => {
    const mc = String(mcontrol || '').toLowerCase();
    if (!mc || mc === '-') return;
    const trail: string[] = [];
    let found = false;
    const walk = (list: MenuNode[], path: string[]) => {
      for (const n of list) {
        const t = [...path, n.menuKey];
        if (!n.children.length) {
          if (n.mcontrol === mc) { trail.push(...t); found = true; return; }
          continue;
        }
        walk(n.children, t);
        if (found) return;
      }
    };
    walk(nodes, []);
    if (!found) return;
    setOpenMenus(new Set(trail));
    if (collapsed) { setCollapsed(false); writeCollapsed(false); }
    if (isNarrow && !drawerOpen) setDrawerOpen(true);
    // Scroll module ke paling atas nav. Dijalankan 3 fase: langsung (respon
    // seketika), koreksi setelah animasi buka/tutup grup (220ms), dan jepit
    // akhir. Posisi diukur ulang tiap fase karena layout bergeser selama animasi.
    const doScroll = (smooth: boolean) => {
      const nav = navRef.current;
      if (!nav) return false;
      const el = nav.querySelector(`[data-menukey="${trail[0]}"]`);
      if (!el) return false;
      const max = nav.scrollHeight - nav.clientHeight;
      const top = (el as HTMLElement).getBoundingClientRect().top
        - nav.getBoundingClientRect().top + nav.scrollTop - 4;
      if (max > 0) nav.scrollTo({ top: Math.max(0, Math.min(top, max)), behavior: smooth ? 'smooth' : 'auto' });
      else (el as HTMLElement).scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      return true;
    };
    window.setTimeout(() => { doScroll(true); }, 100);
    window.setTimeout(() => { doScroll(true); }, 500);
    window.setTimeout(() => { doScroll(false); }, 1100);
  }, [nodes, collapsed, isNarrow, drawerOpen]);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent).detail as { mcontrol?: string };
      if (d?.mcontrol) focusMenu(d.mcontrol);
    };
    window.addEventListener('appcore:sidebar-focus', onFocus);
    return () => window.removeEventListener('appcore:sidebar-focus', onFocus);
  }, [focusMenu]);

  // Tooltip hanya saat collapsed (desktop).
  const showTip = (text: string, el: HTMLElement) => {
    if (isNarrow || !collapsed) return;
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2 });
  };

  const renderLevel = (list: MenuNode[], depth: number): React.ReactNode => (
    <ul className="sb-list">
      {list.map((n) => {
        const isGroup = n.children.length > 0;
        const open = isGroup && openMenus.has(n.menuKey);
        const active = !isGroup && !!n.mcontrol && '/' + n.mcontrol === pathname;
        const inPath = activeKeys.has(n.menuKey) && !active;
        const icon = iconOf(n, depth);
        const tipProps = isNarrow || collapsed ? {} : {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(n.name, e.currentTarget),
          onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(n.name, e.currentTarget),
          onMouseLeave: () => setTip(null),
          onBlur: () => setTip(null),
        };

        if (isGroup) {
          return (
            <li key={n.menuKey} className="sb-node" data-menukey={n.menuKey}>
              <button
                type="button"
                className={`sb-item sb-group${open ? ' open' : ''}${inPath ? ' has-active' : ''}`}
                aria-expanded={open}
                title={collapsed || isNarrow ? undefined : n.name}
                onClick={() => toggleGroup(n)}
                {...tipProps}
              >
                <span className="sb-ico"><Icon name={icon} size={18} /></span>
                <span className="sb-label">{n.name}</span>
                <span className="sb-chev"><Icon name="chevD" size={15} /></span>
              </button>
              <div className={`sb-sub${open ? ' open' : ''}`}>
                <div className="sb-sub-inner">{renderLevel(n.children, depth + 1)}</div>
              </div>
            </li>
          );
        }

        return (
          <li key={n.menuKey} className="sb-node">
            <button
              type="button"
              className={`sb-item sb-leaf${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={collapsed || isNarrow ? undefined : n.name}
              onClick={() => clickLeaf(n)}
              {...tipProps}
            >
              <span className="sb-ico"><Icon name={icon} size={17} /></span>
              <span className="sb-label">{n.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const homeActive = pathname === '/';
  const displayName = profile?.USERNAME || profile?.USERLOGIN || 'Guest User';
  const loginLabel = profile?.USERLOGIN || 'User Login';
  const initials = String(displayName).trim().slice(0, 2).toUpperCase() || 'GU';

  const toggleLabel = isNarrow
    ? 'Tutup menu navigasi'
    : collapsed ? 'Buka sidebar' : 'Ciutkan sidebar';

  const cls = [
    'sb',
    isNarrow ? 'sb-drawer' : 'sb-fixed',
    !isNarrow && collapsed ? 'sb-collapsed' : '',
    isNarrow && drawerOpen ? 'sb-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {isNarrow && drawerOpen && <div className="sb-overlay" onClick={() => setDrawerOpen(false)} aria-hidden />}

      <aside className={cls} aria-label="Navigasi utama">
        {/* HEADER: logo 40x40 gradasi + nama app + toggle (toggle di dalam sidebar) */}
        <div className="sb-head">
          <button
            type="button"
            className="sb-brand"
            aria-label={toggleLabel}
            onClick={() => (isNarrow ? setDrawerOpen(false) : toggleCollapsed())}
          >
            <span className="sb-logo">
              <span className="sb-logo-app"><Icon name="apps" size={20} /></span>
              <span className="sb-logo-tog"><Icon name="panel" size={20} /></span>
            </span>
            <span className="sb-appname">{appName}</span>
          </button>
          <button
            type="button"
            className="sb-toggle"
            aria-label={toggleLabel}
            onClick={() => (isNarrow ? setDrawerOpen(false) : toggleCollapsed())}
          >
            <Icon name="panel" size={18} />
          </button>
        </div>

        {/* NAV — Home dulu, baru label grup "Menu", lalu modul-grupnya */}
        <nav className="sb-nav" ref={navRef}>
          <ul className="sb-list">
            <li className="sb-node">
              <button
                type="button"
                className={`sb-item sb-leaf${homeActive ? ' active' : ''}`}
                aria-current={homeActive ? 'page' : undefined}
                title={!isNarrow && collapsed ? 'Home' : undefined}
                onClick={goHome}
              >
                <span className="sb-ico"><Icon name="home" size={18} /></span>
                <span className="sb-label">Home</span>
              </button>
            </li>
          </ul>
          <div className="sb-group-label">Menu</div>
          {renderLevel(nodes, 0)}
          {!nodes.length && (
            <p className="sb-empty"><Icon name="navStack" size={16} /> Belum ada menu.</p>
          )}
        </nav>

        {/* FOOTER: kartu profil + popup */}
        <div className="sb-foot" ref={footRef}>
          {popOpen && (
            <div className="sb-popup" role="menu" aria-label="Menu user">
              <button
                type="button"
                role="menuitem"
                className="sb-pop-item"
                onClick={() => {
                  setPopOpen(false);
                  if (isNarrow) setDrawerOpen(false);
                  open(<UserProfileModal />);
                }}
              >
                <Icon name="userCircle" size={16} />
                <span>User Profile</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="sb-pop-item danger"
                onClick={async () => { setPopOpen(false); await logout(); navigate('/login'); }}
              >
                <Icon name="logout" size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
          <button
            type="button"
            className="sb-profile"
            aria-haspopup="menu"
            aria-expanded={popOpen}
            aria-label={`Menu user ${displayName}`}
            onClick={() => setPopOpen((v) => !v)}
          >
            <span className="sb-avcol"><span className="sb-avatar">{initials}</span></span>
            <span className="sb-pinfo">
              <b>{displayName}</b>
              <small>{loginLabel}</small>
            </span>
            <span className="sb-pchev"><Icon name="select" size={15} /></span>
          </button>
        </div>
      </aside>

      {tip && (
        <div className="sb-tip" role="tooltip" style={{ top: tip.top }}>{tip.text}</div>
      )}
    </>
  );
});

export default Sidebar;