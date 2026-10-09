'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton matching the analytics page layout. */
export default function AnalyticsSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <Skeleton className="w-28 h-6 rounded-lg mb-2" />
          <Skeleton className="w-44 h-3.5 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-20 h-9 rounded-lg" />
          <Skeleton className="w-20 h-9 rounded-lg" />
        </div>
      </div>

      {/* Date range pills */}
      <div className="flex gap-2 mb-5">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-16 h-8 rounded-full" />
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bento-card p-4 md:p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div>
                <Skeleton className="w-14 h-5 rounded-md mb-1.5" />
                <Skeleton className="w-20 h-3 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Views chart */}
        <div className="bento-card p-4 md:p-5">
          <Skeleton className="w-32 h-4 rounded-md mb-4" />
          <Skeleton className="w-full h-[200px] md:h-[300px] rounded-lg" />
        </div>
        {/* Platform breakdown */}
        <div className="bento-card p-4 md:p-5">
          <Skeleton className="w-40 h-4 rounded-md mb-4" />
          <Skeleton className="w-full h-[200px] md:h-[280px] rounded-lg" />
        </div>
      </div>

      {/* Table */}
      <div className="bento-card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
          <Skeleton className="w-36 h-4 rounded-md" />
        </div>
        <div className="px-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 border-b border-black/[0.02] dark:border-white/[0.02] last:border-0"
            >
              <Skeleton className="w-40 h-3.5 rounded-md" />
              <Skeleton className="w-16 h-5 rounded-full" />
              <Skeleton className="w-12 h-3.5 rounded-md ml-auto" />
              <Skeleton className="w-10 h-3.5 rounded-md" />
              <Skeleton className="w-10 h-3.5 rounded-md" />
              <Skeleton className="w-10 h-3.5 rounded-md" />
              <Skeleton className="w-10 h-3.5 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
