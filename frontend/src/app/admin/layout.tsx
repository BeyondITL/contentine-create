'use client';

import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Admin layout — redirects non-admins to dashboard. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/');
    }
  }, [loading, isAdmin, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="space-y-4 w-full max-w-2xl px-6">
          <div className="h-8 bg-border/30 rounded-lg animate-pulse w-48" />
          <div className="h-64 bg-border/20 rounded-xl animate-pulse" />
          <div className="h-48 bg-border/20 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
