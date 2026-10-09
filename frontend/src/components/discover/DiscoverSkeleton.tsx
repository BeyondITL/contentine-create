'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton loader for the Discover Ideas page — matches the real layout. */
export default function DiscoverSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <Skeleton className="w-40 h-7 rounded-lg mb-2" />
          <Skeleton className="w-56 h-4 rounded-md" />
        </div>
      </div>

      {/* Search bar skeleton */}
      <Skeleton className="w-full h-[52px] md:h-[44px] rounded-xl mb-5" />

      {/* Platform tabs skeleton */}
      <div className="flex items-center gap-2 overflow-hidden mb-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="w-24 h-11 md:h-9 rounded-xl shrink-0" />
        ))}
      </div>

      {/* View toggle skeleton */}
      <div className="flex items-center gap-2 mb-5">
        <Skeleton className="w-20 h-9 rounded-lg" />
        <Skeleton className="w-24 h-9 rounded-lg" />
      </div>

      {/* Results grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bento-card p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <Skeleton className="w-full h-4 rounded-md mb-1.5" />
                <Skeleton className="w-3/4 h-4 rounded-md" />
              </div>
              <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
            </div>
            <Skeleton className="w-20 h-5 rounded-full mb-2.5" />
            <Skeleton className="w-full h-3 rounded-md mb-1" />
            <Skeleton className="w-2/3 h-3 rounded-md mb-4" />
            <div className="flex items-center justify-between">
              <Skeleton className="w-16 h-4 rounded-md" />
              <Skeleton className="w-24 h-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
