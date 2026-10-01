'use client';
import { useAuth } from '@/lib/auth';
import { StandardShell, DesktopShell } from './Shells';
import ExpiredDialog from './ExpiredDialog';

// Dispatcher: pilih Desktop / Standard sesuai GROUPMODEL (tiruan AppRouter.showMainPage),
// plus dialog sesi habis (tiruan LoginExpired).
export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { layoutMode } = useAuth();
  const shell = layoutMode === 'mode_desktop'
    ? <DesktopShell title={title}>{children}</DesktopShell>
    : <StandardShell title={title}>{children}</StandardShell>;
  return (<>{shell}<ExpiredDialog /></>);
}
