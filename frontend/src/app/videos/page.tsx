'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Play,
  Clock,
  MoreHorizontal,
  Video,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useVideoStore } from '@/stores/video-store';
import { VideoGridSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui';
import type { Video as VideoType, VideoStatus } from '@/types';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | VideoStatus;

const STATUS_CONFIG: Record<VideoStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'text-muted bg-surface', icon: <Clock size={12} /> },
  rendering: { label: 'Rendering', color: 'text-warning bg-warning/10', icon: <Loader2 size={12} className="animate-spin" /> },
  completed: { label: 'Completed', color: 'text-secondary bg-secondary/10', icon: <CheckCircle2 size={12} /> },
  published: { label: 'Published', color: 'text-primary bg-primary/10', icon: <Share2 size={12} /> },
  failed: { label: 'Failed', color: 'text-danger bg-danger/10', icon: <AlertCircle size={12} /> },
};

/** My Videos page — grid/list of user's videos with filters. */
export default function VideosPage() {
  const { videos, fetchVideos } = useVideoStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  useEffect(() => {
    fetchVideos()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchVideos]);

  const safeVideos = videos ?? [];
  const filtered = safeVideos.filter((v) => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <VideoGridSkeleton />
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-6 max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">My Videos</h1>
          <p className="text-sm text-muted mt-0.5">{safeVideos.length} video{safeVideos.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/video/create/"
          className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] rounded-lg text-sm font-medium hover:opacity-90 transition-all active:scale-[0.98]"
        >
          <Plus size={16} />
          Create Video
        </Link>
      </div>

      {/* Toolbar: search + filter + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos..."
            className="w-full pl-9 pr-3 py-2 min-h-[44px] md:min-h-0 bg-surface dark:bg-[#1e1e1e] border border-border-light dark:border-[#333] rounded-lg text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Status filter chips — horizontally scrollable on mobile */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            {(['all', 'draft', 'completed', 'rendering', 'published', 'failed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-full transition-all capitalize ${
                  statusFilter === s
                    ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]'
                    : 'bg-surface dark:bg-[#1e1e1e] text-muted hover:text-text dark:hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="shrink-0 flex items-center gap-0.5 bg-surface dark:bg-[#1e1e1e] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`p-2.5 md:p-1.5 rounded-md transition-all ${
                view === 'grid' ? 'bg-white dark:bg-[#2a2a2a] text-text dark:text-white shadow-sm' : 'text-muted'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`p-2.5 md:p-1.5 rounded-md transition-all ${
                view === 'list' ? 'bg-white dark:bg-[#2a2a2a] text-text dark:text-white shadow-sm' : 'text-muted'
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {safeVideos.length === 0 && (
        <EmptyState
          icon={<Video size={28} className="text-primary" />}
          headline="No videos yet"
          description="Create your first AI-powered video in minutes. Write a script, choose a voice, and let Contentine Create render it in your browser."
          ctaLabel="Create Your First Video"
          ctaHref="/video/create/"
        />
      )}

      {/* Filtered empty */}
      {safeVideos.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 md:py-12">
          <Search size={32} className="mx-auto text-muted mb-3" />
          <p className="text-sm text-muted">No videos match your search</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Grid view */}
      {view === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((video) => (
            <VideoGridCard key={video.id} video={video} />
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && filtered.length > 0 && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
          {filtered.map((video, i) => (
            <VideoListRow key={video.id} video={video} isLast={i === filtered.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Video card for grid view. */
function VideoGridCard({ video }: { video: VideoType }) {
  const status = STATUS_CONFIG[video.status];
  const duration = video.duration_seconds;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className="group bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden hover:border-border dark:hover:border-[#555] transition-all">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface dark:bg-[#151515]">
        {video.thumbnail_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_path}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Video size={28} className="text-muted" />
          </div>
        )}

        {/* Duration badge */}
        {duration > 0 && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
            {mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`}
          </span>
        )}

        {/* Play overlay */}
        {video.status === 'completed' && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <Play size={18} className="text-text ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-text dark:text-white truncate">{video.title}</h3>
        <div className="flex items-center justify-between mt-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.color}`}>
            {status.icon}
            {status.label}
          </span>
          <span className="text-[11px] text-muted">
            {new Date(video.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Video row for list view. */
function VideoListRow({ video, isLast }: { video: VideoType; isLast: boolean }) {
  const status = STATUS_CONFIG[video.status];
  const duration = video.duration_seconds;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className={`flex items-center gap-4 px-4 py-3 hover:bg-surface dark:hover:bg-[#151515] transition-colors ${!isLast ? 'border-b border-border-light dark:border-[#333]' : ''}`}>
      {/* Thumbnail mini */}
      <div className="flex-none w-20 aspect-video rounded-lg overflow-hidden bg-surface dark:bg-[#151515]">
        {video.thumbnail_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_path} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video size={16} className="text-muted" />
          </div>
        )}
      </div>

      {/* Title + date */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-text dark:text-white truncate">{video.title}</h3>
        <p className="text-[11px] text-muted mt-0.5">
          {new Date(video.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          {duration > 0 && (
            <> &middot; {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</>
          )}
          {' '}&middot; {video.aspect_ratio}
        </p>
      </div>

      {/* Status */}
      <span className={`flex-none inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.color}`}>
        {status.icon}
        {status.label}
      </span>

      {/* Actions */}
      <div className="flex-none flex items-center gap-1">
        {video.mp4_path && (
          <a
            href={video.mp4_path}
            download
            className="p-2.5 md:p-1.5 rounded-lg text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a] transition-colors"
            title="Download"
          >
            <Download size={14} />
          </a>
        )}
        <button
          type="button"
          className="p-2.5 md:p-1.5 rounded-lg text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a] transition-colors"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}
