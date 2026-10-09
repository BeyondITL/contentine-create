'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Shield,
  Clock,
  FlaskConical,
  Download,
} from 'lucide-react';
import { useApiKeysStore } from '@/stores/api-keys-store';
import type { ApiKeyScope } from '@/stores/api-keys-store';
import { useByokStore } from '@/stores/byok-store';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

// ── Scope definitions ────────────────────────────────────────

const AVAILABLE_SCOPES: { id: ApiKeyScope; label: string; description: string }[] = [
  { id: 'videos:read', label: 'Videos (Read)', description: 'List and retrieve videos' },
  { id: 'videos:write', label: 'Videos (Write)', description: 'Create and update videos' },
  { id: 'content:read', label: 'Content (Read)', description: 'Read remix and writer content' },
  { id: 'content:write', label: 'Content (Write)', description: 'Create and modify content' },
  { id: 'analytics:read', label: 'Analytics (Read)', description: 'Access analytics data' },
  { id: 'publish:write', label: 'Publish (Write)', description: 'Publish to social platforms' },
];

/** Format a date string to a human-readable relative or absolute form. */
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

/** Settings section for managing API keys. */
export default function ApiKeysSection() {
  const {
    keys,
    isLoading,
    error,
    newlyCreatedSecret,
    fetchKeys,
    createKey,
    revokeKey,
    clearNewSecret,
  } = useApiKeysStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<number | null>(null);
  const [createName, setCreateName] = useState('');
  const [createScopes, setCreateScopes] = useState<ApiKeyScope[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [createError, setCreateError] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Fetch keys on mount
  useEffect(() => {
    fetchKeys();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Toggle a scope in the create form. */
  const toggleScope = useCallback((scope: ApiKeyScope) => {
    setCreateScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }, []);

  /** Handle creating a new API key. */
  async function handleCreate() {
    if (!createName.trim()) {
      setCreateError('Name is required.');
      return;
    }
    if (createScopes.length === 0) {
      setCreateError('Select at least one scope.');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    try {
      await createKey(createName.trim(), createScopes);
      setShowCreateModal(false);
      setCreateName('');
      setCreateScopes([]);
    } catch {
      setCreateError('Failed to create API key. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  /** Handle revoking an API key. */
  async function handleRevoke(id: number) {
    setIsRevoking(true);
    try {
      await revokeKey(id);
      setShowRevokeConfirm(null);
    } catch {
      // Error is set in the store
    } finally {
      setIsRevoking(false);
    }
  }

  /** Copy the newly created secret to the clipboard. */
  async function handleCopySecret() {
    if (!newlyCreatedSecret) return;
    try {
      await navigator.clipboard.writeText(newlyCreatedSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = newlyCreatedSecret;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header card */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Key size={16} className="text-primary" />
              <h2 className="text-[14px] font-semibold text-text dark:text-white">API Keys</h2>
            </div>
            <p className="text-[12px] text-text-muted leading-relaxed">
              Create API keys to access your content programmatically via the Contentine Create API.
            </p>
          </div>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              setCreateName('');
              setCreateScopes([]);
              setCreateError('');
              setShowCreateModal(true);
            }}
          >
            Create API Key
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
            onClick={fetchKeys}
            className="ml-auto text-danger hover:text-danger/80 cursor-pointer"
            aria-label="Retry loading"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      {/* Newly created secret banner — shown once */}
      {newlyCreatedSecret && (
        <div className="bento-card border-secondary/30 dark:border-secondary/40 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Shield size={16} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text dark:text-white mb-1">
                API key created successfully
              </p>
              <p className="text-[11px] text-text-muted mb-3 leading-relaxed">
                Copy your secret key now. You will not be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 text-[12px] font-mono bg-black/[0.03] dark:bg-white/[0.06] px-3 py-2 rounded-lg text-text dark:text-[#E0E0E0] truncate select-all">
                  {newlyCreatedSecret}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copiedSecret ? <Check size={14} className="text-secondary" /> : <Copy size={14} />}
                  onClick={handleCopySecret}
                >
                  {copiedSecret ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={clearNewSecret}
              className="text-text-muted/40 hover:text-text-muted transition-colors cursor-pointer p-1"
              aria-label="Dismiss"
            >
              <span className="text-[16px] leading-none">&times;</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bento-card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="w-28 h-4 rounded-md mb-1.5" />
                  <Skeleton className="w-48 h-3 rounded-md" />
                </div>
                <Skeleton className="w-16 h-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && keys.length === 0 && (
        <EmptyState
          icon={<Key size={24} className="text-primary" />}
          headline="No API keys yet"
          description="Create API keys to access your content programmatically via the Contentine Create API."
          ctaLabel="Create API Key"
          onCTA={() => {
            setCreateName('');
            setCreateScopes([]);
            setCreateError('');
            setShowCreateModal(true);
          }}
        />
      )}

      {/* Keys list */}
      {!isLoading && keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((apiKey) => (
            <div
              key={apiKey.id}
              className="bento-card p-4 md:p-5 transition-all duration-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="w-9 h-9 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                  <Key size={16} className="text-primary" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-[13px] font-semibold text-text dark:text-white truncate">
                      {apiKey.name}
                    </h3>
                    <code className="text-[11px] font-mono text-text-muted bg-black/[0.03] dark:bg-white/[0.06] px-1.5 py-0.5 rounded shrink-0">
                      {apiKey.key_prefix}...
                    </code>
                  </div>

                  {/* Scopes */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {apiKey.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/[0.06] text-primary dark:bg-primary/[0.12] dark:text-[#66DAFF]"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      Last used: {formatDate(apiKey.last_used_at)}
                    </span>
                    <span>Created: {formatDate(apiKey.created_at)}</span>
                  </div>
                </div>

                {/* Revoke button */}
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => setShowRevokeConfirm(apiKey.id)}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create API Key"
        description="Give your key a name and select the permissions it needs."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              isLoading={isCreating}
              disabled={!createName.trim() || createScopes.length === 0}
            >
              Create Key
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Key Name"
            placeholder="e.g. Production API, CI/CD Pipeline"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            maxLength={64}
          />

          <div>
            <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-2">
              Scopes
            </label>
            <div className="space-y-2">
              {AVAILABLE_SCOPES.map((scope) => {
                const isSelected = createScopes.includes(scope.id);
                return (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => toggleScope(scope.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] md:min-h-0 rounded-xl border transition-all duration-150 cursor-pointer text-left
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                      ${isSelected
                        ? 'border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.08]'
                        : 'border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.12]'
                      }
                    `}
                  >
                    <div
                      className={`
                        w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors
                        ${isSelected
                          ? 'bg-primary text-white'
                          : 'border border-black/[0.15] dark:border-white/[0.15]'
                        }
                      `}
                    >
                      {isSelected && <Check size={10} />}
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-text dark:text-[#E0E0E0]">
                        {scope.label}
                      </p>
                      <p className="text-[11px] text-text-muted">{scope.description}</p>
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

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={showRevokeConfirm !== null}
        onClose={() => setShowRevokeConfirm(null)}
        title="Revoke API Key"
        description="This action cannot be undone. Any applications using this key will immediately lose access."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowRevokeConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => showRevokeConfirm !== null && handleRevoke(showRevokeConfirm)}
              isLoading={isRevoking}
              icon={<Trash2 size={13} />}
            >
              Revoke Key
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 p-3 bg-danger/[0.04] rounded-xl">
          <AlertTriangle size={18} className="text-danger shrink-0" />
          <p className="text-[12px] text-text dark:text-[#E0E0E0] leading-relaxed">
            All API requests using this key will fail with a 401 Unauthorized error.
          </p>
        </div>
      </Modal>
    </div>
  );
}

// ── BYOK (Bring-Your-Own-Key) section — merged from api-keys-section.tsx (WS-8) ──

/** Cloud AI provider definitions for BYOK key management. */
interface ByokServiceDef {
  id: string;
  name: string;
  description: string;
  color: string;
  placeholder: string;
  docsUrl: string;
}

const BYOK_SERVICES: ByokServiceDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for script generation, content remix, and AI writing.',
    color: '#D97706',
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini models for alternative AI generation and processing.',
    color: '#4285F4',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT and DALL-E models for text and image generation.',
    color: '#10A37F',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
];

/** Format a date string to relative or absolute form. */
function formatByokDate(dateStr: string | null): string {
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

function ByokServiceKeyCard({ service }: { service: ByokServiceDef }) {
  const { keys, addKey, removeKey, testKey } = useByokStore();

  const existingKey = keys.find((k) => k.service === service.id);
  const isConnected = !!existingKey && existingKey.is_active;

  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [addError, setAddError] = useState('');

  async function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) { setAddError('Please enter an API key.'); return; }
    setIsAdding(true);
    setAddError('');
    setTestResult(null);
    const result = await addKey(service.id, trimmed, service.name);
    if (result.success) {
      setInputValue('');
    } else {
      setAddError(result.error ?? 'Failed to add key.');
    }
    setIsAdding(false);
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    const result = await testKey(service.id);
    setTestResult(result);
    setIsTesting(false);
    // Clear the test result after 5 seconds
    setTimeout(() => setTestResult(null), 5000);
  }

  async function handleRemove() {
    setIsRemoving(true);
    setTestResult(null);
    try { await removeKey(service.id); } catch { /* Error is handled in the store */ }
    finally { setIsRemoving(false); }
  }

  return (
    <div className={`bento-card p-4 md:p-5 transition-all duration-200 ${isConnected ? 'ring-1 ring-secondary/20 dark:ring-secondary/30' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: service.color }}>
          <Key size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-text dark:text-white">{service.name}</h3>
            {isConnected ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/[0.08] text-secondary dark:bg-secondary/[0.14] dark:text-[#5DD85F]">
                <Check size={10} />Connected
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/[0.03] text-text-muted dark:bg-white/[0.06] dark:text-[#888]">
                Not connected
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted truncate">{service.description}</p>
        </div>
      </div>

      {isConnected && existingKey && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1"><Clock size={11} />Last used: {formatByokDate(existingKey.last_used_at)}</span>
            <span>Added: {formatByokDate(existingKey.created_at)}</span>
          </div>
          {existingKey.last_error && (
            <div className="flex items-start gap-2 text-[11px] text-danger bg-danger/[0.04] dark:bg-danger/[0.08] rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span className="leading-relaxed">{existingKey.last_error}</span>
            </div>
          )}
          {testResult && (
            <div className={`flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 ${testResult.success ? 'text-secondary bg-secondary/[0.04] dark:bg-secondary/[0.08]' : 'text-danger bg-danger/[0.04] dark:bg-danger/[0.08]'}`}>
              {testResult.success ? <Check size={13} /> : <AlertCircle size={13} />}
              <span>{testResult.message}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={isTesting ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} onClick={handleTest} disabled={isTesting}>
              {isTesting ? 'Testing...' : 'Test Key'}
            </Button>
            <Button variant="danger" size="sm" icon={isRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} onClick={handleRemove} disabled={isRemoving}>
              {isRemoving ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setAddError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder={service.placeholder}
              autoComplete="off"
              className={`flex-1 min-w-0 px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 text-[12px] rounded-xl md:rounded-lg bg-white dark:bg-[#1e1e1e] border transition-colors duration-150 placeholder:text-text-muted/50 text-text dark:text-[#E0E0E0] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 ${addError ? 'border-danger/40 dark:border-danger/40' : 'border-black/[0.08] dark:border-white/[0.08]'}`}
            />
            <Button size="sm" onClick={handleAdd} isLoading={isAdding} disabled={!inputValue.trim()}>
              Add Key
            </Button>
          </div>
          {addError && (
            <p className="flex items-center gap-1 text-[11px] text-danger">
              <AlertCircle size={12} />{addError}
            </p>
          )}
          <p className="text-[11px] text-text-muted">
            Get your API key from{' '}
            <a href={service.docsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {service.name} dashboard
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function ByokApiKeysSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bento-card p-4 md:p-5 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="w-24 h-4 rounded-md mb-1.5" />
              <Skeleton className="w-48 h-3 rounded-md" />
            </div>
          </div>
          <Skeleton className="w-full h-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/**
 * BYOK API Keys settings section — manage user-provided cloud AI provider keys.
 * Merged from the former api-keys-section.tsx (WS-8 duplicate-component consolidation).
 */
export function ApiKeysSettingsSection() {
  const { keys, isLoading, error, fetchKeys } = useByokStore();
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    fetchKeys().then(() => setHasFetched(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-primary" />
          <h2 className="text-[14px] font-semibold text-text dark:text-white">Your API Keys</h2>
        </div>
        <p className="text-[12px] text-text-muted leading-relaxed">
          Bring your own API keys for cloud AI providers. Your keys are encrypted and never stored in plain text.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[12px] text-danger bg-danger/[0.06] rounded-lg px-3 py-2.5">
          <AlertCircle size={13} className="shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={fetchKeys} className="ml-auto underline hover:no-underline cursor-pointer text-danger" aria-label="Retry loading">
            Retry
          </button>
        </div>
      )}

      {isLoading && !hasFetched && <ByokApiKeysSkeleton />}

      {(!isLoading || hasFetched) && (
        <div className="space-y-3">
          {BYOK_SERVICES.map((service) => (
            <ByokServiceKeyCard key={service.id} service={service} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-muted text-center pt-1">
        Keys are encrypted with AES-256-GCM before storage. Contentine Create never logs or shares your API keys.
      </p>
    </div>
  );
}
