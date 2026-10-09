'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Cpu,
  Globe,
  Mic,
  Image,
  FileText,
  Sparkles,
  Clock,
  Layers,
} from 'lucide-react';
import { api } from '@/lib/api';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';

// --- Types ---

interface ProviderService {
  service: string;
  display_name: string;
  status: 'active' | 'degraded' | 'down' | 'unknown';
  response_time_ms: number | null;
  last_checked: string | null;
  is_local: boolean;
  key_count?: number;
  healthy_keys?: number;
  total_daily_usage?: number;
}

interface ProviderResolution {
  feature_key: string;
  display_name: string;
  resolved_tier: 'system_key' | 'user_byok' | 'browser' | 'fallback' | 'unavailable';
  provider_name: string;
  is_available: boolean;
  details: string;
}

type HealthStatus = 'active' | 'degraded' | 'down' | 'unknown';

// --- Constants ---

const FEATURE_KEYS = [
  'script_generate',
  'image_generate',
  'remix_generate',
  'writer_generate',
  'thumbnail_generate',
] as const;

const FEATURE_DISPLAY: Record<string, { label: string; icon: typeof FileText }> = {
  script_generate: { label: 'Script Generation', icon: FileText },
  image_generate: { label: 'Image Generation', icon: Image },
  remix_generate: { label: 'Content Remix', icon: Sparkles },
  writer_generate: { label: 'AI Writer', icon: FileText },
  thumbnail_generate: { label: 'Thumbnail Generation', icon: Image },
};

const SERVICE_ICONS: Record<string, typeof Server> = {
  anthropic: FileText,
  openai: Image,
  'd-id': Mic,
  pexels: Globe,
  pixabay: Globe,
  freesound: Mic,
  kokoro_tts: Cpu,
  wav2lip: Cpu,
};

const STATUS_CONFIG: Record<HealthStatus, { badge: 'success' | 'warning' | 'danger' | 'default'; icon: typeof CheckCircle; label: string }> = {
  active: { badge: 'success', icon: CheckCircle, label: 'Active' },
  degraded: { badge: 'warning', icon: AlertTriangle, label: 'Degraded' },
  down: { badge: 'danger', icon: XCircle, label: 'Down' },
  unknown: { badge: 'default', icon: Clock, label: 'Unknown' },
};

const TIER_CONFIG: Record<string, { badge: 'primary' | 'accent' | 'info' | 'warning' | 'danger'; label: string }> = {
  system_key: { badge: 'primary', label: 'System Key' },
  user_byok: { badge: 'accent', label: 'User BYOK' },
  browser: { badge: 'info', label: 'Browser' },
  fallback: { badge: 'warning', label: 'Fallback' },
  unavailable: { badge: 'danger', label: 'Unavailable' },
};

// --- Fallback data for when API is unavailable ---

function buildFallbackServices(): ProviderService[] {
  return [
    { service: 'anthropic', display_name: 'Claude API (Anthropic)', status: 'unknown', response_time_ms: null, last_checked: null, is_local: false },
    { service: 'openai', display_name: 'OpenAI (DALL-E)', status: 'unknown', response_time_ms: null, last_checked: null, is_local: false },
    { service: 'd-id', display_name: 'D-ID', status: 'unknown', response_time_ms: null, last_checked: null, is_local: false },
    { service: 'pexels', display_name: 'Pexels', status: 'unknown', response_time_ms: null, last_checked: null, is_local: false },
    { service: 'pixabay', display_name: 'Pixabay', status: 'unknown', response_time_ms: null, last_checked: null, is_local: false },
    { service: 'freesound', display_name: 'Freesound', status: 'unknown', response_time_ms: null, last_checked: null, is_local: false },
    { service: 'kokoro_tts', display_name: 'Kokoro TTS (Local)', status: 'unknown', response_time_ms: null, last_checked: null, is_local: true },
    { service: 'wav2lip', display_name: 'Wav2Lip (Local)', status: 'unknown', response_time_ms: null, last_checked: null, is_local: true },
  ];
}

function buildFallbackResolutions(): ProviderResolution[] {
  return FEATURE_KEYS.map((key) => ({
    feature_key: key,
    display_name: FEATURE_DISPLAY[key]?.label || key,
    resolved_tier: 'unavailable' as const,
    provider_name: 'Not configured',
    is_available: false,
    details: 'Provider resolution data unavailable. Configure system API keys to enable.',
  }));
}

// --- Component ---

/** /admin/providers — AI Provider Health dashboard with service status and tier resolution. */
export default function AdminProvidersPage() {
  const [services, setServices] = useState<ProviderService[]>([]);
  const [resolutions, setResolutions] = useState<ProviderResolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'health' | 'resolution'>('health');

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);

    try {
      // Fetch service overview from admin keys endpoint
      let serviceData: ProviderService[] = [];
      try {
        const servicesRes = await api.get('/admin/keys/services');
        const rawServices = servicesRes.services || [];
        serviceData = rawServices.map((svc: {
          service: string; display_name?: string; healthy_keys?: number;
          key_count?: number; avg_response_ms?: number; last_checked?: string;
          total_daily_usage?: number;
        }) => ({
          service: svc.service,
          display_name: svc.display_name || svc.service,
          status: (svc.healthy_keys ?? 0) > 0 ? 'active' : (svc.key_count ?? 0) > 0 ? 'degraded' : 'down',
          response_time_ms: svc.avg_response_ms ?? null,
          last_checked: svc.last_checked ?? null,
          is_local: false,
          key_count: svc.key_count,
          healthy_keys: svc.healthy_keys,
          total_daily_usage: svc.total_daily_usage,
        }));
      } catch {
        serviceData = [];
      }

      // Ensure all expected services are present
      const knownServices = buildFallbackServices();
      const serviceMap = new Map(serviceData.map((s) => [s.service, s]));
      const mergedServices = knownServices.map((fallback) => serviceMap.get(fallback.service) || fallback);
      // Add any extra services from the API that are not in our known list
      serviceData.forEach((s) => {
        if (!mergedServices.find((m) => m.service === s.service)) {
          mergedServices.push(s);
        }
      });

      setServices(mergedServices);

      // Fetch provider resolution for each feature
      const resolutionResults = await Promise.allSettled(
        FEATURE_KEYS.map(async (key) => {
          try {
            const res = await api.get(`/ai/providers/${key}`);
            return {
              feature_key: key,
              display_name: FEATURE_DISPLAY[key]?.label || key,
              resolved_tier: res.resolved_tier || 'unavailable',
              provider_name: res.provider_name || res.provider || 'Unknown',
              is_available: res.is_available ?? false,
              details: res.details || res.message || '',
            } as ProviderResolution;
          } catch {
            return {
              feature_key: key,
              display_name: FEATURE_DISPLAY[key]?.label || key,
              resolved_tier: 'unavailable' as const,
              provider_name: 'Not configured',
              is_available: false,
              details: 'Unable to resolve provider. Check system key configuration.',
            };
          }
        })
      );

      setResolutions(
        resolutionResults.map((r) =>
          r.status === 'fulfilled' ? r.value : buildFallbackResolutions()[0]
        )
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load provider data');
      setServices(buildFallbackServices());
      setResolutions(buildFallbackResolutions());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => fetchData(true);

  // --- Summary stats ---
  const activeCount = services.filter((s) => s.status === 'active').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const downCount = services.filter((s) => s.status === 'down').length;
  const localCount = services.filter((s) => s.is_local).length;
  const remoteCount = services.filter((s) => !s.is_local).length;

  // --- Loading state ---
  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6 animate-pulse">
          <div className="w-7 h-7 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]" />
          <div className="h-7 w-48 bg-black/[0.06] dark:bg-white/[0.08] rounded" />
        </div>
        {/* Summary stat skeletons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        {/* Tab skeleton */}
        <Skeleton className="h-10 w-64 rounded-lg mb-6" />
        {/* Service card skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error && services.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-7 h-7 text-info" />
          <h1 className="text-2xl font-bold text-dark dark:text-white">Provider Health</h1>
        </div>
        <div className="bg-white dark:bg-dark/60 border border-danger/20 rounded-xl p-8 text-center">
          <XCircle className="w-12 h-12 text-danger mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-dark dark:text-white mb-2">
            Unable to Load Provider Data
          </h2>
          <p className="text-sm text-dark/60 dark:text-white/60 mb-4 max-w-md mx-auto">
            {error}
          </p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-info" />
          <div>
            <h1 className="text-2xl font-bold text-dark dark:text-white">Provider Health</h1>
            <p className="text-sm text-dark/60 dark:text-white/60">
              Monitor AI service status, response times, and resolution tiers
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Checking...' : 'Refresh All'}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-secondary" />
            <span className="text-xs font-medium text-dark/60 dark:text-white/60">Active</span>
          </div>
          <p className="text-2xl font-bold text-dark dark:text-white">{activeCount}</p>
          <p className="text-xs text-dark/40 dark:text-white/40">of {services.length} services</p>
        </div>
        <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-xs font-medium text-dark/60 dark:text-white/60">Degraded</span>
          </div>
          <p className="text-2xl font-bold text-dark dark:text-white">{degradedCount}</p>
          <p className="text-xs text-dark/40 dark:text-white/40">need attention</p>
        </div>
        <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-dark/60 dark:text-white/60">Remote APIs</span>
          </div>
          <p className="text-2xl font-bold text-dark dark:text-white">{remoteCount}</p>
          <p className="text-xs text-dark/40 dark:text-white/40">{downCount > 0 ? `${downCount} down` : 'all reachable'}</p>
        </div>
        <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-accent" />
            <span className="text-xs font-medium text-dark/60 dark:text-white/60">Local Engines</span>
          </div>
          <p className="text-2xl font-bold text-dark dark:text-white">{localCount}</p>
          <p className="text-xs text-dark/40 dark:text-white/40">browser-native</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface dark:bg-white/5 p-1 rounded-lg mb-6 w-fit">
        {[
          { id: 'health' as const, label: 'Service Health', icon: Server },
          { id: 'resolution' as const, label: 'Provider Resolution', icon: Layers },
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

      {/* Service Health Tab */}
      {tab === 'health' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc) => (
            <ServiceCard key={svc.service} service={svc} />
          ))}
        </div>
      )}

      {/* Provider Resolution Tab */}
      {tab === 'resolution' && (
        <div className="space-y-4">
          <p className="text-sm text-dark/60 dark:text-white/60 mb-2">
            Each AI feature resolves through a multi-tier provider chain. The system selects the highest-priority available provider for each request.
          </p>
          <div className="bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-white/10 text-left">
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Feature</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Resolved Tier</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Provider</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Status</th>
                    <th className="px-4 py-3 font-medium text-dark/60 dark:text-white/60">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/10">
                  {resolutions.map((res) => (
                    <ResolutionRow key={res.feature_key} resolution={res} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tier legend */}
          <div className="bg-surface dark:bg-white/5 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-dark dark:text-white mb-3">Resolution Tier Legend</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <Badge variant="primary" size="sm">System Key</Badge>
                <span className="text-xs text-dark/60 dark:text-white/60">Platform-managed API key with rotation and rate limiting</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="accent" size="sm">User BYOK</Badge>
                <span className="text-xs text-dark/60 dark:text-white/60">User-provided API key (Bring Your Own Key)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">Browser</Badge>
                <span className="text-xs text-dark/60 dark:text-white/60">Runs entirely in the browser with no API calls</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="warning" size="sm">Fallback</Badge>
                <span className="text-xs text-dark/60 dark:text-white/60">Reduced-quality fallback when primary provider is down</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="danger" size="sm">Unavailable</Badge>
                <span className="text-xs text-dark/60 dark:text-white/60">No provider configured or all providers are down</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Individual service health card. */
function ServiceCard({ service }: { service: ProviderService }) {
  const statusInfo = STATUS_CONFIG[service.status] || STATUS_CONFIG.unknown;
  const StatusIcon = statusInfo.icon;
  const ServiceIcon = SERVICE_ICONS[service.service] || Server;

  return (
    <div
      className={`bg-white dark:bg-dark/60 border rounded-xl p-4 transition-all ${
        service.status === 'active'
          ? 'border-border dark:border-white/10'
          : service.status === 'degraded'
          ? 'border-warning/30'
          : service.status === 'down'
          ? 'border-danger/30'
          : 'border-border dark:border-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${service.is_local ? 'bg-accent/10' : 'bg-primary/10'}`}>
            <ServiceIcon className={`w-4 h-4 ${service.is_local ? 'text-accent' : 'text-primary'}`} />
          </div>
          <div>
            <span className="font-semibold text-dark dark:text-white text-sm">
              {service.display_name}
            </span>
            {service.is_local && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-full">
                local
              </span>
            )}
          </div>
        </div>
        <Badge variant={statusInfo.badge} size="sm" icon={<StatusIcon className="w-3 h-3" />}>
          {statusInfo.label}
        </Badge>
      </div>

      <div className="space-y-1.5">
        {service.response_time_ms !== null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-dark/50 dark:text-white/50">Response Time</span>
            <span className={`font-mono ${
              service.response_time_ms < 300
                ? 'text-secondary'
                : service.response_time_ms < 1000
                ? 'text-warning'
                : 'text-danger'
            }`}>
              {service.response_time_ms}ms
            </span>
          </div>
        )}

        {service.key_count !== undefined && !service.is_local && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-dark/50 dark:text-white/50">API Keys</span>
            <span className="text-dark/70 dark:text-white/70">
              {service.healthy_keys ?? 0}/{service.key_count} healthy
            </span>
          </div>
        )}

        {service.total_daily_usage !== undefined && !service.is_local && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-dark/50 dark:text-white/50">Calls Today</span>
            <span className="font-mono text-dark/70 dark:text-white/70">
              {service.total_daily_usage.toLocaleString()}
            </span>
          </div>
        )}

        {service.last_checked && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-dark/50 dark:text-white/50">Last Checked</span>
            <span className="text-dark/50 dark:text-white/50">
              {formatRelativeTime(service.last_checked)}
            </span>
          </div>
        )}

        {service.is_local && service.status === 'unknown' && (
          <p className="text-[11px] text-dark/40 dark:text-white/40 mt-1">
            Browser-native engine. Status determined at runtime when the user initiates processing.
          </p>
        )}
      </div>
    </div>
  );
}

/** Single row in the provider resolution table. */
function ResolutionRow({ resolution }: { resolution: ProviderResolution }) {
  const tierInfo = TIER_CONFIG[resolution.resolved_tier] || TIER_CONFIG.unavailable;
  const FeatureIcon = FEATURE_DISPLAY[resolution.feature_key]?.icon || FileText;

  return (
    <tr className="hover:bg-surface dark:hover:bg-white/[0.02]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FeatureIcon className="w-4 h-4 text-dark/40 dark:text-white/40" />
          <span className="font-medium text-dark dark:text-white text-sm">
            {resolution.display_name}
          </span>
        </div>
        <span className="text-[11px] font-mono text-dark/40 dark:text-white/40 ml-6">
          {resolution.feature_key}
        </span>
      </td>
      <td className="px-4 py-3">
        <Badge variant={tierInfo.badge} size="sm">
          {tierInfo.label}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-dark/80 dark:text-white/80">{resolution.provider_name}</span>
      </td>
      <td className="px-4 py-3">
        {resolution.is_available ? (
          <span className="inline-flex items-center gap-1 text-xs text-secondary">
            <CheckCircle className="w-3.5 h-3.5" />
            Available
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-danger">
            <XCircle className="w-3.5 h-3.5" />
            Unavailable
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-dark/50 dark:text-white/50 max-w-[200px] truncate block" title={resolution.details}>
          {resolution.details || '---'}
        </span>
      </td>
    </tr>
  );
}

/** Format an ISO timestamp into a human-readable relative string. */
function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return isoString;
  }
}
