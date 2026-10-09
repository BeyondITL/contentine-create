'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton loader for the Stock Media page -- matches the real grid layout. */
export default function StockSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-5">
        <Skeleton className="w-40 h-7 rounded-lg mb-2" />
        <Skeleton className="w-64 h-4 rounded-md" />
      </div>

      {/* Search bar skeleton */}
      <Skeleton className="w-full h-[52px] md:h-[44px] rounded-xl mb-5" />

      {/* Media type tabs skeleton */}
      <div className="flex items-center gap-2 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="w-24 h-11 md:h-9 rounded-xl shrink-0" />
        ))}
      </div>

      {/* Source toggle skeleton */}
      <div className="flex items-center gap-2 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="w-20 h-9 rounded-lg shrink-0" />
        ))}
      </div>

      {/* Results grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bento-card overflow-hidden">
            <Skeleton className="w-full aspect-[4/3] !rounded-none" />
            <div className="p-3.5">
              <Skeleton className="w-3/4 h-4 rounded-md mb-2" />
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="w-16 h-5 rounded-full" />
                <Skeleton className="w-24 h-3 rounded-md" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="flex-1 h-8 rounded-lg" />
                <Skeleton className="w-20 h-8 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
