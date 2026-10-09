'use client';

import { useEffect, useState } from 'react';
import { Clock, FileText, Trash2, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';
import { useRemixStore } from '@/stores/remix-store';
import { Skeleton } from '@/components/ui';
import type { RemixProject, RemixTarget } from '@/types';

/** Platform badge with appropriate color. */
function PlatformBadge({ platform }: { platform: RemixTarget }) {
  const colors: Record<string, string> = {
    twitter: 'bg-sky-500/10 text-sky-600',
    linkedin: 'bg-blue-600/10 text-blue-600',
    instagram: 'bg-pink-500/10 text-pink-500',
    facebook: 'bg-blue-500/10 text-blue-500',
    tiktok: 'bg-pink-600/10 text-pink-600',
    threads: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
    blog: 'bg-emerald-500/10 text-emerald-600',
    newsletter: 'bg-orange-500/10 text-orange-500',
    video_script: 'bg-accent/10 text-accent',
  };

  const labels: Record<string, string> = {
    twitter: 'X', linkedin: 'LI', instagram: 'IG', facebook: 'FB',
    tiktok: 'TT', threads: 'TH', blog: 'Blog', newsletter: 'NL',
    video_script: 'Video',
  };

  return (
    <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${colors[platform] || 'bg-surface text-muted'}`}>
      {labels[platform] || platform}
    </span>
  );
}

/** List of saved remix projects. */
export default function RemixProjectList() {
  const { projects, isLoading, fetchProjects, loadProject, deleteProject } = useRemixStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return null; // Don't show empty state — handled by parent
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
        Recent Remixes ({projects.length})
      </h3>

      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onOpen={() => {
            loadProject(project.id);
            // Update URL for deep-linking / back button support
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', `/remix?projectId=${project.id}`);
            }
          }}
          onDelete={() => deleteProject(project.id)}
        />
      ))}
    </div>
  );
}

/** Individual project card. */
function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: RemixProject;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const platforms = project.target_platforms || [];
  const date = new Date(project.created_at);
  const timeAgo = getTimeAgo(date);

  return (
    <div
      className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-3 sm:p-4 hover:border-border dark:hover:border-[#555] transition-all cursor-pointer group active:scale-[0.99]"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-text dark:text-white truncate">
              {project.name || 'Untitled Remix'}
            </h4>
            <StatusBadge status={project.status} />
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {timeAgo}
            </span>
            {platforms.length > 0 && (
              <span className="flex items-center gap-1">
                <FileText size={10} />
                {platforms.length} platform{platforms.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {platforms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {platforms.map((p) => (
                <PlatformBadge key={p} platform={p} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted hover:text-primary hover:bg-primary/5 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            aria-label="Open project"
          >
            <ExternalLink size={14} />
          </button>
          {confirmDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setConfirmDelete(false);
              }}
              onBlur={() => setConfirmDelete(false)}
              className="px-3 py-2 min-h-[44px] rounded-md text-xs font-medium bg-danger text-white hover:bg-danger/90 transition-colors focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
              aria-label="Confirm delete"
            >
              Confirm?
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
              aria-label="Delete project"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'generated':
      return (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">
          <Sparkles size={8} />
          Generated
        </span>
      );
    case 'published':
      return (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-secondary bg-secondary/10 px-1.5 py-0.5 rounded">
          <CheckCircle2 size={8} />
          Published
        </span>
      );
    default:
      return (
        <span className="text-[10px] font-medium text-muted bg-surface dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded">
          Draft
        </span>
      );
  }
}

/** Simple relative time. */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
