'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton matching the settings page layout — sidebar tabs + content area. */
export default function SettingsSkeleton() {
  return (
    <div className="max-w-[960px] mx-auto animate-pulse">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-5 md:mb-6">
        <Skeleton className="w-5 h-5 rounded" />
        <Skeleton className="w-20 h-6 rounded-lg" />
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Mobile tab pills */}
        <div className="flex md:hidden gap-1.5 overflow-hidden pb-1">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-24 h-10 rounded-xl shrink-0" />
          ))}
        </div>

        {/* Desktop sidebar tabs */}
        <div className="hidden md:flex flex-col gap-1 w-48 shrink-0">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-full h-10 rounded-xl" />
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Profile card skeleton */}
          <div className="bento-card p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="w-36 h-4 rounded-md" />
            </div>

            {/* Name field */}
            <div className="mb-4">
              <Skeleton className="w-24 h-3 rounded-md mb-1.5" />
              <Skeleton className="w-full h-11 rounded-xl" />
            </div>

            {/* Email field */}
            <div className="mb-4">
              <Skeleton className="w-28 h-3 rounded-md mb-1.5" />
              <Skeleton className="w-full h-11 rounded-xl" />
            </div>

            {/* Timezone field */}
            <div className="mb-4">
              <Skeleton className="w-20 h-3 rounded-md mb-1.5" />
              <Skeleton className="w-full h-11 rounded-xl" />
            </div>

            {/* Created date */}
            <Skeleton className="w-40 h-3 rounded-md mb-4" />

            {/* Save button */}
            <Skeleton className="w-32 h-10 rounded-xl" />
          </div>

          {/* Danger zone skeleton */}
          <div className="bento-card p-4 md:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="w-24 h-4 rounded-md" />
            </div>
            <Skeleton className="w-64 h-3 rounded-md mb-4" />
            <Skeleton className="w-36 h-10 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
