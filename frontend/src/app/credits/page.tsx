'use client';

import { Infinity as InfinityIcon, Sparkles, Rocket, ArrowUpRight, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import Skeleton from '@/components/ui/Skeleton';

/** /credits — Usage page. On-device creation is unlimited on paid plans; hosted AI (real
 *  avatars, cloud voices) is metered by credits (C-02). Ledger lives at /billing. */
export default function CreditsPage() {
  // Hold the skeleton until auth finishes loading so plan_tier is reliable.
  const { user, isLoading: authLoading } = useAuthStore();

  if (authLoading) return <CreditsSkeleton />;

  const planTier = user?.plan_tier || 'free';
  const isPaid = planTier !== 'free';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Sparkles className="w-8 h-8 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">Usage</h1>
          <p className="text-sm text-dark/60 dark:text-white/60">
            {isPaid
              ? 'Unlimited on-device creation on your plan — hosted AI is metered'
              : 'Upgrade for unlimited on-device AI video creation'}
          </p>
        </div>
      </div>

      {isPaid ? (
        /* ── Paid plan: show unlimited message, no credit counters ── */
        <div className="space-y-6">
          {/* Unlimited hero card */}
          <div
            className="rounded-2xl p-8 text-white relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #00C3FF 0%, #35C838 50%, #F3A6FF 100%)',
            }}
          >
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4">
                <InfinityIcon size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Unlimited On-Device Creation</h2>
              <p className="text-white/80 max-w-md leading-relaxed">
                Your <span className="font-semibold capitalize">{planTier}</span> plan includes unlimited
                browser-native video creation, voice generation, content remixing, and publishing.
                Hosted AI — real avatar clones and cloud voices — is metered by credits; see your
                itemized spend anytime on the billing page.
              </p>
              <a
                href="/billing"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm text-white text-[12px] font-semibold hover:bg-white/30 transition-colors"
              >
                <ArrowUpRight size={13} />
                View billing &amp; spend ledger
              </a>
            </div>
            {/* Decorative gradient circles */}
            <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
          </div>

          {/* Feature access grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'AI Video Creation', desc: 'Unlimited videos per month' },
              { label: 'AI Voice Generation', desc: '50+ voices, unlimited renders' },
              { label: 'Content Remix Hub', desc: 'Unlimited content repurposing' },
              { label: 'Social Publishing', desc: 'Publish to all connected platforms' },
              { label: 'AI Writer', desc: 'Unlimited long-form content' },
              { label: 'Stock Media', desc: 'Full access to stock library' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-dark/60 border border-border dark:border-white/10"
              >
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                  <Sparkles size={14} className="text-secondary" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-dark dark:text-white">{item.label}</p>
                  <p className="text-[11px] text-dark/50 dark:text-white/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Manage subscription CTA */}
          <div className="text-center pt-2">
            <a
              href="/settings?tab=billing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dark dark:bg-white text-white dark:text-dark text-[13px] font-semibold hover:opacity-90 transition-all active:scale-[0.97]"
            >
              <Zap size={14} />
              Manage Subscription
            </a>
          </div>
        </div>
      ) : (
        /* ── Free plan: show upgrade prompt, no credit counters ── */
        <div className="space-y-6">
          {/* Free tier info */}
          <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Rocket size={28} className="text-accent" />
            </div>
            <h2 className="text-xl font-bold text-dark dark:text-white mb-2">
              Free Plan
            </h2>
            <p className="text-sm text-dark/60 dark:text-white/60 max-w-md mx-auto mb-6 leading-relaxed">
              You are on the free plan with limited access. Upgrade to any paid plan for
              unlimited browser-native video creation, voice generation, and content remixing.
              Hosted AI (real avatar clones, cloud voices) is metered by credits on every plan.
            </p>

            {/* Free plan limits */}
            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto mb-6">
              <div className="p-3 rounded-xl bg-surface dark:bg-[#2a2a2a]">
                <p className="text-lg font-bold text-dark dark:text-white">3</p>
                <p className="text-[10px] text-dark/50 dark:text-white/50">Videos/mo</p>
              </div>
              <div className="p-3 rounded-xl bg-surface dark:bg-[#2a2a2a]">
                <p className="text-lg font-bold text-dark dark:text-white">5</p>
                <p className="text-[10px] text-dark/50 dark:text-white/50">AI Voices</p>
              </div>
              <div className="p-3 rounded-xl bg-surface dark:bg-[#2a2a2a]">
                <p className="text-lg font-bold text-dark dark:text-white">480p</p>
                <p className="text-[10px] text-dark/50 dark:text-white/50">Max Quality</p>
              </div>
            </div>

            <a
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-all active:scale-[0.97]"
            >
              <ArrowUpRight size={16} />
              Upgrade to Unlimited
            </a>
          </div>

          {/* Value proposition */}
          <div className="flex items-center gap-2 text-[11px] text-dark/50 dark:text-white/50 justify-center">
            <Sparkles size={12} className="text-accent" />
            <span>Paid plans: unlimited on-device creation. Hosted AI is metered — track it on <a href="/billing" className="underline hover:text-accent">billing</a>.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Skeleton loader for usage page. */
function CreditsSkeleton() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="w-8 h-8 rounded" />
        <div>
          <Skeleton className="h-7 w-24 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="h-56 w-full rounded-2xl mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
