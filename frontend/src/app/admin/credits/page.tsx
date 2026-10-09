'use client';

import { useEffect, useState, useCallback } from 'react';
import { Coins, Package, Save, Plus, Trash2, Users, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';

interface FeatureConfig {
  feature_key: string;
  credit_cost: number;
  api_multiplier: number;
  byok_multiplier: number;
  supports_browser: boolean;
  supports_api: boolean;
  supports_byok: boolean;
  browser_engine: string | null;
  api_service: string | null;
  promo_label: string | null;
  description: string;
}

interface CreditPack {
  id: number;
  name: string;
  credits: number;
  price_cents: number;
  badge_label: string | null;
  badge_color: string | null;
  is_featured: boolean;
  is_active: boolean;
}

interface CreditStats {
  total_credits_sold: number;
  active_credit_users: number;
  top_features: { feature_key: string; total_cost: number }[];
}

/** Build default feature configs when backend is unavailable. */
function buildDefaultFeatures(): FeatureConfig[] {
  return [
    { feature_key: 'script_generate', credit_cost: 0, api_multiplier: 3, byok_multiplier: 1, supports_browser: true, supports_api: true, supports_byok: true, browser_engine: 'WebLLM', api_service: 'anthropic', promo_label: 'Free with browser AI', description: 'Generate video scripts with AI' },
    { feature_key: 'image_generate', credit_cost: 0, api_multiplier: 5, byok_multiplier: 1, supports_browser: true, supports_api: true, supports_byok: true, browser_engine: 'SD Turbo', api_service: 'openai', promo_label: 'Free with browser AI', description: 'Generate images for video scenes' },
    { feature_key: 'tts_synthesize', credit_cost: 0, api_multiplier: 0, byok_multiplier: 0, supports_browser: true, supports_api: false, supports_byok: false, browser_engine: 'Kokoro TTS', api_service: null, promo_label: 'Always free (browser)', description: 'Text-to-speech voice generation' },
    { feature_key: 'video_render', credit_cost: 0, api_multiplier: 0, byok_multiplier: 0, supports_browser: true, supports_api: false, supports_byok: false, browser_engine: 'WebCodecs', api_service: null, promo_label: 'Always free (browser)', description: 'Render video from scenes' },
    { feature_key: 'remix_generate', credit_cost: 0, api_multiplier: 2, byok_multiplier: 1, supports_browser: true, supports_api: true, supports_byok: true, browser_engine: 'WebLLM', api_service: 'anthropic', promo_label: 'Free with browser AI', description: 'Repurpose content for multiple platforms' },
    { feature_key: 'writer_generate', credit_cost: 0, api_multiplier: 2, byok_multiplier: 1, supports_browser: true, supports_api: true, supports_byok: true, browser_engine: 'WebLLM', api_service: 'anthropic', promo_label: 'Free with browser AI', description: 'Long-form AI content writing' },
    { feature_key: 'thumbnail_generate', credit_cost: 0, api_multiplier: 3, byok_multiplier: 1, supports_browser: true, supports_api: true, supports_byok: true, browser_engine: 'Canvas API', api_service: 'openai', promo_label: null, description: 'Generate video thumbnails' },
    { feature_key: 'voice_clone', credit_cost: 0, api_multiplier: 0, byok_multiplier: 0, supports_browser: true, supports_api: false, supports_byok: false, browser_engine: 'F5-TTS', api_service: null, promo_label: 'Always free (browser)', description: 'Clone voice from 3s sample' },
  ];
}

/** Build default credit packs. */
function buildDefaultPacks(): CreditPack[] {
  return [
    { id: 1, name: 'Starter Pack', credits: 500, price_cents: 499, badge_label: null, badge_color: null, is_featured: false, is_active: true },
    { id: 2, name: 'Creator Pack', credits: 2000, price_cents: 1499, badge_label: 'Popular', badge_color: 'primary', is_featured: true, is_active: true },
    { id: 3, name: 'Pro Pack', credits: 5000, price_cents: 2999, badge_label: 'Best Value', badge_color: 'secondary', is_featured: false, is_active: true },
  ];
}

/** /admin/credits — Admin credit configuration: features, packs, and stats. */
export default function AdminCreditsPage() {
  const [features, setFeatures] = useState<FeatureConfig[]>([]);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [stats, setStats] = useState<CreditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'features' | 'packs' | 'stats'>('features');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [featRes, packRes, statsRes] = await Promise.all([
        api.get('/admin/credits/features').catch(() => ({ features: [] })),
        api.get('/admin/credits/packs').catch(() => ({ packs: [] })),
        api.get('/admin/credits/stats').catch(() => null),
      ]);
      const apiFeat = Array.isArray(featRes?.features) ? featRes.features : [];
      const apiPacks = Array.isArray(packRes?.packs) ? packRes.packs : [];
      setFeatures(apiFeat.length > 0 ? apiFeat : buildDefaultFeatures());
      setPacks(apiPacks.length > 0 ? apiPacks : buildDefaultPacks());
      setStats(statsRes || { total_credits_sold: 0, active_credit_users: 1, top_features: [] });
    } catch (e) {
      console.error('Admin credits fetch error:', e);
      setFeatures(buildDefaultFeatures());
      setPacks(buildDefaultPacks());
      setStats({ total_credits_sold: 0, active_credit_users: 1, top_features: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateFeatureCost = async (key: string, data: { credit_cost: number; api_multiplier: number; byok_multiplier: number; promo_label: string | null }) => {
    setSaving(key);
    try {
      await api.put(`/admin/credits/features/${key}`, data);
      setFeatures((prev) =>
        prev.map((f) => (f.feature_key === key ? { ...f, ...data } : f))
      );
    } finally {
      setSaving(null);
    }
  };

  const deletePack = async (id: number) => {
    if (!confirm('Delete this credit pack?')) return;
    await api.delete(`/admin/credits/packs/${id}`);
    setPacks((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Coins className="w-7 h-7 text-accent" />
        <h1 className="text-2xl font-bold text-dark dark:text-white">Credit Configuration</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface dark:bg-white/5 p-1 rounded-lg mb-6 w-fit">
        {[
          { id: 'features' as const, label: 'Feature Pricing', icon: Coins },
          { id: 'packs' as const, label: 'Credit Packs', icon: Package },
          { id: 'stats' as const, label: 'Statistics', icon: BarChart3 },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white dark:bg-dark text-dark dark:text-white shadow-sm'
                : 'text-dark/50 dark:text-white/50 hover:text-dark dark:hover:text-white'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Features tab */}
      {tab === 'features' && (
        <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-white/10 text-left">
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Feature</th>
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 w-24">Base Cost</th>
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 w-20">API ×</th>
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 w-20">BYOK ×</th>
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 w-24">Tiers</th>
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Promo Label</th>
                  <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60 w-16">Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/10">
                {(features ?? []).map((f) => (
                  <FeatureRow
                    key={f.feature_key}
                    feature={f}
                    saving={saving === f.feature_key}
                    onSave={updateFeatureCost}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Packs tab */}
      {tab === 'packs' && (
        <div className="space-y-4">
          {(packs ?? []).map((pack) => (
            <div
              key={pack.id}
              className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-dark dark:text-white">{pack.name}</span>
                  {pack.is_featured && <Badge variant="primary" size="sm">Featured</Badge>}
                  {!pack.is_active && <Badge variant="danger" size="sm">Inactive</Badge>}
                </div>
                <p className="text-sm text-dark/60 dark:text-white/60 mt-0.5">
                  {pack.credits.toLocaleString()} credits · ${(pack.price_cents / 100).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => deletePack(pack.id)}
                className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                title="Delete pack"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats tab */}
      {tab === 'stats' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-6">
            <p className="text-sm text-dark/60 dark:text-white/60">Total Credits Sold</p>
            <p className="text-3xl font-bold text-dark dark:text-white mt-1">
              {(stats.total_credits_sold || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-6">
            <p className="text-sm text-dark/60 dark:text-white/60">Active Credit Users</p>
            <p className="text-3xl font-bold text-dark dark:text-white mt-1">
              {(stats.active_credit_users || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-6">
            <p className="text-sm text-dark/60 dark:text-white/60 mb-3">Top Features by Usage</p>
            <div className="space-y-2">
              {(stats.top_features || []).slice(0, 5).map((tf) => (
                <div key={tf.feature_key} className="flex justify-between text-sm">
                  <span className="text-dark/70 dark:text-white/70">{tf.feature_key}</span>
                  <span className="font-mono text-dark dark:text-white">{tf.total_cost}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Editable feature cost row with multiplier columns. */
function FeatureRow({
  feature,
  saving,
  onSave,
}: {
  feature: FeatureConfig;
  saving: boolean;
  onSave: (key: string, data: { credit_cost: number; api_multiplier: number; byok_multiplier: number; promo_label: string | null }) => void;
}) {
  const [cost, setCost] = useState(feature.credit_cost);
  const [apiMul, setApiMul] = useState(feature.api_multiplier ?? 3);
  const [byokMul, setByokMul] = useState(feature.byok_multiplier ?? 1);
  const [promo, setPromo] = useState(feature.promo_label || '');
  const changed =
    cost !== feature.credit_cost ||
    apiMul !== (feature.api_multiplier ?? 3) ||
    byokMul !== (feature.byok_multiplier ?? 1) ||
    promo !== (feature.promo_label || '');

  const tierLabels: string[] = [];
  if (feature.supports_browser) tierLabels.push('Browser');
  if (feature.supports_api) tierLabels.push('API');
  if (feature.supports_byok) tierLabels.push('BYOK');

  return (
    <tr className="hover:bg-surface dark:hover:bg-white/[0.02]">
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-dark/80 dark:text-white/80">{feature.feature_key}</span>
        {feature.browser_engine && (
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">{feature.browser_engine}</span>
        )}
        {feature.api_service && (
          <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-full">{feature.api_service}</span>
        )}
        {feature.description && (
          <p className="text-xs text-dark/40 dark:text-white/40 mt-0.5">{feature.description}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          value={cost}
          onChange={(e) => setCost(Number(e.target.value))}
          className="w-20 px-2 py-1 text-sm rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          step={0.5}
          value={apiMul}
          onChange={(e) => setApiMul(Number(e.target.value))}
          disabled={!feature.supports_api}
          className="w-16 px-2 py-1 text-sm rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white disabled:opacity-30"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          step={0.5}
          value={byokMul}
          onChange={(e) => setByokMul(Number(e.target.value))}
          disabled={!feature.supports_byok}
          className="w-16 px-2 py-1 text-sm rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white disabled:opacity-30"
        />
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-dark/60 dark:text-white/60">{tierLabels.join(', ') || '—'}</span>
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          placeholder="e.g. Free during beta"
          className="w-full px-2 py-1 text-sm rounded border border-border dark:border-white/20 bg-white dark:bg-dark text-dark dark:text-white"
        />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onSave(feature.feature_key, { credit_cost: cost, api_multiplier: apiMul, byok_multiplier: byokMul, promo_label: promo || null })}
          disabled={!changed || saving}
          className="p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors"
          title="Save"
        >
          <Save className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
