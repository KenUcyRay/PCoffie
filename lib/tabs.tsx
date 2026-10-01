'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth';

export type Tab = { key: string; path: string; title: string; closable: boolean };

type TabState = {
  tabs: Tab[];
  activePath: string;
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
};

const Ctx = createContext<TabState | null>(null);

const HOME: Tab = { key: 'home', path: '/', title: 'Home', closable: false };

export const APP_BASE_PATH = '/app-core';

// Ubah pathname dari router (mengandung basePath + trailing slash) jadi rute app.
// contoh: "/app-core/cp_usersetting/" -> "/cp_usersetting"
export function routeFromPathname(pathname: string | null): string {
  let p = String(pathname || '/');
  if (p.startsWith(APP_BASE_PATH)) p = p.slice(APP_BASE_PATH.length);
  p = p.replace(/\/+$/, '');
  return p || '/';
}

// Judul tab default dari mcontrol kalau MNAME tidak ada di dtmenu.
function titleCase(key: string) {
  return String(key || '')
    .split(/[_-]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Tiruan tabpanel mode_standard: tab Home permanen + tab per menu yang diklik,
// dedupe by path. Judul tab dari MNAME (dtmenu), fallback ke mcontrol.
export function TabProvider({ children }: { children: React.ReactNode }) {
  const { menus } = useAuth();
  const [tabs, setTabs] = useState<Tab[]>([HOME]);
  const [activePath, setActivePath] = useState<string>('/');

  const titleFor = (path: string) => {
    if (!path || path === '/') return 'Home';
    const mcontrol = path.replace(/^\//, '').toLowerCase();
    const row: any = (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mcontrol);
    return String(row?.MNAME || titleCase(mcontrol) || 'Application');
  };

  const openTab = (path: string) => {
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { key: path, path, title: titleFor(path), closable: path !== '/' }];
    });
    setActivePath(path);
  };

  const closeTab = (path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.path !== path);
      if (activePath === path) {
        const fallback = next[Math.max(0, idx - 1)]?.path || '/';
        setActivePath(fallback);
      }
      return next;
    });
  };

  // Judul tab menyusul setelah dtmenu termuat (MNAME).
  useEffect(() => {
    setTabs((prev) => prev.map((t) => (t.title === titleFor(t.path) ? t : { ...t, title: titleFor(t.path) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus]);

  // sinkronkan dengan navigasi router (mis. tombol back browser)
  useEffect(() => {
    const onPop = () => {
      const p = routeFromPathname(window.location.pathname);
      if (p) openTab(p);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Ctx.Provider value={{ tabs, activePath, openTab, closeTab }}>{children}</Ctx.Provider>;
}

export function useTabs(): TabState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTabs di luar TabProvider');
  return v;
}