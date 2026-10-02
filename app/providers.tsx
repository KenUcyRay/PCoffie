'use client';
import { AuthProvider } from '@/lib/auth';
import { TabProvider } from '@/lib/tabs';
import { RouteProvider } from '@/lib/route';
import { ModalProvider } from '@/components/Modal';
import { ToastHost } from '@/components/toast';
import { ConfirmHost } from '@/components/Confirm';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <RouteProvider>
      <AuthProvider>
        <TabProvider>
          <ModalProvider>
            {children}
            <ToastHost />
            <ConfirmHost />
          </ModalProvider>
        </TabProvider>
      </AuthProvider>
    </RouteProvider>
  );
}