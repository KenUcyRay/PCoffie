'use client';
import { useParams } from 'next/navigation';
import MenuHost from '@/components/MenuHost';

// Satu rute dinamis untuk semua menu (ala langit_v2: MCONTROL -> folder).
// /cp_usersetting -> menus/cp_usersetting/cp_usersetting.tsx, dst.
export default function MenuPage() {
  const params = useParams<{ mcontrol?: string }>();
  const mcontrol = String(params?.mcontrol || '').toLowerCase();
  return <MenuHost mcontrol={mcontrol} />;
}