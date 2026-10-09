'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { Check, ArrowLeft, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';

/** Platform definitions with brand colors for the connect step. */
const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    bgLight: '#FFF0F0',
    bgDark: 'rgba(255,0,0,0.08)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#000000',
    bgLight: '#F5F5F5',
    bgDark: 'rgba(255,255,255,0.06)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    bgLight: '#FFF0F3',
    bgDark: 'rgba(228,64,95,0.08)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    bgLight: '#F0F4FF',
    bgDark: 'rgba(24,119,242,0.08)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    bgLight: '#F0F6FF',
    bgDark: 'rgba(10,102,194,0.08)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    id: 'threads',
    name: 'Threads',
    color: '#000000',
    bgLight: '#F5F5F5',
    bgDark: 'rgba(255,255,255,0.06)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.017.88-.724 2.107-1.138 3.455-1.165 1.01-.02 1.937.118 2.776.41-.03-1.725-.683-2.908-1.94-3.518-.824-.399-1.88-.594-3.14-.581-1.16.012-2.376.272-3.137.669l-.902-1.766c.998-.519 2.528-.844 3.973-.86h.094c1.694 0 3.074.332 4.1.987 1.2.767 1.994 1.942 2.36 3.478.338-.18.686-.34 1.042-.477l.839 1.838c-.51.233-1.045.44-1.593.608.078.57.1 1.171.055 1.803-.19 2.713-1.398 4.56-3.594 5.495C17.165 23.369 15.102 23.97 12.186 24zm1.474-8.6c-.944.02-1.72.222-2.318.603-.524.334-.79.78-.767 1.29.023.49.3.916.8 1.24.59.381 1.352.545 2.138.467 1.093-.11 1.93-.513 2.49-1.2.42-.518.723-1.24.883-2.167-.7-.246-1.468-.38-2.294-.38-.307 0-.618.016-.932.047v.1z" />
      </svg>
    ),
  },
  {
    id: 'x',
    name: 'X',
    color: '#000000',
    bgLight: '#F5F5F5',
    bgDark: 'rgba(255,255,255,0.06)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      </svg>
    ),
  },
] as const;

/** Step 3 — Connect social platforms (optional). */
export default function ConnectPlatformsStep() {
  const { connectedPlatforms, addConnectedPlatform, setStep } = useOnboardingStore();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Listen for OAuth callback postMessage from the popup. */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Accept both 'oauth-callback' (PlatformConnectCard pattern) and 'oauth-success' for flexibility
      if (event.data?.type === 'oauth-callback' && event.data?.success) {
        const platform = event.data.platform || connecting;
        if (platform) addConnectedPlatform(platform);
        setConnecting(null);
        setError(null);
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        popupRef.current = null;
        if (connectingTimeoutRef.current) {
          clearTimeout(connectingTimeoutRef.current);
          connectingTimeoutRef.current = null;
        }
      }
      if (event.data?.type === 'oauth-success') {
        const platform = event.data.platform || connecting;
        if (platform) addConnectedPlatform(platform);
        setConnecting(null);
        setError(null);
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        popupRef.current = null;
        if (connectingTimeoutRef.current) {
          clearTimeout(connectingTimeoutRef.current);
          connectingTimeoutRef.current = null;
        }
      }
      if (event.data?.type === 'oauth-error') {
        setConnecting(null);
        const msg = event.data.message || 'Failed to connect. Please try again.';
        // Surface unconfigured API key errors with admin guidance
        if (msg.toLowerCase().includes('not configured') || msg.toLowerCase().includes('api key')) {
          const platformId = event.data.platform || connecting;
          const platformName = platformId
            ? PLATFORMS.find((p) => p.id === platformId)?.name || platformId
            : 'this platform';
          setError(`Configure ${platformName} API credentials in Admin \u2192 System Keys`);
        } else {
          setError(msg);
        }
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        popupRef.current = null;
        if (connectingTimeoutRef.current) {
          clearTimeout(connectingTimeoutRef.current);
          connectingTimeoutRef.current = null;
        }
      }
    },
    [connecting, addConnectedPlatform]
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

  /** Open OAuth popup for the specified platform. */
  const handleConnect = (platformId: string) => {
    setError(null);
    setConnecting(platformId);

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    popupRef.current = window.open(
      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/oauth/${platformId}`,
      `connect-${platformId}`,
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

    // Auto-reset connecting state after 60s in case the popup was silently closed
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
    }
    connectingTimeoutRef.current = setTimeout(() => {
      setConnecting(null);
      connectingTimeoutRef.current = null;
    }, 60000);
  };

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => setStep(2)}
        className="flex items-center gap-1.5 text-[13px] text-text-secondary dark:text-[#AAA] hover:text-text dark:hover:text-white mb-6 transition-colors min-h-[44px] md:min-h-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-1"
        aria-label="Go back to previous step"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Heading */}
      <h2 className="text-xl sm:text-2xl font-bold text-text dark:text-white mb-2 tracking-tight">
        Connect your platforms
      </h2>
      <p className="text-[14px] text-text-secondary dark:text-[#AAA] mb-8">
        Publish directly to your accounts. You can always do this later in Settings.
      </p>

      {/* Platform grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLATFORMS.map((platform) => {
          const isConnected = connectedPlatforms.includes(platform.id);
          return (
            <div
              key={platform.id}
              className={`
                bento-card flex items-center gap-3 p-4 rounded-2xl transition-all duration-200
                ${isConnected ? 'border-secondary/40 dark:border-secondary/30' : ''}
              `}
              style={isConnected ? { borderColor: 'rgba(53,200,56,0.4)' } : undefined}
            >
              {/* Platform icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: isConnected
                    ? 'rgba(53,200,56,0.1)'
                    : 'var(--tw-bg, #F5F5F5)',
                  color: isConnected ? '#35C838' : platform.color,
                }}
              >
                {isConnected ? (
                  <Check className="w-5 h-5 text-secondary" strokeWidth={2.5} />
                ) : (
                  <span style={{ color: platform.color }}>{platform.icon}</span>
                )}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-semibold text-text dark:text-white block">
                  {platform.name}
                </span>
                {isConnected && (
                  <span className="text-[11px] text-secondary font-medium">Connected</span>
                )}
              </div>

              {/* Connect button */}
              {!isConnected ? (
                <button
                  onClick={() => handleConnect(platform.id)}
                  disabled={connecting === platform.id}
                  className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-[12px] min-h-[44px] md:min-h-0 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connecting === platform.id ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3 h-3" />
                      Connect
                    </>
                  )}
                </button>
              ) : (
                <div className="w-5 h-5 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-secondary" strokeWidth={3} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/[0.06] border border-danger/10">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          <p className="text-[12px] text-danger">{error}</p>
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => setStep(4)}
          className="text-[13px] text-text-secondary dark:text-[#AAA] hover:text-text dark:hover:text-white transition-colors min-h-[44px] md:min-h-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-2"
        >
          Skip for now
        </button>
        <button
          onClick={() => setStep(4)}
          className="btn-primary px-6"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
