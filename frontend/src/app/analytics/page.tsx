'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  Download,
  AlertTriangle,
  RefreshCw,
  Bell,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
} from 'lucide-react';
import { useAnalyticsStore } from '@/stores/analytics-store';
import StatsRow from '@/components/analytics/StatsRow';
import ViewsChart from '@/components/analytics/ViewsChart';
import PlatformBreakdown from '@/components/analytics/PlatformBreakdown';
import VideoTable from '@/components/analytics/VideoTable';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import type { AnalyticsRange, AnalyticsMetric } from '@/types';

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All Platforms' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'threads', label: 'Threads' },
  { value: 'twitter', label: 'X (Twitter)' },
];

const METRIC_OPTIONS: { value: AnalyticsMetric; label: string }[] = [
  { value: 'views', label: 'Views' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'ctr', label: 'CTR' },
];

/** Analytics dashboard page. */
export default function AnalyticsPage() {
  const {
    range,
    platform,
    summary,
    daily,
    perVideo,
    platformBreakdown,
    alerts,
    isLoading,
    error,
    setRange,
    setPlatform,
    fetchAnalytics,
    fetchAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
    exportData,
  } = useAnalyticsStore();

  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [newAlertMetric, setNewAlertMetric] = useState<AnalyticsMetric>('views');
  const [newAlertThreshold, setNewAlertThreshold] = useState('');
  const [isCreatingAlert, setIsCreatingAlert] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = 'Analytics \u2014 Contentine Create';
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchAnalytics();
    fetchAlerts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Alert creation handler
  const handleCreateAlert = useCallback(async () => {
    const threshold = parseInt(newAlertThreshold);
    if (isNaN(threshold) || threshold <= 0) return;

    setIsCreatingAlert(true);
    try {
      await createAlert(newAlertMetric, threshold);
      setNewAlertThreshold('');
    } catch {
      // Error handled via toast at store/global level
    } finally {
      setIsCreatingAlert(false);
    }
  }, [newAlertMetric, newAlertThreshold, createAlert]);

  // Loading state
  if (isLoading && !summary) {
    return <AnalyticsSkeleton />;
  }

  // Error state
  if (error && !summary) {
    return (
      <div>
        <div className="max-w-md mx-auto flex flex-col items-center text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-danger/[0.06] flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-danger" />
          </div>
          <h2 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
            Failed to load analytics
          </h2>
          <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
            {error}
          </p>
          <button
            type="button"
            onClick={() => fetchAnalytics()}
            className="btn-primary flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state — no data at all
  const isEmpty = !summary || (summary.total_views === 0 && summary.total_likes === 0);

  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart3 size={20} className="text-primary" />
            <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
              Analytics
            </h1>
          </div>
          <p className="text-sm text-text-muted">
            Track your content performance across all platforms.
          </p>
        </div>

        {/* Export buttons */}
        {!isEmpty && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => exportData('csv')}
              className="btn-secondary flex items-center gap-2 text-[12px] cursor-pointer"
            >
              <Download size={14} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportData('html')}
              className="btn-secondary flex items-center gap-2 text-[12px] cursor-pointer"
            >
              <Download size={14} />
              HTML report
            </button>
          </div>
        )}
      </div>

      {/* Date range pills + Platform filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Range pills — horizontally scrollable on mobile */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={`
                px-4 py-2 min-h-[44px] md:min-h-0 md:py-1.5 rounded-full text-[13px] md:text-[12px] font-medium
                whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${
                  range === opt.value
                    ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]'
                    : 'bg-white dark:bg-dark-secondary text-text-secondary dark:text-[#AAA] hover:bg-surface dark:hover:bg-[#333] border border-black/[0.06] dark:border-white/[0.06]'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Platform filter dropdown */}
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="input-field w-full sm:w-44 cursor-pointer"
          aria-label="Filter by platform"
        >
          {PLATFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <EmptyState
          icon={<BarChart3 size={28} className="text-primary" />}
          headline="No analytics data yet"
          description="Publish your first video to start tracking performance metrics across all your connected platforms."
          ctaLabel="Create Your First Video"
          ctaHref="/video/create"
        />
      )}

      {/* Populated state */}
      {!isEmpty && summary && (
        <>
          {/* Stats row */}
          <div className="mb-5">
            <StatsRow summary={summary} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <ViewsChart data={daily ?? []} />
            <PlatformBreakdown data={platformBreakdown ?? []} />
          </div>

          {/* Video performance table */}
          <div className="mb-6">
            <VideoTable data={perVideo ?? []} />
          </div>

          {/* Alert manager section */}
          <div>
            <button
              type="button"
              onClick={() => setAlertsExpanded(!alertsExpanded)}
              className="
                flex items-center gap-2 text-[13px] font-semibold text-text dark:text-[#E0E0E0]
                hover:text-primary transition-colors cursor-pointer min-h-[44px] md:min-h-0
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-2 py-1.5 md:px-1 md:py-0.5
              "
            >
              <Bell size={16} className="text-text-muted" />
              Performance Alerts
              <span className="text-[11px] text-text-muted font-normal ml-1">
                ({(alerts ?? []).length})
              </span>
              <ChevronDown
                size={14}
                className={`text-text-muted transition-transform duration-200 ${alertsExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {alertsExpanded && (
              <div className="mt-3 animate-fade-in">
                {/* Create new alert */}
                <div className="bento-card p-4 mb-3">
                  <h4 className="text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-2.5">
                    Create Alert
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={newAlertMetric}
                      onChange={(e) => setNewAlertMetric(e.target.value as AnalyticsMetric)}
                      className="input-field sm:w-36 cursor-pointer"
                      aria-label="Select metric"
                    >
                      {METRIC_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={newAlertThreshold}
                      onChange={(e) => setNewAlertThreshold(e.target.value)}
                      placeholder="Threshold (e.g., 1000)"
                      className="input-field flex-1"
                      min={1}
                      aria-label="Alert threshold"
                    />
                    <button
                      type="button"
                      onClick={handleCreateAlert}
                      disabled={isCreatingAlert || !newAlertThreshold}
                      className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Plus size={14} />
                      Add Alert
                    </button>
                  </div>
                </div>

                {/* Existing alerts list */}
                {(alerts ?? []).length === 0 ? (
                  <p className="text-[12px] text-text-muted py-4 text-center">
                    No alerts configured. Create one above to get notified about performance changes.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(alerts ?? []).map((alert) => (
                      <div
                        key={alert.id}
                        className="bento-card px-4 py-3 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0]">
                            {alert.metric.charAt(0).toUpperCase() + alert.metric.slice(1)} exceeds{' '}
                            <span className="font-semibold">{alert.threshold.toLocaleString()}</span>
                          </p>
                          {alert.last_triggered_at && (
                            <p className="text-[10px] text-text-muted mt-0.5">
                              Last triggered:{' '}
                              {new Date(alert.last_triggered_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                          )}
                        </div>

                        {/* Toggle active */}
                        <button
                          type="button"
                          onClick={() => updateAlert(alert.id, { is_active: !alert.is_active })}
                          aria-label={alert.is_active ? 'Disable alert' : 'Enable alert'}
                          className="
                            text-text-muted hover:text-text dark:hover:text-white
                            transition-colors cursor-pointer p-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1
                            flex items-center justify-center
                            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded
                          "
                        >
                          {alert.is_active ? (
                            <ToggleRight size={22} className="text-secondary" />
                          ) : (
                            <ToggleLeft size={22} />
                          )}
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => deleteAlert(alert.id)}
                          aria-label="Delete alert"
                          className="
                            text-text-muted hover:text-danger
                            transition-colors cursor-pointer p-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1
                            flex items-center justify-center
                            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded
                          "
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
