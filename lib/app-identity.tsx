// Identitas aplikasi dari General Setting (endpoint publik, tanpa login).
// Dibaca SEKALI saat boot, dipakai LoginPage, Sidebar, judul tab, favicon.
// Nilai cadangan = env (APP_NAME) bila pengaturan belum bisa dimuat.
'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiBase, APP_NAME } from './app-config';
import { apiPost } from './api';

export type AppIdentity = {
  name: string;
  slogan: string;
  logoUrl: string;
  faviconUrl: string;
};

const FALLBACK: AppIdentity = { name: APP_NAME, slogan: '', logoUrl: '', faviconUrl: '' };

// URL penuh file dari path relatif DB (mis. uploads/setting/x.png).
export function identityAssetUrl(path?: string | null): string {
  if (!path) return '';
  const root = apiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}

const Ctx = createContext<AppIdentity>(FALLBACK);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<AppIdentity>(FALLBACK);

  // Muat sekali saat boot; gagal = tetap fallback (tidak mengganggu login).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res: any = await apiPost('public/app-setting', {}, { skipAuthExpiredHandler: true });
        const row = (res?.Rows || [])[0] || {};
        if (!alive) return;
        setIdentity({
          name: String(row.APPNAME || '') || APP_NAME,
          slogan: String(row.SLOGAN || ''),
          logoUrl: identityAssetUrl(row.LOGO),
          faviconUrl: identityAssetUrl(row.FAVICON),
        });
      } catch { /* fallback env */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Judul tab + favicon mengikuti pengaturan (fallback = bawaan Next).
  useEffect(() => {
    try {
      document.title = identity.name;
      if (identity.faviconUrl) {
        let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = identity.faviconUrl;
      }
    } catch { /* abaikan */ }
  }, [identity]);

  return <Ctx.Provider value={identity}>{children}</Ctx.Provider>;
}

export function useAppIdentity(): AppIdentity {
  return useContext(Ctx);
}
