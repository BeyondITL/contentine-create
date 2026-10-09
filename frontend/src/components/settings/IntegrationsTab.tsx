'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Link2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Youtube,
  Music2,
  Instagram,
  Facebook,
  Linkedin,
  AtSign,
  Twitter,
  Clock,
} from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import { formatDistanceToNow } from 'date-fns';
import type { Platform, SocialAccount } from '@/types';
import type { ReactNode } from 'react';

/** Platform metadata for display with lucide icons. */
const PLATFORMS: {
  id: Platform;
  name: string;
  color: string;
  icon: ReactNode;
  description: string;
}[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: <Youtube size={16} />,
    description: 'Publish videos and shorts directly to your channel',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#25F4EE',
    icon: <Music2 size={16} />,
    description: 'Share short-form videos with your TikTok audience',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E1306C',
    icon: <Instagram size={16} />,
    description: 'Post reels, stories, and feed content',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: <Facebook size={16} />,
    description: 'Share posts and videos to your page or profile',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: <Linkedin size={16} />,
    description: 'Publish professional content and articles',
  },
  {
    id: 'threads',
    name: 'Threads',
    color: '#555555',
    icon: <AtSign size={16} />,
    description: 'Share text posts and conversations',
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    color: '#1DA1F2',
    icon: <Twitter size={16} />,
    description: 'Post tweets, threads, and media',
  },
];

/** Integrations tab — connected social accounts grid. */
export default function IntegrationsTab() {
  const { socialAccounts, fetchSocialAccounts, disconnectSocial } = useScheduleStore();

  const [isLoading, setIsLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [localError, setLocalError] = useState('');
  const popupRef = useRef<Window | null>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch social accounts on mount
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setFetchError('');
      try {
        await fetchSocialAccounts();
      } catch {
        setFetchError('Failed to load connected accounts.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Listen for OAuth callback postMessage from the popup (oauth-callback, oauth-success, oauth-error). */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const cleanup = () => {
        setConnecting(null);
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        popupRef.current = null;
        if (connectingTimeoutRef.current) {
          clearTimeout(connectingTimeoutRef.current);
          connectingTimeoutRef.current = null;
        }
      };

      if (event.data?.type === 'oauth-callback') {
        if (event.data.success) {
          fetchSocialAccounts();
        } else {
          setLocalError(event.data.message || 'Failed to connect account. Please try again.');
        }
        cleanup();
      }
      if (event.data?.type === 'oauth-success') {
        fetchSocialAccounts();
        setLocalError('');
        cleanup();
      }
      if (event.data?.type === 'oauth-error') {
        const msg = event.data.message || 'Failed to connect account. Please try again.';
        // Surface unconfigured API key errors with admin guidance
        if (msg.toLowerCase().includes('not configured') || msg.toLowerCase().includes('api key')) {
          const platformName = event.data.platform
            ? PLATFORMS.find((p) => p.id === event.data.platform)?.name || event.data.platform
            : 'this platform';
          setLocalError(`Configure ${platformName} API credentials in Admin \u2192 System Keys`);
        } else {
          setLocalError(msg);
        }
        cleanup();
      }
    },
    [fetchSocialAccounts]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
      }
    };
  }, []);

  /** Find connected account for a platform. */
  function getConnectedAccount(platformId: Platform): SocialAccount | undefined {
    return socialAccounts.find((a) => a.platform === platformId);
  }

  /** Initiate OAuth connect flow via popup. */
  function handleConnect(platformId: Platform) {
    setLocalError('');
    setConnecting(platformId);

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    popupRef.current = window.open(
      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/oauth/${platformId}`,
      `oauth-${platformId}`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,popup=1`
    );

    // Poll for popup close (user may close without completing OAuth)
    const pollTimer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(pollTimer);
        setConnecting(null);
        popupRef.current = null;
      }
    }, 500);

    // Auto-reset connecting state after 60s
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
    }
    connectingTimeoutRef.current = setTimeout(() => {
      setConnecting(null);
      connectingTimeoutRef.current = null;
    }, 60000);
  }

  /** Disconnect a social account. */
  async function handleDisconnect(account: SocialAccount) {
    setLocalError('');
    setDisconnecting(account.id);
    try {
      await disconnectSocial(account.id);
    } catch {
      setLocalError(`Failed to disconnect ${account.platform}. Please try again.`);
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Link2 size={16} className="text-primary" />
          <h2 className="text-[14px] font-semibold text-text dark:text-white">
            Connected Accounts
          </h2>
        </div>
        <p className="text-[12px] text-text-muted leading-relaxed">
          Connect your social media accounts to publish content directly from Contentine Create.
        </p>
      </div>

      {/* Error */}
      {(fetchError || localError) && (
        <div className="flex items-center gap-2 text-[12px] text-danger bg-danger/[0.06] rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{fetchError || localError}</span>
          {fetchError && (
            <button
              type="button"
              onClick={() => {
                setFetchError('');
                setIsLoading(true);
                fetchSocialAccounts()
                  .catch(() => setFetchError('Failed to load connected accounts.'))
                  .finally(() => setIsLoading(false));
              }}
              className="ml-auto text-danger hover:text-danger/80 cursor-pointer"
              aria-label="Retry loading"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bento-card p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]" />
                <div>
                  <div className="w-20 h-4 rounded-md bg-black/[0.04] dark:bg-white/[0.06] mb-1" />
                  <div className="w-32 h-3 rounded-md bg-black/[0.04] dark:bg-white/[0.06]" />
                </div>
              </div>
              <div className="w-full h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]" />
            </div>
          ))}
        </div>
      )}

      {/* Platform cards */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLATFORMS.map((platform) => {
            const account = getConnectedAccount(platform.id);
            const isConnected = !!account;
            const isDisconnecting = disconnecting === account?.id;

            return (
              <div
                key={platform.id}
                className={`
                  bento-card p-4 md:p-5 transition-all duration-200
                  ${isConnected ? 'ring-1 ring-secondary/20 dark:ring-secondary/30' : ''}
                `}
              >
                {/* Platform header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: platform.color }}
                  >
                    {platform.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-text dark:text-white">
                        {platform.name}
                      </h3>
                      {isConnected && (
                        <span className="badge-success text-[10px] shrink-0">
                          <Check size={10} className="mr-0.5" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted truncate">
                      {isConnected
                        ? account.account_name || 'Connected account'
                        : platform.description}
                    </p>
                    {isConnected && account.connected_at && (
                      <p className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                        <Clock size={9} className="shrink-0" />
                        Connected {formatDistanceToNow(new Date(account.connected_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Connect / Disconnect button */}
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(account)}
                    disabled={isDisconnecting}
                    className="btn-ghost w-full flex items-center justify-center gap-2 min-h-[44px] md:min-h-0 text-danger hover:bg-danger/[0.06] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      <>
                        <X size={14} />
                        Disconnect
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(platform.id)}
                    disabled={connecting === platform.id}
                    className="btn-secondary w-full flex items-center justify-center gap-2 min-h-[44px] md:min-h-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connecting === platform.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ExternalLink size={14} />
                        Connect {platform.name}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && (
        <p className="text-[11px] text-text-muted text-center pt-1">
          Contentine Create only requests the minimum permissions needed to publish on your behalf. You can disconnect any account at any time.
        </p>
      )}
    </div>
  );
}
