'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Rute "internal" ala langit_v2: index.html punya <body> kosong dan URL tidak
// pernah berubah. Pindah halaman = ganti komponen di dalam viewport, bukan
// pindah URL. Di sini satu-satunya route Next adalah "/", sedangkan halaman yang
// aktif disimpan di state (HOME / LOGIN / "/<mcontrol>").
//
// Bentuk nilainya sengaja dibuat sama dengan pathname lama ("/", "/login",
// "/cp_usergroup") supaya logika sidebar/tab tidak perlu disentuh.

const STORE_KEY = 'appcore::route';

export const HOME = '/';
export const LOGIN = '/login';

type RouteState = {
  current: string;
  navigate: (to: string) => void;
  ready: boolean;
};

const Ctx = createContext<RouteState | null>(null);

// Buang trailing slash supaya "/cp_usersetting/" dan "/cp_usersetting" dianggap sama.
function normalize(to: string): string {
  const p = String(to == null ? '' : to);
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  return trimmed || HOME;
}

export function RouteProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<string>(HOME);
  const [ready, setReady] = useState(false);

  // Baca posisi tersimpan di dalam effect, BUKAN saat render: page.tsx di
  // prerender di server sedangkan sessionStorage hanya ada di browser. Kalau
  // state diinisialisasi langsung dari storage, HTML server dan client beda
  // sehingga hydration error. Pakai gate `ready` di page.tsx sebagai gantinya.
  useEffect(() => {
    let restored = HOME;
    try {
      const saved = window.sessionStorage.getItem(STORE_KEY);
      if (saved) restored = normalize(saved);
    } catch {
      // sessionStorage bisa diblokir (mis. cookie diblokir) -> pakai HOME
    }
    setCurrent(restored);
    setReady(true);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = normalize(to);
    setCurrent(next);
    try {
      if (next === HOME) window.sessionStorage.removeItem(STORE_KEY);
      else window.sessionStorage.setItem(STORE_KEY, next);
    } catch {
      // abaikan: tetap pindah halaman walau storage tidak bisa ditulis
    }
  }, []);

  return <Ctx.Provider value={{ current, navigate, ready }}>{children}</Ctx.Provider>;
}

export function useRoute(): RouteState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRoute di luar RouteProvider');
  return v;
}

// Dipakai Sidebar & Shells menggantikan usePathname(). Nilai stringnya sama
// dengan pathname lama, jadi perbandingan active/highlight tidak berubah.
export function useCurrentPath(): string {
  return useRoute().current;
}