import type { Metadata } from 'next';
import { serverPortal } from '@/lib/portal/server';
import PortalHomeClient from './PortalHomeClient';

export const dynamic = 'force-dynamic';

// Identitas aplikasi diambil dari General Setting (T_APP_SETTING) lewat
// endpoint publik yang sama dengan yang dipakai Console.
export async function generateMetadata(): Promise<Metadata> {
  const s: any = await serverPortal('public/app-setting', {});
  const rows = (s?.Rows && s.Rows[0]) || s?.rows?.[0] || {};
  const name = String(rows.APPNAME || 'Tiket APP');
  return {
    title: name,
    description: String(rows.SLOGAN || 'Portal pembeli tiket & merchandise'),
  };
}

// Halaman publik dirender di sisi server: HTML pertama sudah berisi konten.
// Data tidak dimuat ulang di klien kecuali lewat tombol "coba lagi".
export default async function PortalHomePage() {
  const [home, cities, identity] = await Promise.all([
    serverPortal('portal/public/home', {}),
    serverPortal('portal/public/cities', {}),
    serverPortal('public/app-setting', {}),
  ]);

  const irow = (identity?.Rows && identity.Rows[0]) || identity?.rows?.[0] || {};
  const cityRows = (cities?.rows as any[]) || [];

  return (
    <PortalHomeClient
      initial={home || null}
      appName={String(irow.APPNAME || 'Tiket APP')}
      cities={cityRows.map((c) => ({
        CITYCODE: String(c.CITYCODE || ''),
        CITYNAME: String(c.CITYNAME || ''),
        CITYPROV: String(c.CITYPROV || ''),
      }))}
    />
  );
}