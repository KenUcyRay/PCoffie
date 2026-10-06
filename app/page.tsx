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
  const [identity, pakRes]: any[] = await Promise.all([
    serverPortal('public/app-setting', {}),
    serverPortal('portal/public/warnet-pakets', {}),
  ]);
  const irow = (identity?.Rows && identity.Rows[0]) || identity?.rows?.[0] || {};
  const pakets = (pakRes?.Rows || pakRes?.rows || []).map((x: any) => ({
    PAKETID: Number(x.PAKETID),
    KODE: String(x.KODE || ''),
    NAMA: String(x.NAMA || x.KODE || ''),
    ZONA: String(x.ZONA || 'REGULER'),
    DURASI_MENIT: Number(x.DURASI_MENIT || 60),
    HARGA: Number(x.HARGA || 0),
    DESKRIPSI: String(x.DESKRIPSI || ''),
    SORTNO: Number(x.SORTNO || 0),
  }));
  return <PortalHomeClient appName={String(irow.APPNAME || 'PCOFFIE')} pakets={pakets} />;
}
