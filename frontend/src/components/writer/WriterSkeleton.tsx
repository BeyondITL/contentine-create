'use client';

import { Skeleton } from '@/components/ui';

/** Skeleton loader matching the AI Writer page layout with sidebar. */
export default function WriterSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-0">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-7 w-36 md:h-8 md:w-44 mb-2" />
        <Skeleton className="h-4 w-64 md:w-80" />
      </div>

      {/* Main layout: content + sidebar */}
      <div className="flex gap-6">
        {/* Left panel */}
        <div className="flex-1 min-w-0">
          {/* Content type grid skeleton */}
          <div className="mb-5">
            <Skeleton className="h-3.5 w-20 rounded-md mb-2.5" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bento-card p-3 md:p-4">
                  <Skeleton className="w-8 h-8 rounded-lg mb-2" />
                  <Skeleton className="w-16 h-3.5 rounded-md mb-1" />
                  <Skeleton className="w-full h-2.5 rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Topic textarea skeleton */}
          <div className="mb-4">
            <Skeleton className="h-3.5 w-12 rounded-md mb-1.5" />
            <Skeleton className="w-full h-[88px] rounded-xl" />
          </div>

          {/* Settings row skeleton */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 sm:max-w-[200px]">
              <Skeleton className="h-3.5 w-10 rounded-md mb-1.5" />
              <Skeleton className="w-full h-[44px] md:h-10 rounded-xl" />
            </div>
            <div className="flex-1 sm:max-w-[200px]">
              <Skeleton className="h-3.5 w-14 rounded-md mb-1.5" />
              <Skeleton className="w-full h-[44px] md:h-10 rounded-xl" />
            </div>
          </div>

          {/* Additional instructions toggle skeleton */}
          <div className="mb-5">
            <Skeleton className="h-4 w-28 rounded-md" />
          </div>

          {/* Generate button skeleton */}
          <Skeleton className="w-full h-[48px] rounded-xl" />
        </div>

        {/* Right sidebar — desktop only */}
        <aside className="hidden lg:block w-[300px] shrink-0">
          <Skeleton className="h-4 w-32 rounded-md mb-3" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-surface dark:bg-dark-secondary">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="w-14 h-5 rounded-md" />
                  <Skeleton className="w-10 h-3 rounded-md ml-auto" />
                </div>
                <Skeleton className="w-full h-3 rounded-md mb-1" />
                <Skeleton className="w-3/4 h-3 rounded-md" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
