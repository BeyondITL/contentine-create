'use client';

import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  Star,
  Download,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  User,
  RefreshCw,
} from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplace-store';
import { ListingDetailSkeleton } from '@/components/marketplace/MarketplaceSkeleton';
import type { MarketplaceCategory } from '@/types';

interface ListingDetailProps {
  onBack: () => void;
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

/** Format a date string to human-readable form. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Render star rating as a visual row. */
function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? 'text-warning fill-warning' : 'text-black/10 dark:text-white/10'}
        />
      ))}
    </span>
  );
}

/** Full detail view for a single marketplace listing. */
export default function ListingDetail({ onBack }: ListingDetailProps) {
  const {
    selectedListing: listing,
    reviews,
    isDetailLoading,
    isReviewsLoading,
    isPurchasing,
    isSubmittingReview,
    purchaseListing,
    reviewListing,
    isPurchased,
    error,
  } = useMarketplaceStore();

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [hoverStar, setHoverStar] = useState(0);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const purchased = listing ? isPurchased(listing.id) : false;

  const handleBuy = useCallback(async () => {
    if (!listing || purchased) return;
    await purchaseListing(listing.id);
  }, [listing, purchased, purchaseListing]);

  const handleSubmitReview = useCallback(async () => {
    if (!listing || !reviewText.trim()) return;
    const success = await reviewListing(listing.id, reviewRating, reviewText.trim());
    if (success) {
      setReviewText('');
      setReviewRating(5);
      setReviewSuccess(true);
      setTimeout(() => setReviewSuccess(false), 3000);
    }
  }, [listing, reviewRating, reviewText, reviewListing]);

  /* Loading state */
  if (isDetailLoading) {
    return <ListingDetailSkeleton />;
  }

  /* Error state */
  if (error && !listing) {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center text-center py-16 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <h2 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
          Failed to load listing
        </h2>
        <p className="text-[13px] text-text-muted mb-5 leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="
            flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0
            bg-primary text-white rounded-xl text-[13px] font-semibold
            hover:bg-primary-hover active:scale-[0.97]
            transition-all duration-150 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
          "
        >
          <ArrowLeft size={14} />
          Back to Marketplace
        </button>
      </div>
    );
  }

  /* No listing found (should not happen, but safe fallback) */
  if (!listing) {
    return null;
  }

  const cat = CATEGORY_MAP[listing.category] ?? CATEGORY_MAP.templates;

  return (
    <div className="max-w-[960px] mx-auto animate-fade-in">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className="
          inline-flex items-center gap-1.5 mb-5
          text-[13px] font-medium text-text-muted
          hover:text-text dark:hover:text-white
          transition-colors duration-150 cursor-pointer
          min-h-[44px] md:min-h-0
          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg
        "
      >
        <ArrowLeft size={14} />
        Back to Marketplace
      </button>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Left column: Preview + Description */}
        <div className="md:col-span-3">
          {/* Preview image */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/[0.02] dark:bg-white/[0.02] mb-5">
            {listing.preview_url ? (
              <img
                src={listing.preview_url}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
                <span className="text-[64px] opacity-20">
                  {listing.category === 'templates' && '\u2756'}
                  {listing.category === 'prompts' && '\u2728'}
                  {listing.category === 'voices' && '\u266B'}
                  {listing.category === 'styles' && '\u2B50'}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="bento-card p-5 mb-5">
            <h3 className="text-[14px] font-semibold text-text dark:text-[#E0E0E0] mb-3">Description</h3>
            <p className="text-[13px] text-text-muted leading-relaxed whitespace-pre-wrap">
              {listing.description || 'No description provided.'}
            </p>
          </div>

          {/* Reviews section */}
          <div className="bento-card p-5">
            <h3 className="text-[14px] font-semibold text-text dark:text-[#E0E0E0] mb-4">
              Reviews
              {listing.rating_count > 0 && (
                <span className="text-[12px] text-text-muted font-normal ml-2">
                  ({listing.rating_count})
                </span>
              )}
            </h3>

            {/* Review form — only for purchasers */}
            {purchased && (
              <div className="mb-6 pb-5 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className="text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-2">
                  Leave a review
                </p>

                {/* Star picker */}
                <div className="flex items-center gap-0.5 mb-3" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReviewRating(i)}
                      onMouseEnter={() => setHoverStar(i)}
                      onMouseLeave={() => setHoverStar(0)}
                      aria-label={`${i} star${i !== 1 ? 's' : ''}`}
                      className="
                        p-1 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
                        flex items-center justify-center
                        cursor-pointer transition-transform duration-100
                        hover:scale-110 active:scale-95
                        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded
                      "
                    >
                      <Star
                        size={18}
                        className={
                          i <= (hoverStar || reviewRating)
                            ? 'text-warning fill-warning'
                            : 'text-black/10 dark:text-white/10'
                        }
                      />
                    </button>
                  ))}
                </div>

                {/* Review text */}
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your experience with this asset..."
                  rows={3}
                  className="
                    w-full px-3.5 py-3 min-h-[80px]
                    rounded-xl border border-black/[0.08] dark:border-white/[0.08]
                    bg-white dark:bg-[#1a1a1a]
                    text-text dark:text-[#E0E0E0] text-[13px]
                    placeholder:text-text-muted/50
                    focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30
                    transition-all duration-200 resize-none
                  "
                />

                {/* Submit */}
                <div className="flex items-center gap-3 mt-3">
                  <button
                    type="button"
                    onClick={handleSubmitReview}
                    disabled={!reviewText.trim() || isSubmittingReview}
                    className="
                      inline-flex items-center gap-2 px-4 py-2
                      min-h-[44px] md:min-h-0
                      rounded-xl text-[12px] font-semibold
                      bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
                      hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
                      disabled:opacity-40 disabled:cursor-not-allowed
                      active:scale-[0.97] transition-all duration-200 cursor-pointer
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    "
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
                  >
                    {isSubmittingReview ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      'Submit Review'
                    )}
                  </button>
                  {reviewSuccess && (
                    <span className="text-[11px] text-secondary font-medium animate-fade-in">
                      Review submitted!
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Reviews list */}
            {isReviewsLoading && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw size={18} className="text-text-muted animate-spin" />
              </div>
            )}

            {!isReviewsLoading && reviews.length === 0 && (
              <p className="text-[12px] text-text-muted text-center py-6">
                No reviews yet. {purchased ? 'Be the first to leave a review!' : 'Purchase to leave a review.'}
              </p>
            )}

            {!isReviewsLoading && reviews.length > 0 && (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/[0.06] flex items-center justify-center shrink-0">
                      <User size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-semibold text-text dark:text-[#E0E0E0]">
                          {review.reviewer_name ?? 'Creator'}
                        </span>
                        <span className="text-[10px] text-text-muted">{formatDate(review.created_at)}</span>
                      </div>
                      <StarRating rating={review.rating} size={10} />
                      <p className="text-[12px] text-text-muted leading-relaxed mt-1.5">
                        {review.review_text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Info + Buy panel (sticky) */}
        <div className="md:col-span-2">
          <div className="bento-card p-5 md:sticky md:top-5">
            {/* Title */}
            <h1 className="text-[18px] font-bold text-text dark:text-white tracking-[-0.02em] mb-2 leading-snug">
              {listing.title}
            </h1>

            {/* Category badge */}
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold mb-4"
              style={{ backgroundColor: cat.bg, color: cat.color }}
            >
              {cat.label}
            </span>

            {/* Price */}
            <div className="mb-4">
              <span className="text-[28px] font-bold text-text dark:text-white tracking-tight">
                {formatPrice(listing.price_cents)}
              </span>
            </div>

            {/* Rating + Downloads */}
            <div className="flex items-center gap-4 mb-5">
              {listing.rating_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <StarRating rating={listing.rating_avg} />
                  <span className="text-[12px] font-medium text-text dark:text-[#E0E0E0]">
                    {listing.rating_avg.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-text-muted">({listing.rating_count})</span>
                </div>
              )}
              <span className="inline-flex items-center gap-1 text-[12px] text-text-muted">
                <Download size={12} />
                {listing.downloads} downloads
              </span>
            </div>

            {/* Buy / Purchased button */}
            {purchased ? (
              <span className="
                inline-flex items-center gap-2 w-full justify-center
                px-4 py-3 min-h-[44px]
                rounded-xl text-[14px] md:text-[13px] font-semibold
                bg-secondary/[0.06] text-secondary dark:bg-secondary/[0.1] dark:text-secondary
              ">
                <CheckCircle size={16} />
                Purchased
              </span>
            ) : (
              <button
                type="button"
                onClick={handleBuy}
                disabled={isPurchasing}
                className="
                  inline-flex items-center gap-2 w-full justify-center
                  px-4 py-3 min-h-[44px]
                  rounded-xl text-[14px] md:text-[13px] font-semibold
                  bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
                  hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-[0.97] transition-all duration-200 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                "
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
              >
                {isPurchasing ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <>
                    <ShoppingCart size={14} />
                    {listing.price_cents === 0 ? 'Get Free' : `Buy for ${formatPrice(listing.price_cents)}`}
                  </>
                )}
              </button>
            )}

            {/* Divider */}
            <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] my-5" />

            {/* Seller info */}
            <div>
              <p className="text-[11px] text-text-muted font-medium uppercase tracking-wider mb-2">
                Seller
              </p>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/[0.06] flex items-center justify-center">
                  <User size={14} className="text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
                    {listing.seller_name ?? 'Creator'}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Listed {formatDate(listing.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
