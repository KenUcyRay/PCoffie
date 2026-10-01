'use client';
import { AuthProvider } from '@/lib/auth';
import { TabProvider } from '@/lib/tabs';
import { ModalProvider } from '@/components/Modal';
import { ToastHost } from '@/components/toast';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TabProvider>
        <ModalProvider>
          {children}
          <ToastHost />
        </ModalProvider>
      </TabProvider>
    </AuthProvider>
  );
}