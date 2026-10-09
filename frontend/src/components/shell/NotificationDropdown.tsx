'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  Video,
  Globe,
  Users,
  AlertTriangle,
  Check,
  Inbox,
} from 'lucide-react';
import { useNotificationStore } from '@/stores/notification-store';
import type { NotificationType } from '@/types';
import { formatDistanceToNow } from 'date-fns';

const POLL_INTERVAL = 30_000; // 30 seconds

/** Returns the icon and color class for a notification type. */
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'render_complete':
      return { Icon: Video, colorClass: 'text-primary bg-primary/10' };
    case 'post_published':
    case 'publish_success':
      return { Icon: Globe, colorClass: 'text-secondary bg-secondary/10' };
    case 'team_activity':
      return { Icon: Users, colorClass: 'text-accent bg-accent/10' };
    case 'system':
      return { Icon: Bell, colorClass: 'text-info bg-info/10' };
    case 'alert':
      return { Icon: AlertTriangle, colorClass: 'text-warning bg-warning/10' };
    case 'publish_failed':
      return { Icon: AlertTriangle, colorClass: 'text-danger bg-danger/10' };
    default:
      return { Icon: Bell, colorClass: 'text-text-muted bg-black/[0.04] dark:bg-white/[0.06]' };
  }
}

/** Formats a date string into a human-readable "time ago" string. */
function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

/** Bell icon dropdown showing recent notifications. Polls every 30s. */
export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markRead,
    markAllRead,
    poll,
  } = useNotificationStore();

  // Fetch on mount + start polling
  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(() => {
      poll();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchNotifications, poll]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleNotificationClick = useCallback(
    (id: number, isRead: boolean) => {
      if (!isRead) {
        markRead(id);
      }
    },
    [markRead]
  );

  const handleMarkAllRead = useCallback(() => {
    markAllRead();
  }, [markAllRead]);

  const recentNotifications = notifications.slice(0, 10);
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="
          relative p-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
          flex items-center justify-center
          text-text-muted/50 hover:text-text-secondary dark:hover:text-white
          hover:bg-black/[0.03] dark:hover:bg-white/[0.05]
          rounded-lg transition-all duration-150 cursor-pointer
          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
        "
        aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell size={18} strokeWidth={1.75} />
        {/* Unread badge */}
        {hasUnread && (
          <span className="absolute top-1.5 right-1.5 md:top-0.5 md:right-0.5 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-none shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          aria-label="Notifications"
          className="
            absolute top-full mt-2
            right-0 sm:right-0
            w-[calc(100vw-24px)] sm:w-[380px]
            max-h-[min(480px,70vh)]
            bg-white dark:bg-dark-secondary
            rounded-xl
            border border-black/[0.06] dark:border-white/[0.06]
            shadow-xl shadow-black/[0.08]
            animate-fade-in
            z-50
            flex flex-col
            overflow-hidden
          "
          style={{
            /* On very small screens, center the dropdown */
            ...(typeof window !== 'undefined' && window.innerWidth < 640
              ? { left: '50%', right: 'auto', transform: 'translateX(-50%)' }
              : {}),
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04] shrink-0">
            <h3 className="text-[13px] font-semibold text-text dark:text-white">
              Notifications
            </h3>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="
                  flex items-center gap-1.5 text-[11px] font-medium text-primary
                  hover:text-primary-hover transition-colors duration-150 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  rounded px-1.5 py-1 -mr-1.5
                "
              >
                <Check size={12} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {isLoading && recentNotifications.length === 0 ? (
              /* Loading skeleton */
              <div className="p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-3">
                    <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="w-32 h-3.5 bg-black/[0.04] dark:bg-white/[0.06] rounded animate-pulse mb-1.5" />
                      <div className="w-48 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded animate-pulse mb-1" />
                      <div className="w-16 h-2.5 bg-black/[0.04] dark:bg-white/[0.06] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentNotifications.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/[0.06] flex items-center justify-center mb-3">
                  <Inbox size={22} className="text-primary/60" />
                </div>
                <p className="text-[13px] font-medium text-text dark:text-white mb-1">
                  All caught up!
                </p>
                <p className="text-[11.5px] text-text-muted leading-relaxed max-w-[260px]">
                  You&apos;ll see updates about renders, publishes, and team activity here.
                </p>
              </div>
            ) : (
              /* Notification items */
              <div className="py-1">
                {recentNotifications.map((notification) => {
                  const { Icon, colorClass } = getNotificationIcon(notification.type);
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleNotificationClick(notification.id, notification.is_read)}
                      className={`
                        w-full flex items-start gap-3 px-4 py-3 text-left
                        transition-colors duration-150 cursor-pointer
                        hover:bg-black/[0.02] dark:hover:bg-white/[0.03]
                        focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 focus-visible:outline-none
                        ${!notification.is_read ? 'bg-primary/[0.02] dark:bg-primary/[0.04]' : ''}
                      `}
                    >
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon size={15} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className={`text-[12.5px] leading-snug truncate ${
                            notification.is_read
                              ? 'font-normal text-text-secondary dark:text-[#AAA]'
                              : 'font-medium text-text dark:text-white'
                          }`}>
                            {notification.title}
                          </p>
                          {/* Unread indicator */}
                          {!notification.is_read && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-[11.5px] text-text-muted leading-snug truncate mt-0.5">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-[10.5px] text-text-muted/60 mt-1">
                          {timeAgo(notification.created_at)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer — View all link */}
          {recentNotifications.length > 0 && (
            <div className="border-t border-black/[0.04] dark:border-white/[0.04] shrink-0">
              <a
                href="/notifications"
                className="
                  flex items-center justify-center py-2.5
                  text-[12px] font-medium text-primary
                  hover:bg-primary/[0.03] dark:hover:bg-primary/[0.06]
                  transition-colors duration-150
                  focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 focus-visible:outline-none
                "
              >
                View all notifications
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
