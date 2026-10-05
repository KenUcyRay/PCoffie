import type { Metadata } from 'next';
import { serverPortal } from '@/lib/portal/server';
import PortalHomeClient from './PortalHomeClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const s: any = await serverPortal('public/app-setting', {});
  const rows = (s?.Rows && s.Rows[0]) || s?.rows?.[0] || {};
  const name = String(rows.APPNAME || 'PCOFFIE');
  return {
    title: name,
    description: String(rows.SLOGAN || 'Sistem warnet PCOFFIE — kelola PC, paket, dan billing'),
  };
}

export default async function PortalHomePage() {
  const identity = await serverPortal('public/app-setting', {});
  const irow = (identity?.Rows && identity.Rows[0]) || identity?.rows?.[0] || {};
  return <PortalHomeClient appName={String(irow.APPNAME || 'PCOFFIE')} />;
}
