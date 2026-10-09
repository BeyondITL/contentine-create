'use client';

import { useState, useCallback } from 'react';
import {
  CreditCard,
  Check,
  Star,
  ArrowUpRight,
  Video,
  Send,
  HardDrive,
  Loader2,
  Sparkles,
  AlertTriangle,
  Building2,
  Info,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import type { PlanInfo, PlanTier } from '@/types';

/** Map plan tier IDs to display badges. */
const PLAN_BADGES: Record<string, { label: string; className: string }> = {
  free: { label: 'Free Trial', className: 'badge-accent' },
  starter: { label: 'Starter', className: 'badge-success' },
  professional: { label: 'Professional', className: 'badge-success' },
  business: { label: 'Business', className: 'badge-success' },
  enterprise: { label: 'Enterprise', className: 'badge-success' },
};

/** Format storage size. */
function formatStorage(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

/** Billing settings tab — plans, usage, subscription management. */
export default function BillingTab() {
  const { profile, usage, plans, isLoading, error, createCheckoutSession, createPortalSession } =
    useSettingsStore();

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const currentPlan = profile?.plan_tier || 'free';
  const isTrialing = currentPlan === 'free' && !!profile?.trial_ends_at;

  // Calculate trial days remaining
  let trialDaysLeft = 0;
  if (isTrialing && profile?.trial_ends_at) {
    const now = new Date();
    const end = new Date(profile.trial_ends_at);
    trialDaysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  /** Whether Stripe appears to be configured (optimistic -- we only know after first error). */
  const [stripeAvailable, setStripeAvailable] = useState(true);

  /** Start Stripe Checkout for a plan. */
  const handleSubscribe = useCallback(
    async (planId: string) => {
      setLocalError('');
      setCheckoutLoading(planId);
      try {
        const url = await createCheckoutSession(planId);
        if (url) {
          window.location.href = url;
        } else {
          setStripeAvailable(false);
          setLocalError('Billing is not configured. Please contact the administrator.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (
          msg.includes('Stripe') ||
          msg.includes('stripe') ||
          msg.includes('not configured') ||
          msg.includes('500')
        ) {
          setStripeAvailable(false);
          setLocalError('Billing is not configured. Stripe API keys need to be set up in backend settings.');
        } else {
          setLocalError('Failed to start checkout. Please try again.');
        }
      } finally {
        setCheckoutLoading(null);
      }
    },
    [createCheckoutSession]
  );

  /** Open Stripe Customer Portal. */
  const handleManage = useCallback(async () => {
    setLocalError('');
    setPortalLoading(true);
    try {
      const url = await createPortalSession();
      if (url) {
        window.location.href = url;
      } else {
        setStripeAvailable(false);
        setLocalError('Billing is not configured. Please contact the administrator.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.includes('Stripe') ||
        msg.includes('stripe') ||
        msg.includes('not configured') ||
        msg.includes('500')
      ) {
        setStripeAvailable(false);
        setLocalError('Billing portal is not available. Stripe API keys need to be configured.');
      } else {
        setLocalError('Failed to open billing portal. Please try again.');
      }
    } finally {
      setPortalLoading(false);
    }
  }, [createPortalSession]);

  /** Get button config for a plan card. */
  function getPlanButton(plan: PlanInfo) {
    const isCurrentPlan = currentPlan === plan.id;

    // Enterprise plan always links to contact form, never Stripe
    if (plan.id === 'enterprise') {
      if (isCurrentPlan) {
        return {
          label: 'Current Plan',
          disabled: true,
          variant: 'btn-secondary' as const,
          onClick: () => {},
        };
      }
      return {
        label: 'Contact Sales',
        disabled: false,
        variant: 'btn-primary' as const,
        onClick: () => {
          window.location.href = '/pricing#enterprise-contact';
        },
      };
    }

    if (isCurrentPlan && currentPlan !== 'free') {
      return {
        label: 'Current Plan',
        disabled: true,
        variant: 'btn-secondary' as const,
        onClick: () => {},
      };
    }

    if (isCurrentPlan && currentPlan === 'free') {
      return {
        label: 'Upgrade',
        disabled: false,
        variant: 'btn-primary' as const,
        onClick: () => handleSubscribe(plan.id),
      };
    }

    // For paid plans — either upgrade or switch
    const planOrder: PlanTier[] = ['free', 'starter', 'professional', 'business', 'enterprise'];
    const currentIndex = planOrder.indexOf(currentPlan as PlanTier);
    const planIndex = planOrder.indexOf(plan.id as PlanTier);

    if (currentPlan !== 'free' && planIndex !== currentIndex) {
      return {
        label: planIndex > currentIndex ? 'Upgrade' : 'Switch',
        disabled: false,
        variant: 'btn-primary' as const,
        onClick: () => handleManage(),
      };
    }

    return {
      label: 'Subscribe',
      disabled: false,
      variant: plan.recommended ? ('btn-primary' as const) : ('btn-secondary' as const),
      onClick: () => handleSubscribe(plan.id),
    };
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Current Plan Card */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            <h2 className="text-[14px] font-semibold text-text dark:text-white">
              Current Plan
            </h2>
          </div>
          <span className={PLAN_BADGES[currentPlan]?.className || 'badge-accent'}>
            {PLAN_BADGES[currentPlan]?.label || 'Free'}
          </span>
        </div>

        {/* Manage subscription for paid plans */}
        {currentPlan !== 'free' && (
          <button
            type="button"
            onClick={handleManage}
            disabled={portalLoading}
            className="btn-secondary flex items-center gap-2 min-h-[44px] md:min-h-0 cursor-pointer"
          >
            {portalLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Opening Portal...
              </>
            ) : (
              <>
                <ArrowUpRight size={14} />
                Manage Subscription
              </>
            )}
          </button>
        )}
      </div>

      {/* Trial Banner */}
      {isTrialing && (
        <div
          className="rounded-xl p-4 md:p-5 text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #00C3FF 0%, #35C838 50%, #F3A6FF 100%)',
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles size={16} />
              <h3 className="text-[14px] font-semibold">Free Trial Active</h3>
            </div>
            <p className="text-[13px] opacity-90 mb-3">
              {trialDaysLeft > 0
                ? `You have ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left on your free trial. Subscribe to keep creating unlimited content.`
                : 'Your trial has ended. Subscribe to continue creating content.'}
            </p>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('plan-cards');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[12.5px] font-semibold backdrop-blur-sm transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              <ArrowUpRight size={14} />
              Choose a Plan
            </button>
          </div>
        </div>
      )}

      {/* Usage Stats */}
      {usage && (
        <div className="bento-card p-4 md:p-5">
          <h2 className="text-[14px] font-semibold text-text dark:text-white mb-4">
            Usage Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Videos Created */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface dark:bg-[#2a2a2a]">
              <div className="w-9 h-9 rounded-lg bg-primary/[0.06] flex items-center justify-center shrink-0">
                <Video size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[18px] font-bold text-text dark:text-white leading-tight">
                  {usage.videos_created}
                </p>
                <p className="text-[11px] text-text-muted">Videos created</p>
              </div>
            </div>
            {/* Posts Published */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface dark:bg-[#2a2a2a]">
              <div className="w-9 h-9 rounded-lg bg-secondary/[0.06] flex items-center justify-center shrink-0">
                <Send size={16} className="text-secondary" />
              </div>
              <div>
                <p className="text-[18px] font-bold text-text dark:text-white leading-tight">
                  {usage.posts_published}
                </p>
                <p className="text-[11px] text-text-muted">Posts published</p>
              </div>
            </div>
            {/* Storage */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface dark:bg-[#2a2a2a]">
              <div className="w-9 h-9 rounded-lg bg-accent/[0.06] flex items-center justify-center shrink-0">
                <HardDrive size={16} className="text-accent" />
              </div>
              <div>
                <p className="text-[18px] font-bold text-text dark:text-white leading-tight">
                  {formatStorage(usage.storage_used_mb)}
                </p>
                <p className="text-[11px] text-text-muted">Storage used</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing not configured notice */}
      {!stripeAvailable && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-info/[0.06] border border-info/20">
          <Info size={16} className="text-info mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-text dark:text-white mb-0.5">
              Billing not configured
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Stripe API keys have not been set up. Subscription checkout and billing portal are unavailable until configured by an administrator.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {localError && stripeAvailable && (
        <div className="flex items-center gap-2 text-[12px] text-danger bg-danger/[0.06] rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {/* Plan Cards */}
      <div id="plan-cards">
        <h2 className="text-[14px] font-semibold text-text dark:text-white mb-4">
          Available Plans
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map((plan) => {
            const btn = getPlanButton(plan);
            const isRecommended = plan.recommended;
            const isCurrent = currentPlan === plan.id;
            const isLoadingCheckout = checkoutLoading === plan.id;

            return (
              <div
                key={plan.id}
                className={`
                  bento-card p-4 md:p-5 relative
                  ${isRecommended ? 'ring-2 ring-primary/30 dark:ring-primary/40' : ''}
                  ${isCurrent ? 'ring-2 ring-secondary/30 dark:ring-secondary/40' : ''}
                `}
              >
                {/* Recommended badge */}
                {isRecommended && !isCurrent && (
                  <div className="absolute -top-2.5 left-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-primary text-white text-[10px] font-semibold rounded-full shadow-sm">
                      <Star size={10} />
                      Recommended
                    </span>
                  </div>
                )}

                {/* Current badge */}
                {isCurrent && currentPlan !== 'free' && (
                  <div className="absolute -top-2.5 left-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-secondary text-white text-[10px] font-semibold rounded-full shadow-sm">
                      <Check size={10} />
                      Current
                    </span>
                  </div>
                )}

                {/* Plan name + price */}
                <div className="mb-3 mt-1">
                  <h3 className="text-[15px] font-semibold text-text dark:text-white">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-0.5 mt-1">
                    <span className="text-[28px] font-bold text-text dark:text-white leading-none">
                      ${plan.price}
                    </span>
                    <span className="text-[12px] text-text-muted">/month</span>
                  </div>
                </div>

                {/* Features list */}
                <ul className="space-y-2 mb-4">
                  {plan.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-[12px] text-text dark:text-[#ccc]"
                    >
                      <Check
                        size={13}
                        className="text-secondary shrink-0 mt-0.5"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <button
                  type="button"
                  onClick={btn.onClick}
                  disabled={btn.disabled || isLoadingCheckout}
                  className={`
                    ${btn.variant} w-full flex items-center justify-center gap-2
                    min-h-[44px] md:min-h-0
                    disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
                  `}
                >
                  {isLoadingCheckout ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    btn.label
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Unlimited note */}
        <div className="flex items-center gap-2 mt-3 text-[11px] text-text-muted">
          <Sparkles size={12} className="text-accent" />
          <span>All paid plans include unlimited video creation — no credits, no limits.</span>
        </div>
      </div>
    </div>
  );
}
