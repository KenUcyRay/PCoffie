// Pengganti UTIL.Auth + UTIL.AppRouter + UTIL.Session.
// Alur sesuai referensi: login -> me/reload -> shell; 401 -> expired.

'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiPost, getToken, setToken, SessionExpiredError } from './api';

export type Profile = {
  USERLOGIN?: string; USERNAME?: string; USERGROUP?: string; USEREMAIL?: string; GROUPMODEL?: string;
  [k: string]: any;
};
export type MenuRow = {
  MCODE: string; MPARRENT: string | number; MMODULE?: string; MNAME?: string; MCONTROL?: string;
  MSHORT?: string | number; CHECKED?: string; DEFSHORT?: string | number; DEFNAME?: string;
  MMODULE_SHORT?: string | number; MMODULE_NAME?: string;
  [k: string]: any;
};

// Mengikuti GROUPMODEL langit_v2: mode_desktop / mode_standard.
export type LayoutMode = 'mode_desktop' | 'mode_standard';

export function normalizeLayoutMode(v: unknown): LayoutMode {
  return String(v || '').toLowerCase() === 'mode_desktop' ? 'mode_desktop' : 'mode_standard';
}

type AuthState = {
  status: 'loading' | 'guest' | 'authenticated' | 'expired';
  profile: Profile | null;
  menus: MenuRow[];
  layoutMode: LayoutMode;
  // Bertambah setiap login berhasil. Dipakai sebagai React key agar isi
  // halaman (termasuk pesan error lama) di-mount ulang setelah login ulang,
  // sehingga halaman tidak lagi menampilkan pesan "sesi habis" padahal
  // sesi baru sudah aktif.
  sessionEpoch: number;
  login: (userlogin: string, userpassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<boolean>;
  changeLayout: (mode: LayoutMode) => Promise<void>;
  checkMenuAccess: (mcode: string) => Promise<boolean>;
};

const Ctx = createContext<AuthState | null>(null);

function decodeMaybe(v: any): any {
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : p; } catch { return v; }
  }
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const applyMeResult = (me: any): boolean => {
    const ok = me && (me.success === true || String(me.success).toLowerCase() === 'true');
    if (!ok) return false;
    let prof: any = decodeMaybe(me.profile ?? me.user ?? me.data);
    if (Array.isArray(prof)) prof = prof[0] ?? null;
    let flat: any[] = [];
    const h = decodeMaybe(me.dtmenu_header);
    const d = decodeMaybe(me.dtmenu);
    if (Array.isArray(h)) flat = flat.concat(h);
    if (Array.isArray(d)) flat = flat.concat(d);
    if (flat.length === 0 && Array.isArray(me.menus)) flat = me.menus;
    if (!prof) return false;
    setProfile(prof);
    setMenus(flat);
    return true;
  };

  const refreshMe = async (): Promise<boolean> => {
    if (!getToken()) { setStatus('guest'); return false; }
    try {
      const me: any = await apiPost('auth/me', { method: 'me' }, { skipAuthExpiredHandler: true });
      if (applyMeResult(me)) { setStatus('authenticated'); return true; }
    } catch { /* jatuh ke guest */ }
    setToken(null);
    setStatus('guest');
    return false;
  };

  const login = async (userlogin: string, userpassword: string) => {
    const res: any = await apiPost('auth/login', { method: 'login', userlogin, userpassword }, { skipAuthExpiredHandler: true });
    const ok = res && (res.success === true || String(res.success).toLowerCase() === 'true');
    if (!ok) throw new Error(res.message || res.msg || 'Username atau password tidak valid.');
    if (res.token) setToken(res.token);
    const me: any = await apiPost('auth/me', { method: 'me' }, { skipAuthExpiredHandler: true });
    if (!applyMeResult(me)) throw new Error(me.message || 'Sesi login tidak valid.');
    setStatus('authenticated');
    // Sesi baru = konten lama (state error "sesi habis" dll) dibuang.
    setSessionEpoch((n) => n + 1);
  };

  const logout = async () => {
    try { await apiPost('auth/logout', { method: 'logout' }, { skipAuthExpiredHandler: true }); } catch { /* tetap logout lokal */ }
    setToken(null);
    setProfile(null);
    setMenus([]);
    setStatus('guest');
  };

  // Tiruan change_to_layout referensi: simpan GROUPMODEL lalu muat ulang sesi.
  const changeLayout = async (mode: LayoutMode) => {
    const res: any = await apiPost('home/cpuser/cpuser', {
      method: 'change_layout',
      vdata: JSON.stringify({ mode_layout: mode }),
    });
    const ok = res && (res.success === true || String(res.success).toLowerCase() === 'true');
    if (!ok) throw new Error(res.message || 'Gagal mengubah mode layout.');
    await refreshMe();
  };

  // Tiruan validateMenuAccess: tanya server sebelum buka menu.
  const checkMenuAccess = async (mcode: string): Promise<boolean> => {
    try {
      const res: any = await apiPost('home/hak_akses/hak_akses', {
        method: 'menu_akses',
        vdata: JSON.stringify({ mcode }),
      });
      return !!res && (res.success === true || String(res.success).toLowerCase() === 'true');
    } catch {
      return false;
    }
  };

  useEffect(() => { refreshMe(); }, []);
  // Catatan: 401 dari request halaman biasa TIDAK menaikkan status 'expired'
  // (halaman menampilkan pesan server apa adanya). Hanya auth/me di watcher
  // bawah yang membuka dialog login ulang.
  // watcher sesi 30 dtk (pengganti UTIL.Session)
  useEffect(() => {
    const t = setInterval(async () => {
      if (status !== 'authenticated') return;
      try {
        await apiPost('auth/me', { method: 'me' });
      } catch (e) {
        if (e instanceof SessionExpiredError) setStatus((prev) => (prev === 'authenticated' ? 'expired' : prev));
      }
    }, 30000);
    return () => clearInterval(t);
  }, [status]);

  const layoutMode = normalizeLayoutMode(profile?.GROUPMODEL);

  return <Ctx.Provider value={{ status, profile, menus, layoutMode, sessionEpoch, login, logout, refreshMe, changeLayout, checkMenuAccess }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth di luar AuthProvider');
  return v;
}
