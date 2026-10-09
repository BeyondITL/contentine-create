'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  Send,
  Video,
} from 'lucide-react';
import type { ScheduledPostWithVideo, PostStatus, Platform } from '@/types';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS } from './PlatformFilter';

interface ScheduleCardProps {
  post: ScheduledPostWithVideo;
  /** Called when the user wants to edit the post. */
  onEdit?: (post: ScheduledPostWithVideo) => void;
  /** Called after confirming deletion (two-click pattern). */
  onDelete?: (id: number) => void;
  /** Called when "Publish Now" is clicked. */
  onPublishNow?: (post: ScheduledPostWithVideo) => void;
  /** Called when the card is clicked (select/detail view). */
  onClick?: (post: ScheduledPostWithVideo) => void;
}

const STATUS_CONFIG: Record<
  PostStatus,
  { label: string; variant: 'warning' | 'info' | 'success' | 'danger'; icon: React.ReactNode; animated?: boolean }
> = {
  pending: {
    label: 'Scheduled',
    variant: 'warning',
    icon: <Clock size={10} />,
  },
  publishing: {
    label: 'Publishing',
    variant: 'info',
    icon: <Loader2 size={10} className="animate-spin" />,
    animated: true,
  },
  published: {
    label: 'Published',
    variant: 'success',
    icon: <CheckCircle2 size={10} />,
  },
  failed: {
    label: 'Failed',
    variant: 'danger',
    icon: <AlertCircle size={10} />,
  },
};

/** Format a datetime string to a short time like "2:30 PM". */
function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

/** Card for a single scheduled post with thumbnail, status, and actions. */
export default function ScheduleCard({
  post,
  onEdit,
  onDelete,
  onPublishNow,
  onClick,
}: ScheduleCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status = STATUS_CONFIG[post.status];
  const platform = post.platform as Platform;
  const time = formatTime(post.scheduled_at);

  // Clean up delete confirmation timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete?.(post.id);
      setConfirmDelete(false);
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = null;
      }
    } else {
      setConfirmDelete(true);
      // Auto-reset after 3 seconds
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      deleteTimeoutRef.current = setTimeout(() => {
        setConfirmDelete(false);
        deleteTimeoutRef.current = null;
      }, 3000);
    }
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    onEdit?.(post);
  }

  function handlePublish(e: React.MouseEvent) {
    e.stopPropagation();
    onPublishNow?.(post);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(post)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(post);
        }
      }}
      className="
        group flex items-start gap-3 p-3 rounded-xl min-h-[44px]
        bg-white dark:bg-[#1e1e1e] border border-border-light dark:border-[#333]
        hover:border-border dark:hover:border-[#555] hover:shadow-sm
        transition-all duration-150 cursor-pointer
        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
      "
    >
      {/* Thumbnail */}
      <div className="flex-none w-14 h-14 rounded-lg overflow-hidden bg-surface dark:bg-[#151515] shrink-0">
        {post.video_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.video_thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video size={18} className="text-muted" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] truncate leading-tight">
          {post.video_title || post.title || 'Untitled post'}
        </p>

        {/* Platform + time row */}
        <div className="flex items-center gap-2 mt-1.5">
          {/* Platform badge */}
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
            style={{ backgroundColor: PLATFORM_COLORS[platform] }}
          >
            {PLATFORM_ICONS[platform]}
            <span className="hidden sm:inline">{PLATFORM_LABELS[platform]}</span>
          </span>

          {/* Time */}
          {time && (
            <span className="text-[11px] text-muted flex items-center gap-1">
              <Clock size={10} />
              {time}
            </span>
          )}
        </div>

        {/* Status badge */}
        <div className="mt-1.5">
          <Badge
            variant={status.variant}
            label={status.label}
            icon={status.icon}
            animated={status.animated}
          />
        </div>

        {/* Error message */}
        {post.status === 'failed' && post.error_message && (
          <p className="text-[10px] text-danger mt-1 leading-snug line-clamp-2">
            {post.error_message}
          </p>
        )}
      </div>

      {/* Actions — always visible on mobile, hover/focus on desktop */}
      <div className="flex flex-col items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        {/* Edit */}
        {post.status !== 'publishing' && onEdit && (
          <Tooltip content="Edit">
            <button
              type="button"
              onClick={handleEdit}
              className="w-10 h-10 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-lg text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Pencil size={15} className="sm:hidden" />
              <Pencil size={13} className="hidden sm:block" />
            </button>
          </Tooltip>
        )}

        {/* Publish Now — only for pending */}
        {post.status === 'pending' && onPublishNow && (
          <Tooltip content="Publish now">
            <button
              type="button"
              onClick={handlePublish}
              className="w-10 h-10 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-lg text-secondary hover:text-secondary-hover hover:bg-secondary/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Send size={15} className="sm:hidden" />
              <Send size={13} className="hidden sm:block" />
            </button>
          </Tooltip>
        )}

        {/* Delete — two-click pattern */}
        {post.status !== 'publishing' && onDelete && (
          <Tooltip content={confirmDelete ? 'Confirm delete' : 'Delete'}>
            <button
              type="button"
              onClick={handleDelete}
              className={`
                w-10 h-10 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-lg transition-colors
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${
                  confirmDelete
                    ? 'text-white bg-danger hover:bg-danger/90'
                    : 'text-muted hover:text-danger hover:bg-danger/[0.06]'
                }
              `}
            >
              <Trash2 size={15} className="sm:hidden" />
              <Trash2 size={13} className="hidden sm:block" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
