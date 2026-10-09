'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Video,
  Globe,
  Users,
  AlertTriangle,
  Check,
  Inbox,
  BellOff,
} from 'lucide-react';
import { useNotificationStore } from '@/stores/notification-store';
import type { Notification, NotificationType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import NotificationSkeleton from '@/components/notifications/NotificationSkeleton';

type FilterTab = 'all' | 'unread';

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

/** Full notifications page with filter tabs, mark-all-read, and notification cards. */
export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markRead,
    markAllRead,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

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

  const safeNotifications = notifications ?? [];
  const filteredNotifications: Notification[] =
    activeTab === 'unread'
      ? safeNotifications.filter((n) => !n.is_read)
      : safeNotifications;

  const hasUnread = unreadCount > 0;

  // Loading state
  if (isLoading && safeNotifications.length === 0) {
    return <NotificationSkeleton />;
  }

  return (
    <div className="max-w-[720px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/[0.06] flex items-center justify-center">
            <Bell size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] md:text-[17px] font-bold text-text dark:text-white">
              Notifications
            </h1>
          </div>
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="
              flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] md:min-h-0 md:py-2
              rounded-xl text-[13px] md:text-[12px] font-medium
              text-primary bg-primary/[0.06] hover:bg-primary/[0.1]
              transition-colors duration-150 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
          >
            <Check size={14} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5">
        {(['all', 'unread'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2 min-h-[44px] md:min-h-0 md:py-1.5
              rounded-full text-[13px] md:text-[12px] font-medium
              transition-all duration-200 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              ${activeTab === tab
                ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                : 'bg-black/[0.04] dark:bg-white/[0.06] text-text-muted hover:text-text-secondary dark:hover:text-white/80 hover:bg-black/[0.07] dark:hover:bg-white/[0.1]'
              }
            `}
          >
            {tab === 'all' ? 'All' : 'Unread'}
            {tab === 'unread' && hasUnread && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {filteredNotifications.length === 0 ? (
        /* Empty state per filter */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mb-4">
            {activeTab === 'unread' ? (
              <BellOff size={24} className="text-primary/50" />
            ) : (
              <Inbox size={24} className="text-primary/50" />
            )}
          </div>
          <h3 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
            {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p className="text-[12.5px] text-text-muted max-w-[320px] leading-relaxed">
            {activeTab === 'unread'
              ? "You're all caught up! All your notifications have been read."
              : "You'll see updates about renders, publishes, and team activity here as you use Contentine Create."
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => {
            const { Icon, colorClass } = getNotificationIcon(notification.type);
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification.id, notification.is_read)}
                className={`
                  bento-card w-full text-left p-4 flex items-start gap-3.5
                  transition-all duration-200 cursor-pointer
                  hover:!border-black/[0.08] dark:hover:!border-white/[0.1]
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  ${!notification.is_read
                    ? 'ring-1 ring-primary/10 bg-primary/[0.01] dark:bg-primary/[0.03]'
                    : ''
                  }
                `}
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                  <Icon size={16} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className={`text-[13px] md:text-[12.5px] leading-snug truncate ${
                        notification.is_read
                          ? 'font-normal text-text-secondary dark:text-[#AAA]'
                          : 'font-semibold text-text dark:text-white'
                      }`}>
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-[10.5px] text-text-muted/60 whitespace-nowrap shrink-0 mt-0.5">
                      {timeAgo(notification.created_at)}
                    </span>
                  </div>
                  {notification.body && (
                    <p className="text-[12px] md:text-[11.5px] text-text-muted leading-relaxed line-clamp-2">
                      {notification.body}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
