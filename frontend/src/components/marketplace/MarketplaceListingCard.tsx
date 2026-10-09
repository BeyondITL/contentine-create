'use client';

import { Star, Download, ShoppingCart, CheckCircle } from 'lucide-react';
import type { MarketplaceListing, MarketplaceCategory } from '@/types';

interface MarketplaceListingCardProps {
  listing: MarketplaceListing;
  isPurchased: boolean;
  onSelect: () => void;
  onBuy: () => void;
}

/** Category label + color mapping. */
const CATEGORY_MAP: Record<MarketplaceCategory, { label: string; color: string; bg: string }> = {
  templates: { label: 'Template', color: '#00C3FF', bg: 'rgba(0,195,255,0.08)' },
  prompts: { label: 'Prompt', color: '#F3A6FF', bg: 'rgba(243,166,255,0.08)' },
  voices: { label: 'Voice', color: '#35C838', bg: 'rgba(53,200,56,0.08)' },
  styles: { label: 'Style', color: '#F39C12', bg: 'rgba(243,156,18,0.08)' },
};

/** Format cents to a readable dollar price. */
function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format download count with K/M suffix. */
function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/** Marketplace listing card with preview, price, rating, and buy action. */
export default function MarketplaceListingCard({
  listing,
  isPurchased,
  onSelect,
  onBuy,
}: MarketplaceListingCardProps) {
  const cat = CATEGORY_MAP[listing.category] ?? CATEGORY_MAP.templates;

  return (
    <div
      className="bento-card overflow-hidden group cursor-pointer"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`View ${listing.title}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      {/* Preview thumbnail */}
      <div className="relative w-full aspect-video bg-black/[0.02] dark:bg-white/[0.02] overflow-hidden">
        {listing.preview_url ? (
          <img
            src={listing.preview_url}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
            <span className="text-[32px] opacity-30">
              {listing.category === 'templates' && '\u2756'}
              {listing.category === 'prompts' && '\u2728'}
              {listing.category === 'voices' && '\u266B'}
              {listing.category === 'styles' && '\u2B50'}
            </span>
          </div>
        )}

        {/* Category badge overlay */}
        <span
          className="absolute top-2.5 left-2.5 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm"
          style={{ backgroundColor: cat.bg, color: cat.color }}
        >
          {cat.label}
        </span>

        {/* Price overlay */}
        <span className="absolute top-2.5 right-2.5 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/90 dark:bg-black/70 text-text dark:text-white backdrop-blur-sm">
          {formatPrice(listing.price_cents)}
        </span>
      </div>

      {/* Card body */}
      <div className="p-3.5">
        {/* Title */}
        <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] leading-snug line-clamp-1 mb-1.5">
          {listing.title}
        </h3>

        {/* Seller + rating row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Seller */}
          <span className="text-[11px] text-text-muted truncate max-w-[50%]">
            {listing.seller_name ?? 'Creator'}
          </span>

          {/* Rating + downloads */}
          <div className="flex items-center gap-2.5 shrink-0">
            {listing.rating_count > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-text-muted">
                <Star size={11} className="text-warning fill-warning" />
                <span className="font-medium text-text dark:text-[#E0E0E0]">{listing.rating_avg.toFixed(1)}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 text-[11px] text-text-muted">
              <Download size={10} />
              {formatDownloads(listing.downloads)}
            </span>
          </div>
        </div>

        {/* Action */}
        {isPurchased ? (
          <span className="
            inline-flex items-center gap-1.5 w-full justify-center
            px-3 py-2 min-h-[44px] md:min-h-0
            rounded-xl text-[12px] font-semibold
            bg-secondary/[0.06] text-secondary dark:bg-secondary/[0.1] dark:text-secondary
          ">
            <CheckCircle size={13} />
            Purchased
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBuy();
            }}
            className="
              inline-flex items-center gap-1.5 w-full justify-center
              px-3 py-2 min-h-[44px] md:min-h-0
              rounded-xl text-[12px] font-semibold
              bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
              hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
              active:scale-[0.97] transition-all duration-200 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
          >
            <ShoppingCart size={13} />
            {listing.price_cents === 0 ? 'Get Free' : `Buy ${formatPrice(listing.price_cents)}`}
          </button>
        )}
      </div>
    </div>
  );
}
