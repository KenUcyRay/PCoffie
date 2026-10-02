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

// Tab.path sekarang adalah key logis dari state internal (lib/route), bukan
// URL.Nilainya tetap "/", "/<mcontrol>" supaya judul tab & logika tetap sama.

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

  // Sinkronkan tab dengan halaman aktif dilakukan di StandardShell, karena
  // hanya di situ nilai `pathname` dari state internal tersedia.
  return <Ctx.Provider value={{ tabs, activePath, openTab, closeTab }}>{children}</Ctx.Provider>;
}

export function useTabs(): TabState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTabs di luar TabProvider');
  return v;
}