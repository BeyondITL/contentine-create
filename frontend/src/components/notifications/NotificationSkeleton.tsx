'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton loader for the full notifications page — matches the real card layout. */
export default function NotificationSkeleton() {
  return (
    <div className="max-w-[720px]">
      {/* Page heading */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-xl" />
          <Skeleton className="w-32 h-6 rounded-lg" />
        </div>
        <Skeleton className="w-28 h-9 rounded-lg" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        <Skeleton className="w-14 h-8 rounded-full" />
        <Skeleton className="w-20 h-8 rounded-full" />
      </div>

      {/* Notification cards */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bento-card p-4 cursor-default">
            <div className="flex items-start gap-3.5">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <Skeleton className="w-40 h-4 rounded-md" />
                  <Skeleton className="w-16 h-3 rounded-md shrink-0" />
                </div>
                <Skeleton className="w-full max-w-[320px] h-3 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
