'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton loader for the calendar page — matches the real calendar layout. */
export default function CalendarSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <Skeleton className="w-32 h-7 rounded-lg mb-2" />
          <Skeleton className="w-48 h-4 rounded-md" />
        </div>
        <Skeleton className="w-36 h-10 rounded-xl" />
      </div>

      {/* Toolbar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <Skeleton className="w-11 h-11 md:w-9 md:h-9 rounded-lg" />
          <Skeleton className="w-24 h-11 md:h-9 rounded-lg" />
          <Skeleton className="w-11 h-11 md:w-9 md:h-9 rounded-lg" />
        </div>
        {/* Platform pills */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="w-20 h-11 md:h-7 rounded-full shrink-0" />
          ))}
        </div>
      </div>

      {/* Main area: Calendar grid + Side panel */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Calendar grid skeleton */}
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-2 sm:p-3 md:p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-2">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                <div key={idx} className="text-center py-2">
                  <Skeleton className="w-4 sm:w-8 h-3 rounded mx-auto" />
                </div>
              ))}
            </div>
            {/* 1 week on mobile, 5 weeks on desktop */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className={`min-h-[44px] sm:min-h-[72px] p-1.5 sm:p-2 rounded-lg ${i >= 7 ? 'hidden sm:block' : ''}`}>
                  <Skeleton className="w-6 h-4 rounded mb-2" />
                  <div className="flex gap-1">
                    {i % 3 === 0 && <Skeleton className="w-2.5 sm:w-2 h-2.5 sm:h-2 rounded-full" />}
                    {i % 5 === 0 && <Skeleton className="w-2.5 sm:w-2 h-2.5 sm:h-2 rounded-full" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side panel skeleton */}
        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-3 sm:p-4">
            <Skeleton className="w-48 h-5 rounded-md mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface dark:bg-[#151515]">
                  <Skeleton className="w-12 h-12 rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="w-28 h-4 rounded mb-1.5" />
                    <Skeleton className="w-20 h-3 rounded" />
                  </div>
                  <Skeleton className="w-14 h-5 rounded-full" />
                </div>
              ))}
            </div>
            <Skeleton className="w-full h-11 md:h-10 rounded-xl mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
