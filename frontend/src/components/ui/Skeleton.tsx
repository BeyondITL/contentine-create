'use client';

interface SkeletonProps {
  className?: string;
}

/** Single skeleton block — compose these to match real layouts. */
export default function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-black/[0.04] dark:bg-white/[0.06] rounded-lg ${className}`} />
  );
}

/** Skeleton for a stat card — matches the dashboard stat tile layout. */
export function StatSkeleton() {
  return (
    <div className="bento-card p-5 cursor-default">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div>
          <Skeleton className="w-12 h-6 rounded-md mb-1.5" />
          <Skeleton className="w-20 h-3 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for an action card — matches the dashboard quick-action layout. */
export function ActionCardSkeleton() {
  return (
    <div className="bento-card p-5 cursor-default">
      <Skeleton className="w-9 h-9 rounded-xl mb-4" />
      <Skeleton className="w-24 h-4 rounded-md mb-1.5" />
      <Skeleton className="w-36 h-3 rounded-md" />
    </div>
  );
}

/** Skeleton for a list row. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <Skeleton className="w-6 h-6 rounded-md" />
      <div className="flex-1">
        <Skeleton className="w-40 h-3.5 rounded-md mb-1.5" />
        <Skeleton className="w-56 h-3 rounded-md" />
      </div>
      <Skeleton className="w-4 h-4 rounded" />
    </div>
  );
}

/** Skeleton for the hero card. */
export function HeroSkeleton() {
  return (
    <div className="rounded-2xl bg-[#0A0A0A] p-5 md:p-7 min-h-[180px] md:min-h-[200px] flex flex-col justify-between">
      <div>
        <Skeleton className="w-28 h-5 rounded-full mb-4 !bg-white/[0.06]" />
        <Skeleton className="w-48 md:w-64 h-6 md:h-7 rounded-lg mb-2 !bg-white/[0.08]" />
        <Skeleton className="w-64 md:w-80 h-4 rounded-lg !bg-white/[0.05]" />
      </div>
      <div className="flex gap-2.5 mt-5">
        <Skeleton className="w-32 h-10 md:h-9 rounded-xl !bg-white/[0.08]" />
        <Skeleton className="w-32 md:w-40 h-4 rounded-lg !bg-white/[0.04] self-center" />
      </div>
    </div>
  );
}

/** Video grid skeleton — matches the My Videos page layout. */
export function VideoGridSkeleton() {
  return (
    <div className="max-w-[1280px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="w-28 h-6 rounded-lg mb-2" />
          <Skeleton className="w-16 h-3 rounded-md" />
        </div>
        <Skeleton className="w-32 h-10 rounded-lg" />
      </div>
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-5">
        <Skeleton className="w-full md:w-48 h-9 rounded-lg" />
        <div className="flex gap-1 overflow-x-auto w-full md:w-auto">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="w-16 h-7 rounded-full shrink-0" />)}
        </div>
        <Skeleton className="w-16 h-8 rounded-lg md:ml-auto" />
      </div>
      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
            <Skeleton className="w-full aspect-video !rounded-none" />
            <div className="p-3">
              <Skeleton className="w-32 h-4 rounded-md mb-2" />
              <div className="flex items-center justify-between">
                <Skeleton className="w-16 h-5 rounded-full" />
                <Skeleton className="w-12 h-3 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full dashboard skeleton — compose all pieces into the real bento grid layout. */
export function DashboardSkeleton() {
  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <Skeleton className="w-28 md:w-32 h-5 md:h-6 rounded-lg mb-2" />
        <Skeleton className="w-56 md:w-64 h-4 rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 auto-rows-min">
        <div className="col-span-1 md:col-span-7"><HeroSkeleton /></div>
        <div className="col-span-1 md:col-span-5 bento-card p-5 md:p-6 cursor-default">
          <Skeleton className="w-9 h-9 rounded-xl mb-5" />
          <Skeleton className="w-24 h-4 rounded-md mb-1.5" />
          <Skeleton className="w-48 h-3 rounded-md mb-5" />
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="w-14 h-5 rounded-md" />)}
          </div>
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="col-span-1 md:col-span-4"><StatSkeleton /></div>)}
        {[1, 2, 3].map((i) => <div key={i} className="col-span-1 md:col-span-4"><ActionCardSkeleton /></div>)}
      </div>
    </div>
  );
}
