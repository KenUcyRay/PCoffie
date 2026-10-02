'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth, type LayoutMode } from '@/lib/auth';
import { useTabs } from '@/lib/tabs';
import { useCurrentPath } from '@/lib/route';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { toast } from './toast';
import { Icon, Btn } from './Icon';
import Sidebar, { type SidebarApi } from './Sidebar';
import TabStrip from './TabStrip';
import TopBar from './TopBar';
import { CommandPalette, PALETTE_EVENT } from './CommandPalette';
import { ContextMenuHost } from './ContextMenu';
import { NotifBridge } from './Notifs';

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

export function StandardShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = useCurrentPath();
  const { openTab } = useTabs();
  const sidebar = useRef<SidebarApi>(null);
  // Batas mobile sidebar = 768px (sama dengan CSS .sb-drawer).
  const isNarrow = useIsNarrow(768);

  useEffect(() => { if (pathname && pathname !== '/login') openTab(pathname); }, [pathname]);

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
          <TabStrip />
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

// Desktop shell baru (Linear/Stripe-style): sidebar fixed + top bar tipis
// (logo, search pemicu palette, notifikasi, profil) + strip tab + konten lega.
// StandardShell di atas tidak tersentuh.
export function DesktopShell({ title, children }: { title: string; children: React.ReactNode }) {
  const sidebar = useRef<SidebarApi>(null);
  const isNarrow = useIsNarrow(768);
  const [palOpen, setPalOpen] = useState(false);

  useEffect(() => {
    const onPal = () => setPalOpen((v) => !v);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPalOpen((v) => !v);
      }
    };
    window.addEventListener(PALETTE_EVENT, onPal);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(PALETTE_EVENT, onPal);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="layout desktop">
      <Sidebar ref={sidebar} variant="desktop" />

      <div className="dmain">
        <TopBar onBurger={() => sidebar.current?.toggleDrawer()} />
        <div className="tabbar dtabs">
          {isNarrow && <span className="topbar-title">{title}</span>}
          <TabStrip />
        </div>

        <div className="dcontent">{children}</div>
      </div>

      <CommandPalette open={palOpen} onClose={() => setPalOpen(false)} />
      <ContextMenuHost />
      <NotifBridge />
    </div>
  );
}