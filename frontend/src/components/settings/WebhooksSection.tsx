'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Check,
  X,
  Zap,
  Globe,
  ToggleLeft,
  ToggleRight,
  Send,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useWebhooksStore } from '@/stores/webhooks-store';
import type { WebhookEvent } from '@/stores/webhooks-store';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

// ── Event definitions ────────────────────────────────────────

const AVAILABLE_EVENTS: { id: WebhookEvent; label: string; description: string }[] = [
  { id: 'video.completed', label: 'Video Completed', description: 'When a video finishes rendering' },
  { id: 'video.failed', label: 'Video Failed', description: 'When a video render fails' },
  { id: 'publish.success', label: 'Publish Success', description: 'When content is published to a platform' },
  { id: 'publish.failed', label: 'Publish Failed', description: 'When publishing fails' },
  { id: 'remix.completed', label: 'Remix Completed', description: 'When content remix is finished' },
  { id: 'schedule.published', label: 'Schedule Published', description: 'When a scheduled post goes live' },
  { id: 'team.member_joined', label: 'Team Member Joined', description: 'When a new member joins your team' },
];

/** Truncate a URL for display, keeping protocol and domain visible. */
function truncateUrl(url: string, maxLen = 45): string {
  if (url.length <= maxLen) return url;
  try {
    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.host}`;
    const path = parsed.pathname;
    if (base.length + 3 >= maxLen) return base.slice(0, maxLen - 3) + '...';
    const remaining = maxLen - base.length - 3;
    return `${base}${path.slice(0, remaining)}...`;
  } catch {
    return url.slice(0, maxLen - 3) + '...';
  }
}

/** Format a date string to relative or absolute. */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Settings section for managing webhook endpoints. */
export default function WebhooksSection() {
  const {
    webhooks,
    isLoading,
    error,
    testResult,
    testingId,
    fetchWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    clearTestResult,
  } = useWebhooksStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [createUrl, setCreateUrl] = useState('');
  const [createEvents, setCreateEvents] = useState<WebhookEvent[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Fetch webhooks on mount
  useEffect(() => {
    fetchWebhooks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Toggle an event in the create form. */
  const toggleEvent = useCallback((event: WebhookEvent) => {
    setCreateEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }, []);

  /** Validate URL format. */
  function isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /** Handle creating a new webhook. */
  async function handleCreate() {
    if (!createUrl.trim()) {
      setCreateError('URL is required.');
      return;
    }
    if (!isValidUrl(createUrl.trim())) {
      setCreateError('Please enter a valid URL (must start with https:// or http://).');
      return;
    }
    if (createEvents.length === 0) {
      setCreateError('Select at least one event.');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    try {
      await createWebhook(createUrl.trim(), createEvents);
      setShowCreateModal(false);
      setCreateUrl('');
      setCreateEvents([]);
    } catch {
      setCreateError('Failed to create webhook. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  /** Handle deleting a webhook. */
  async function handleDelete(id: number) {
    setIsDeleting(true);
    try {
      await deleteWebhook(id);
      setShowDeleteConfirm(null);
    } catch {
      // Error is set in the store
    } finally {
      setIsDeleting(false);
    }
  }

  /** Handle toggling a webhook active state. */
  async function handleToggleActive(id: number, currentState: boolean) {
    setTogglingId(id);
    try {
      await updateWebhook(id, { is_active: !currentState });
    } catch {
      // Error is set in the store
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header card */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <WebhookIcon size={16} className="text-primary" />
              <h2 className="text-[14px] font-semibold text-text dark:text-white">Webhooks</h2>
            </div>
            <p className="text-[12px] text-text-muted leading-relaxed">
              Set up webhooks to get notified when events happen in Contentine Create.
            </p>
          </div>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              setCreateUrl('');
              setCreateEvents([]);
              setCreateError('');
              setShowCreateModal(true);
            }}
          >
            Add Webhook
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-[12px] text-danger bg-danger/[0.06] rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchWebhooks}
            className="ml-auto text-danger hover:text-danger/80 cursor-pointer"
            aria-label="Retry loading"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div
          className={`
            flex items-center gap-2 text-[12px] rounded-lg px-3 py-2.5
            ${testResult.success
              ? 'text-secondary bg-secondary/[0.06]'
              : 'text-danger bg-danger/[0.06]'
            }
          `}
        >
          {testResult.success ? <Check size={13} className="shrink-0" /> : <X size={13} className="shrink-0" />}
          <span>
            {testResult.success
              ? `Test succeeded — ${testResult.status_code} in ${testResult.response_time_ms}ms`
              : `Test failed${testResult.error ? `: ${testResult.error}` : ''}`
            }
          </span>
          <button
            type="button"
            onClick={clearTestResult}
            className="ml-auto hover:opacity-70 cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bento-card p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="w-56 h-4 rounded-md mb-1.5" />
                  <div className="flex gap-1">
                    <Skeleton className="w-20 h-5 rounded-full" />
                    <Skeleton className="w-20 h-5 rounded-full" />
                    <Skeleton className="w-24 h-5 rounded-full" />
                  </div>
                </div>
                <Skeleton className="w-20 h-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && webhooks.length === 0 && (
        <EmptyState
          icon={<WebhookIcon size={24} className="text-primary" />}
          headline="No webhooks configured"
          description="Set up webhooks to get notified when events happen in Contentine Create."
          ctaLabel="Add Webhook"
          onCTA={() => {
            setCreateUrl('');
            setCreateEvents([]);
            setCreateError('');
            setShowCreateModal(true);
          }}
        />
      )}

      {/* Webhooks list */}
      {!isLoading && webhooks.length > 0 && (
        <div className="space-y-2">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className={`
                bento-card p-4 md:p-5 transition-all duration-200
                ${!webhook.is_active ? 'opacity-60' : ''}
              `}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="w-9 h-9 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                  <Globe size={16} className="text-primary" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* URL and active toggle */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <code className="text-[12px] font-mono text-text dark:text-[#E0E0E0] truncate">
                      {truncateUrl(webhook.url)}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(webhook.id, webhook.is_active)}
                      disabled={togglingId === webhook.id}
                      className="shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded"
                      aria-label={webhook.is_active ? 'Deactivate webhook' : 'Activate webhook'}
                    >
                      {togglingId === webhook.id ? (
                        <Loader2 size={18} className="animate-spin text-text-muted" />
                      ) : webhook.is_active ? (
                        <ToggleRight size={20} className="text-secondary" />
                      ) : (
                        <ToggleLeft size={20} className="text-text-muted" />
                      )}
                    </button>
                  </div>

                  {/* Event badges */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {webhook.events.map((event) => (
                      <span
                        key={event}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-accent-bg text-purple-600 dark:bg-accent/[0.12] dark:text-accent"
                      >
                        <Zap size={8} />
                        {event}
                      </span>
                    ))}
                  </div>

                  {/* Metadata row */}
                  <div className="flex items-center gap-4 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      Last triggered: {formatDate(webhook.last_triggered_at)}
                    </span>
                    {webhook.failure_count > 0 && (
                      <span className="flex items-center gap-1 text-warning">
                        <AlertCircle size={11} />
                        {webhook.failure_count} failure{webhook.failure_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={testingId === webhook.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    onClick={() => testWebhook(webhook.id)}
                    disabled={testingId !== null}
                  >
                    Test
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => setShowDeleteConfirm(webhook.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Webhook"
        description="Provide an endpoint URL and choose which events to subscribe to."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              isLoading={isCreating}
              disabled={!createUrl.trim() || createEvents.length === 0}
            >
              Add Webhook
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Endpoint URL"
            placeholder="https://your-server.com/webhooks/contentine"
            value={createUrl}
            onChange={(e) => setCreateUrl(e.target.value)}
            maxLength={512}
          />

          <div>
            <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-2">
              Events
            </label>
            <div className="space-y-2">
              {AVAILABLE_EVENTS.map((event) => {
                const isSelected = createEvents.includes(event.id);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => toggleEvent(event.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] md:min-h-0 rounded-xl border transition-all duration-150 cursor-pointer text-left
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                      ${isSelected
                        ? 'border-accent/30 bg-accent/[0.04] dark:bg-accent/[0.08]'
                        : 'border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.12]'
                      }
                    `}
                  >
                    <div
                      className={`
                        w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors
                        ${isSelected
                          ? 'bg-accent text-white'
                          : 'border border-black/[0.15] dark:border-white/[0.15]'
                        }
                      `}
                    >
                      {isSelected && <Check size={10} />}
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-text dark:text-[#E0E0E0]">
                        {event.label}
                      </p>
                      <p className="text-[11px] text-text-muted">{event.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {createError && (
            <p className="flex items-center gap-1 text-[11px] text-danger">
              <AlertTriangle size={12} />
              {createError}
            </p>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm !== null}
        onClose={() => setShowDeleteConfirm(null)}
        title="Delete Webhook"
        description="This action cannot be undone. You will no longer receive notifications at this endpoint."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => showDeleteConfirm !== null && handleDelete(showDeleteConfirm)}
              isLoading={isDeleting}
              icon={<Trash2 size={13} />}
            >
              Delete Webhook
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 p-3 bg-danger/[0.04] rounded-xl">
          <AlertTriangle size={18} className="text-danger shrink-0" />
          <p className="text-[12px] text-text dark:text-[#E0E0E0] leading-relaxed">
            All pending event deliveries for this webhook will be discarded.
          </p>
        </div>
      </Modal>
    </div>
  );
}
