'use client';

import { useEffect, useState, useCallback } from 'react';
import { Cpu, Cloud, Key, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────

interface ProviderOption {
  tier: string;
  service?: string;
  label: string;
  cost_label: string;
}

interface ProvidersResponse {
  providers: ProviderOption[];
}

interface AiProviderSelection {
  tier: string;
  service?: string;
}

interface AiProviderSelectorProps {
  /** Feature key used to fetch available providers, e.g. 'ai_script_generate'. */
  featureKey: string;
  /** Currently selected provider tier and optional service. */
  value: AiProviderSelection | null;
  /** Callback when the user selects a different provider. */
  onChange: (selection: AiProviderSelection) => void;
  /** Render a compact single-line inline selector instead of stacked cards. */
  compact?: boolean;
  /** Additional Tailwind classes. */
  className?: string;
}

// ── Icon mapping ─────────────────────────────────────────────

function TierIcon({ tier, size = 14 }: { tier: string; size?: number }) {
  switch (tier) {
    case 'browser':
      return <Cpu size={size} />;
    case 'system':
      return <Cloud size={size} />;
    case 'byok':
      return <Key size={size} />;
    default:
      return <Cloud size={size} />;
  }
}

/** Color class for the icon wrapper based on tier. */
function tierIconBg(tier: string): string {
  switch (tier) {
    case 'browser':
      return 'bg-primary/[0.08] text-primary dark:bg-primary/[0.14] dark:text-[#66DAFF]';
    case 'system':
      return 'bg-accent/[0.08] text-accent dark:bg-accent/[0.14] dark:text-[#F3A6FF]';
    case 'byok':
      return 'bg-secondary/[0.08] text-secondary dark:bg-secondary/[0.14] dark:text-[#5DD85F]';
    default:
      return 'bg-primary/[0.08] text-primary';
  }
}

// ── Component ────────────────────────────────────────────────

/** Reusable selector for choosing which AI provider tier to use for a given feature. */
export function AiProviderSelector({
  featureKey,
  value,
  onChange,
  compact = false,
  className = '',
}: AiProviderSelectorProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<ProvidersResponse>(
        `/ai/providers/${encodeURIComponent(featureKey)}`
      );
      setProviders(data.providers ?? []);

      // Auto-select first provider if nothing is selected yet
      if (!value && data.providers && data.providers.length > 0) {
        const first = data.providers[0];
        onChange({ tier: first.tier, service: first.service });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load providers.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [featureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // If only browser tier is available (or fewer than 2 options), hide the selector
  if (
    !isLoading &&
    !error &&
    (providers.length <= 1 ||
      (providers.length === 1 && providers[0].tier === 'browser'))
  ) {
    return null;
  }

  // Loading skeleton
  if (isLoading) {
    if (compact) {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <div className="w-20 h-7 rounded-lg animate-pulse bg-black/[0.04] dark:bg-white/[0.06]" />
          <div className="w-20 h-7 rounded-lg animate-pulse bg-black/[0.04] dark:bg-white/[0.06]" />
        </div>
      );
    }
    return (
      <div className={`space-y-2 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl animate-pulse bg-black/[0.02] dark:bg-white/[0.03]"
          >
            <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06]" />
            <div className="flex-1">
              <div className="w-28 h-3.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] mb-1" />
              <div className="w-16 h-3 rounded-md bg-black/[0.04] dark:bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 text-[12px] text-danger ${className}`}>
        <span>{error}</span>
        <button
          type="button"
          onClick={fetchProviders}
          className="underline hover:no-underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Compact mode: segmented control ──

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] ${className}`}
        role="radiogroup"
        aria-label="AI provider tier"
      >
        {providers.map((p) => {
          const isSelected =
            value?.tier === p.tier &&
            (p.service ? value?.service === p.service : true);

          return (
            <button
              key={`${p.tier}-${p.service ?? ''}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange({ tier: p.tier, service: p.service })}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-medium
                transition-all duration-150 cursor-pointer whitespace-nowrap
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${
                  isSelected
                    ? 'bg-white dark:bg-[#2a2a2a] text-text dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                    : 'text-text-muted hover:text-text dark:hover:text-white'
                }
              `}
            >
              <TierIcon tier={p.tier} size={12} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Full mode: stacked radio cards ──

  return (
    <div
      className={`space-y-2 ${className}`}
      role="radiogroup"
      aria-label="AI provider tier"
    >
      {providers.map((p) => {
        const isSelected =
          value?.tier === p.tier &&
          (p.service ? value?.service === p.service : true);
        const key = `${p.tier}-${p.service ?? ''}`;

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange({ tier: p.tier, service: p.service })}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] md:min-h-0 rounded-xl border
              transition-all duration-150 cursor-pointer text-left
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              ${
                isSelected
                  ? 'border-primary/30 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-[0_0_0_1px_rgba(0,195,255,0.12)]'
                  : 'border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.12] hover:bg-black/[0.01] dark:hover:bg-white/[0.02]'
              }
            `}
          >
            {/* Radio indicator */}
            <div
              className={`
                w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                ${
                  isSelected
                    ? 'border-primary'
                    : 'border-black/[0.15] dark:border-white/[0.15]'
                }
              `}
            >
              {isSelected && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>

            {/* Tier icon */}
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tierIconBg(p.tier)}`}
            >
              <TierIcon tier={p.tier} size={15} />
            </div>

            {/* Label + cost */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-text dark:text-[#E0E0E0] truncate">
                {p.label}
              </p>
              <p className="text-[11px] text-text-muted">{p.cost_label}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
