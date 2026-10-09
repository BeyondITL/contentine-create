'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Unplug,
  ExternalLink,
  Loader2,
  Clock,
} from 'lucide-react';
import type { SocialAccount, Platform } from '@/types';
import { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS } from './PlatformFilter';
import { useScheduleStore } from '@/stores/schedule-store';
import { formatDistanceToNow } from 'date-fns';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';

interface PlatformConnectCardProps {
  platform: Platform;
  /** The connected account for this platform, or null if not connected. */
  account: SocialAccount | null;
  /** Called when the user wants to disconnect. */
  onDisconnect: (accountId: number) => void;
}

/** Check if a token expires within the given number of days. */
function isTokenExpiringSoon(expiresAt: string | null, days: number = 7): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  const threshold = Date.now() + days * 24 * 60 * 60 * 1000;
  return expiry < threshold && expiry > Date.now();
}

/** Check if a token is already expired. */
function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/** Card for connecting or disconnecting a social platform account. */
export default function PlatformConnectCard({
  platform,
  account,
  onDisconnect,
}: PlatformConnectCardProps) {
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fetchSocialAccounts } = useScheduleStore();
  const isConnected = !!account;
  const expired = account ? isTokenExpired(account.token_expires_at) : false;
  const expiringSoon = account ? isTokenExpiringSoon(account.token_expires_at) : false;

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
      }
    };
  }, []);

  // Listen for OAuth callback postMessage (oauth-callback, oauth-success, oauth-error)
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const cleanup = () => {
        setConnecting(false);
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
        }
        cleanup();
      }
      if (event.data?.type === 'oauth-success') {
        fetchSocialAccounts();
        cleanup();
      }
      if (event.data?.type === 'oauth-error') {
        cleanup();
      }
    },
    [fetchSocialAccounts]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  function handleConnect() {
    setConnecting(true);
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    popupRef.current = window.open(
      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/oauth/${platform}`,
      `oauth-${platform}`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,popup=1`
    );

    // Poll for popup close (user may close without completing OAuth)
    const pollTimer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(pollTimer);
        setConnecting(false);
        popupRef.current = null;
      }
    }, 500);

    // Auto-reset connecting state after 60s in case the popup was silently closed
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
    }
    connectingTimeoutRef.current = setTimeout(() => {
      setConnecting(false);
      connectingTimeoutRef.current = null;
    }, 60000);
  }

  function handleDisconnect() {
    if (account) onDisconnect(account.id);
  }

  return (
    <div
      className={`
        flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-150
        ${
          isConnected && !expired
            ? 'bg-white dark:bg-[#1e1e1e] border-border-light dark:border-[#333]'
            : isConnected && expired
              ? 'bg-danger/[0.03] border-danger/20'
              : 'bg-surface dark:bg-[#151515] border-dashed border-border-light dark:border-[#333]'
        }
      `}
    >
      {/* Platform icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: PLATFORM_COLORS[platform] }}
      >
        {PLATFORM_ICONS[platform]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
            {PLATFORM_LABELS[platform]}
          </p>
          {isConnected && !expired && !expiringSoon && (
            <Badge variant="success" label="Connected" icon={<CheckCircle2 size={10} />} />
          )}
          {isConnected && expiringSoon && !expired && (
            <Badge variant="warning" label="Expires soon" icon={<AlertTriangle size={10} />} />
          )}
          {isConnected && expired && (
            <Badge variant="danger" label="Expired" icon={<AlertTriangle size={10} />} />
          )}
        </div>

        {isConnected && account?.account_name && (
          <p className="text-[11px] text-muted truncate mt-0.5">
            {account.account_name}
          </p>
        )}

        {isConnected && account?.connected_at && (
          <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5">
            <Clock size={9} className="shrink-0" />
            Connected {formatDistanceToNow(new Date(account.connected_at), { addSuffix: true })}
          </p>
        )}

        {!isConnected && (
          <p className="text-[11px] text-muted mt-0.5">
            Not connected
          </p>
        )}
      </div>

      {/* Action */}
      {isConnected ? (
        <div className="flex items-center gap-1.5 shrink-0">
          {(expired || expiringSoon) && (
            <Tooltip content="Reconnect account">
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="
                  flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 rounded-lg
                  text-[11px] font-medium text-warning bg-warning/[0.06]
                  hover:bg-warning/[0.12] transition-colors cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {connecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                Reconnect
              </button>
            </Tooltip>
          )}
          <Tooltip content="Disconnect">
            <button
              type="button"
              onClick={handleDisconnect}
              className="
                w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger/[0.06]
                transition-colors cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              "
            >
              <Unplug size={14} />
            </button>
          </Tooltip>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="
            flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] md:min-h-0 md:py-2 rounded-xl
            text-[12px] font-semibold text-white shrink-0
            hover:opacity-90 active:scale-[0.97] transition-all duration-150 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          style={{ backgroundColor: PLATFORM_COLORS[platform] }}
        >
          {connecting ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <ExternalLink size={13} />
              Connect
            </>
          )}
        </button>
      )}
    </div>
  );
}
