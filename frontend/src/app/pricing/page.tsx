'use client';

import { useEffect, useState } from 'react';
import { Check, Sparkles, Building2, Zap, Crown, Rocket, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
import EnterprisePlanCard from '@/components/pricing/EnterprisePlanCard';
import Skeleton from '@/components/ui/Skeleton';
import type { PlanInfo } from '@/types';

/** Icon mapping for plan tiers. */
const PLAN_ICONS: Record<string, typeof Zap> = {
  starter: Zap,
  professional: Rocket,
  business: Crown,
};

/** /pricing — Public pricing page with all subscription tiers + enterprise. */
export default function PricingPage() {
  const { plans, fetchPlans } = useSettingsStore();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');

  useEffect(() => {
    fetchPlans().finally(() => setLoading(false));
  }, [fetchPlans]);

  const handleSelectPlan = async (planId: string) => {
    setCheckoutError('');

    // If not authenticated, redirect to login first
    if (!isAuthenticated) {
      window.location.href = '/?login=true';
      return;
    }

    setCheckoutLoading(planId);
    try {
      const { api } = await import('@/lib/api');
      const data = await api.post<{ url: string }>('/stripe/checkout', { plan: planId });
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError('No checkout URL received. Is Stripe configured?');
      }
    } catch (err) {
      if (err instanceof Error) {
        const apiErr = err as Error & { status?: number };
        // Check for auth-specific errors (401 = session expired)
        if (apiErr.status === 401) {
          window.location.href = '/?login=true';
          return;
        }
        const msg = err.message;
        // Detect Stripe not configured errors and show helpful message
        if (
          msg.includes('Stripe') ||
          msg.includes('stripe') ||
          msg.includes('not configured') ||
          msg.includes('500')
        ) {
          setCheckoutError('Billing is not configured. Stripe API keys need to be set up by the administrator.');
        } else {
          setCheckoutError(msg);
        }
      } else {
        setCheckoutError('Billing is not configured. Please check that Stripe is configured in backend settings.');
      }
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading) return <PricingSkeleton />;

  return (
    <div className="min-h-screen bg-surface dark:bg-dark py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-dark dark:text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-dark/60 dark:text-white/60 max-w-2xl mx-auto">
            Unlimited AI video creation on every plan. No credits, no limits, no surprises.
          </p>

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-medium ${!annual ? 'text-dark dark:text-white' : 'text-dark/40 dark:text-white/40'}`}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-primary' : 'bg-border dark:bg-white/20'}`}
              aria-label="Toggle annual billing"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-6' : ''}`}
              />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-dark dark:text-white' : 'text-dark/40 dark:text-white/40'}`}>
              Annual
              <span className="ml-1.5 text-xs font-semibold text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full">
                Save 20%
              </span>
            </span>
          </div>
        </div>

        {/* Checkout error banner */}
        {checkoutError && (
          <div className="max-w-2xl mx-auto mb-8 flex items-start gap-3 bg-danger/5 border border-danger/20 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-danger">Checkout failed</p>
              <p className="text-sm text-dark/70 dark:text-white/70 mt-0.5">{checkoutError}</p>
            </div>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* Free tier */}
          <div className="relative bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-2xl p-6 flex flex-col">
            <div className="mb-6">
              <p className="text-sm font-semibold text-dark/60 dark:text-white/60 uppercase tracking-wider">Free</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-dark dark:text-white">$0</span>
                <span className="text-dark/40 dark:text-white/40">/mo</span>
              </div>
              <p className="text-sm text-dark/50 dark:text-white/50 mt-2">Get started with AI video creation</p>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {['3 videos per month', '5 AI voices', '10 avatar presets', '480p export', '1 social connection'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-dark/70 dark:text-white/70">
                  <Check className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button className="w-full py-2.5 rounded-lg border border-border dark:border-white/20 text-dark dark:text-white font-medium hover:bg-surface dark:hover:bg-white/5 transition-colors">
              Current Plan
            </button>
          </div>

          {/* Dynamic plans from API */}
          {(plans || []).filter((p) => p.id !== 'enterprise').map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Zap;
            const displayPrice = annual ? Math.round(plan.price * 0.8) : plan.price;
            return (
              <div
                key={plan.id}
                className={`relative bg-white dark:bg-dark/60 border rounded-2xl p-6 flex flex-col ${
                  plan.recommended
                    ? 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20'
                    : 'border-border dark:border-white/10'
                }`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary" />
                    <p className="text-sm font-semibold text-dark/60 dark:text-white/60 uppercase tracking-wider">
                      {plan.name}
                    </p>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-dark dark:text-white">${displayPrice}</span>
                    <span className="text-dark/40 dark:text-white/40">/mo</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-secondary mt-1">
                      ${displayPrice * 12}/year — save ${plan.price * 12 - displayPrice * 12}
                    </p>
                  )}
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-dark/70 dark:text-white/70">
                      <Check className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={checkoutLoading === plan.id}
                  className={`w-full py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.recommended
                      ? 'bg-primary text-white hover:bg-primary-hover'
                      : 'bg-dark dark:bg-white text-white dark:text-dark hover:opacity-90'
                  }`}
                >
                  {checkoutLoading === plan.id ? 'Redirecting...' : `Get ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Enterprise section */}
        <EnterprisePlanCard />

        {/* FAQ or comparison */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-dark dark:text-white mb-4">
            All plans include
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-8">
            {[
              { icon: Sparkles, label: 'AI-powered scripts' },
              { icon: Sparkles, label: '50+ AI voices' },
              { icon: Sparkles, label: '30+ avatar presets' },
              { icon: Sparkles, label: 'Content Remix Hub' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2 p-4">
                <item.icon className="w-6 h-6 text-accent" />
                <span className="text-sm font-medium text-dark/70 dark:text-white/70">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton loader for pricing page. */
function PricingSkeleton() {
  return (
    <div className="min-h-screen bg-surface dark:bg-dark py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <Skeleton className="h-10 w-80 mx-auto mb-4" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-2xl p-6">
              <Skeleton className="h-5 w-20 mb-3" />
              <Skeleton className="h-10 w-28 mb-4" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="h-10 w-full mt-6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
