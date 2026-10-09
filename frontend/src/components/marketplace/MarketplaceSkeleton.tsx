'use client';

import Skeleton from '@/components/ui/Skeleton';

/** Skeleton for the marketplace grid — matches the listing card layout exactly. */
export default function MarketplaceSkeleton() {
  return (
    <div className="max-w-[1280px] mx-auto">
      {/* Hero banner skeleton */}
      <div className="rounded-2xl bg-[#0A0A0A] dark:bg-[#111] p-6 md:p-8 mb-6">
        <Skeleton className="w-48 h-7 rounded-lg mb-2 !bg-white/[0.08]" />
        <Skeleton className="w-72 md:w-96 h-4 rounded-lg !bg-white/[0.05]" />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-5">
        <Skeleton className="w-full md:w-56 h-10 rounded-xl" />
        <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="w-20 h-8 rounded-full shrink-0" />
          ))}
        </div>
        <Skeleton className="w-32 h-9 rounded-lg md:ml-auto" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-black/[0.05] dark:border-white/[0.05] overflow-hidden bg-white dark:bg-dark-secondary"
          >
            <Skeleton className="w-full aspect-video !rounded-none" />
            <div className="p-3.5">
              <Skeleton className="w-3/4 h-4 rounded-md mb-2" />
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="w-16 h-3 rounded-md" />
                <div className="flex items-center gap-2">
                  <Skeleton className="w-10 h-3 rounded-md" />
                  <Skeleton className="w-8 h-3 rounded-md" />
                </div>
              </div>
              <Skeleton className="w-full h-9 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the listing detail view. */
export function ListingDetailSkeleton() {
  return (
    <div className="max-w-[900px] mx-auto">
      {/* Back link */}
      <Skeleton className="w-28 h-4 rounded-md mb-5" />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Left: Preview */}
        <div className="md:col-span-3">
          <Skeleton className="w-full aspect-video rounded-2xl mb-4" />
          <Skeleton className="w-full h-4 rounded-md mb-2" />
          <Skeleton className="w-3/4 h-4 rounded-md mb-2" />
          <Skeleton className="w-1/2 h-4 rounded-md" />
        </div>

        {/* Right: Info panel */}
        <div className="md:col-span-2">
          <div className="bento-card p-5">
            <Skeleton className="w-full h-6 rounded-lg mb-3" />
            <Skeleton className="w-24 h-8 rounded-lg mb-4" />
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="w-16 h-4 rounded-md" />
              <Skeleton className="w-12 h-4 rounded-md" />
            </div>
            <Skeleton className="w-full h-11 rounded-xl mb-3" />
            <Skeleton className="w-full h-px mb-3" />
            <Skeleton className="w-20 h-3 rounded-md mb-2" />
            <Skeleton className="w-32 h-4 rounded-md" />
          </div>
        </div>
      </div>

      {/* Reviews skeleton */}
      <div className="mt-8">
        <Skeleton className="w-24 h-5 rounded-md mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 mb-4">
            <Skeleton className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1">
              <Skeleton className="w-24 h-3 rounded-md mb-1.5" />
              <Skeleton className="w-16 h-3 rounded-md mb-2" />
              <Skeleton className="w-full h-3 rounded-md mb-1" />
              <Skeleton className="w-2/3 h-3 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
