'use client';

/**
 * Global app footer — carries the launch-compliance attributions that must be
 * visible app-wide:
 *  - "Built with Llama" (Meta Llama 3.2 Community License, R-80 / Law L4)
 *  - Link to the Notices & Licenses page (Apache/MIT/MPL/LGPL passthrough, R-81)
 *
 * Kept minimal and additive so it can sit at the bottom of the app content area
 * without disturbing the shell layout.
 */

import Link from 'next/link';
import BuiltWithLlama from '@/components/shared/BuiltWithLlama';

export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-8 pt-4 border-t border-black/[0.05] dark:border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-text-muted dark:text-white/40">
      <p>© {year} Contentine Create</p>
      <div className="flex items-center gap-4">
        <BuiltWithLlama variant="inline" />
        <Link
          href="/notices"
          className="hover:text-text-secondary dark:hover:text-white/70 transition-colors"
        >
          Notices &amp; Licenses
        </Link>
      </div>
    </footer>
  );
}
