'use client';

import { useEffect, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { useDeviceStore } from '@/stores/device-store';

/** Client-side providers wrapper — initializes auth + device scan, wraps with Toast context. */
export default function Providers({ children }: { children: ReactNode }) {
  const init = useAuthStore((s) => s.init);
  const scan = useDeviceStore((s) => s.scan);

  useEffect(() => {
    init();
  }, [init]);

  // Device scan runs async after mount — does NOT block the app
  useEffect(() => {
    scan();
  }, [scan]);

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
