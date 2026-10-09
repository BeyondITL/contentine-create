'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton matching the team page layout. */
export default function TeamSkeleton() {
  return (
    <div className="max-w-[900px] mx-auto animate-pulse">
      {/* Header — matches page header: icon + "Team" */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="w-5 h-5 rounded" />
        <Skeleton className="w-16 h-6 rounded-lg" />
      </div>

      {/* Team info card */}
      <div className="bento-card p-5 mb-5">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div>
            <Skeleton className="w-32 h-5 rounded-md mb-1.5" />
            <Skeleton className="w-48 h-3 rounded-md" />
          </div>
        </div>
      </div>

      {/* Invite form */}
      <div className="bento-card p-5 mb-5">
        <Skeleton className="w-40 h-4 rounded-md mb-3" />
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="flex-1 h-11 rounded-xl" />
          <Skeleton className="w-36 h-11 rounded-xl" />
          <Skeleton className="w-32 h-11 rounded-xl" />
        </div>
      </div>

      {/* Members list */}
      <div className="bento-card overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
          <Skeleton className="w-24 h-4 rounded-md" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-3 border-b border-black/[0.02] dark:border-white/[0.02] last:border-0"
          >
            <Skeleton className="w-9 h-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="w-28 h-3.5 rounded-md mb-1.5" />
              <Skeleton className="w-40 h-3 rounded-md" />
            </div>
            <Skeleton className="w-14 h-5 rounded-full hidden sm:block" />
            <Skeleton className="w-20 h-3 rounded-md hidden md:block" />
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div className="bento-card overflow-hidden">
        <div className="px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
          <Skeleton className="w-32 h-4 rounded-md" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-5 py-3 border-b border-black/[0.02] dark:border-white/[0.02] last:border-0"
          >
            <Skeleton className="w-2 h-2 rounded-full mt-1.5" />
            <div className="flex-1">
              <Skeleton className="w-56 h-3 rounded-md mb-1.5" />
              <Skeleton className="w-16 h-2.5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
