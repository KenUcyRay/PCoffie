'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, type LayoutMode } from '@/lib/auth';
import { buildModuleTree, type MenuNode } from '@/lib/menu';
import { useTabs, routeFromPathname } from '@/lib/tabs';
import { useModal } from './Modal';
import UserProfileModal from '@/app/cp_usersetting/FRMprofile_user';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { toast } from './toast';
import { Icon, Btn, iconForModule, iconForLeaf } from './Icon';
import Sidebar, { type SidebarApi } from './Sidebar';

// Icon per module & per menu leaf dipetakan dari kode MMODULE/MCONTROL
// (src: components/Icon.tsx). Shell cukup memakai hasilnya.
const moduleIcon = iconForModule;
const leafIcon = iconForLeaf;

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="clock" />;
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const dmy = `${now.getDate()} ${now.toLocaleString('en-GB', { month: 'short' })} ${now.getFullYear()}`;
  return <span className="clock">{hhmm}<br />{dmy}</span>;
}

// Hanya satu dropdown Mode Layout yang boleh terbuka (appbar / drawer / bottombar).
const MODE_MENU_EVENT = 'appcore:mode-menu-open';

function ModeLayoutMenu({ compact, drop = 'up' }: { compact?: boolean; drop?: 'up' | 'down' }) {
  const { layoutMode, changeLayout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const options: { value: LayoutMode; label: string; icon: 'start' | 'layout' }[] = [
    { value: 'mode_desktop', label: 'Layout Desktop', icon: 'start' },
    { value: 'mode_standard', label: 'Layout Standard', icon: 'layout' },
  ];

  // tutup dropdown ini kalau dropdown Mode Layout lain dibuka
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(MODE_MENU_EVENT, close);
    return () => window.removeEventListener(MODE_MENU_EVENT, close);
  }, []);

  const toggle = () => {
    const next = !open;
    window.dispatchEvent(new Event(MODE_MENU_EVENT));
    setOpen(next);
  };

  const pick = async (value: LayoutMode) => {
    setOpen(false);
    if (value === layoutMode) return;
    setBusy(true);
    try {
      await changeLayout(value);
      window.location.reload();
    } catch (e: any) {
      toast('Error', e.message || 'Gagal mengubah mode layout.', 'err');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <Btn className={compact ? 'mode-compact' : ''} icon="gear" disabled={busy} onClick={toggle}>
        {compact ? 'Mode' : 'Mode Layout'}
        <Icon name="chevD" size={14} />
      </Btn>
      {open && (
        <div className={`dropdown${drop === 'down' ? ' down' : ''}`}>
          {options.map((o) => (
            <button
              key={o.value}
              className={`dropdown-item with-icon${o.value === layoutMode ? ' current' : ''}`}
              onClick={() => pick(o.value)}
            >
              <Icon name={o.icon} size={15} />
              <span>{o.label}</span>
              {o.value === layoutMode && <Icon name="check" size={15} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tree menu 2 tingkat: Module > Menu. Parent toggle buka/tutup, leaf buka tab.
function MenuTree({ onNavigate }: { onNavigate?: () => void }) {
  const { menus, checkMenuAccess } = useAuth();
  const router = useRouter();
  const { openTab } = useTabs();
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const pathname = routeFromPathname(usePathname());

  const modules = buildModuleTree(menus);

  useEffect(() => {
    if (!modules.length || ready) return;
    const m = new Set(modules.map((x) => x.code));
    const n = new Set<string>();
    const walk = (list: MenuNode[]) => list.forEach((c) => {
      if (c.expanded) n.add(c.menuKey);
      if (c.children.length) walk(c.children);
    });
    modules.forEach((mod) => walk(mod.children));
    setOpenModules(m);
    setOpenMenus(n);
    setReady(true);
  }, [modules, ready]);

  const toggleMenu = (node: MenuNode) => {
    setOpenMenus((prev) => {
      const next = new Set(prev);
      if (next.has(node.menuKey)) next.delete(node.menuKey); else next.add(node.menuKey);
      return next;
    });
  };

  const clickNode = async (node: MenuNode) => {
    if (node.children.length) { toggleMenu(node); return; }
    if (!node.mcontrol) { toast('Error', `menu Control: ${node.name} tidak ditemukan`, 'err'); return; }
    if (node.mcode) {
      const ok = await checkMenuAccess(node.mcode);
      if (!ok) { toast('Error', 'Anda tidak memiliki hak akses untuk membuka menu ini.', 'err'); return; }
    }
    const path = '/' + node.mcontrol;
    openTab(path);
    router.push(path);
    onNavigate?.();
  };

  const renderMenu = (list: MenuNode[]) => (
    <ul className="tree">
      {list.map((n) => (
        <li key={n.menuKey}>
          <button className="tree-row" onClick={() => clickNode(n)}>
            <span className="tree-caret">
              {n.children.length ? (
                <Icon name={openMenus.has(n.menuKey) ? 'chevD' : 'chevR'} size={12} />
              ) : (
                <Icon name={leafIcon(n.mcontrol)} size={14} />
              )}
            </span>
            <span className="tree-label">{n.name}</span>
          </button>
          {n.children.length > 0 && openMenus.has(n.menuKey) && renderMenu(n.children)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="menutree">
      <button
        className={`tree-row home${pathname === '/' ? ' active' : ''}`}
        onClick={() => { openTab('/'); router.push('/'); onNavigate?.(); }}
      >
        <span className="tree-caret"><Icon name="home" size={14} /></span>
        <span className="tree-label">Home</span>
      </button>
      {modules.map((mod) => (
        <div key={mod.code} className="module">
          <button className="tree-row module-row" onClick={() => setOpenModules((prev) => {
            const n = new Set(prev);
            if (n.has(mod.code)) n.delete(mod.code); else n.add(mod.code);
            return n;
          })}>
            <span className="tree-caret">
              <Icon name={openModules.has(mod.code) ? 'chevD' : 'chevR'} size={12} />
            </span>
            <Icon name={moduleIcon(mod.code)} size={15} />
            <span className="tree-label">{mod.name}</span>
          </button>
          {openModules.has(mod.code) && mod.children.length > 0 && renderMenu(mod.children)}
        </div>
      ))}
    </div>
  );
}

export function StandardShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const router = useRouter();
  const pathname = routeFromPathname(usePathname());
  const { tabs, openTab, closeTab } = useTabs();
  const { open } = useModal();
  const sidebar = useRef<SidebarApi>(null);
  // Batas mobile sidebar = 768px (sama dengan CSS .sb-drawer).
  const isNarrow = useIsNarrow(768);

  useEffect(() => { if (pathname && pathname !== '/login') openTab(pathname); }, [pathname]);

  const go = (path: string) => {
    openTab(path);
    router.push(path);
  };

  const close = (path: string) => {
    const idx = tabs.findIndex((t) => t.path === path);
    closeTab(path);
    if (pathname === path) {
      const fallback = tabs[Math.max(0, idx - 1)]?.path || '/';
      router.push(fallback);
    }
  };

  return (
    <div className="layout std">
      {/* Sidebar: panel fixed di desktop, drawer di mobile (<768px).
          Toggle desktop berada DI DALAM sidebar (header), bukan di top bar. */}
      <Sidebar ref={sidebar} />

      <div className="main">
        <div className="tabbar">
          {/* Burger HANYA untuk mobile — di desktop toggle-nya ada di header sidebar,
              supaya tidak ada dua tombol toggle. */}
          {isNarrow && (
            <button
              className="icon-btn toggle-side"
              aria-label="Buka menu navigasi"
              onClick={() => sidebar.current?.toggleDrawer()}
            ><Icon name="menu" size={19} /></button>
          )}
          {isNarrow && <span className="topbar-title">{title}</span>}
          {tabs.map((t) => (
            <span key={t.key} className={`tab${t.path === pathname ? ' active' : ''}`}>
              <button className="tab-label" onClick={() => go(t.path)}>{t.title}</button>
              {t.closable && (
                <button className="tab-x" aria-label={`Tutup ${t.title}`} onClick={() => close(t.path)}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </span>
          ))}
        </div>

        <div className="content">{children}</div>

        <div className="bottombar">
          <ModeLayoutMenu />
          <span className="spacer" />
          <Clock />
        </div>
      </div>
    </div>
  );
}

// (Mode mobile tidak ada — langit_v2 hanya punya mode_desktop & mode_standard.)

// Desktop shell (ala mode_desktop langit_v2): wallpaper + jendela halaman aktif
// + taskbar bawah dengan Start menu (memakai tree menu yang sama) & clock.
export function DesktopShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const router = useRouter();
  const { open } = useModal();
  const [startOpen, setStartOpen] = useState(false);

  return (
    <div className="layout desktop">
      <div className="desktop-area" onClick={() => setStartOpen(false)}>
        <div className="desktop-window" onClick={(e) => e.stopPropagation()}>
          <div className="desktop-window-title">
            <Icon name="layout" size={15} />
            <b>{title}</b>
            <span className="spacer" />
            <Btn icon="userCircle" onClick={() => open(<UserProfileModal />)}>Profile</Btn>
          </div>
          <div className="desktop-window-body">{children}</div>
        </div>

        {startOpen && (
          <div className="desktop-start" onClick={(e) => e.stopPropagation()}>
            <div className="desktop-start-head">
              <b>App Core</b>
              <span className="start-user">{profile?.USERNAME || profile?.USERLOGIN}</span>
            </div>
            <div className="desktop-start-menu">
              <MenuTree onNavigate={() => setStartOpen(false)} />
            </div>
            <div className="desktop-start-foot">
              <ModeLayoutMenu />
            </div>
          </div>
        )}
      </div>

      <div className="desktop-taskbar">
        <Btn className="taskbar-start" icon="start" onClick={() => setStartOpen((v) => !v)}>Start</Btn>
        <span className="spacer" />
        <ModeLayoutMenu compact />
        <Btn icon="userCircle" onClick={() => open(<UserProfileModal />)}>Profile</Btn>
        <Btn icon="logout" onClick={async () => { await logout(); router.replace('/login'); }}>Logout</Btn>
        <Clock />
      </div>
    </div>
  );
}