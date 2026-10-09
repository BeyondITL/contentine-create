'use client';

import { useState } from 'react';
import {
  FileText, MessageCircle, Mail, AlignLeft, Megaphone, ListChecks,
  Trash2, FileQuestion,
} from 'lucide-react';
import { Skeleton } from '@/components/ui';
import type { AIWriterDoc, WriterDocType } from '@/types';

interface DocumentHistoryProps {
  documents: AIWriterDoc[];
  isLoading: boolean;
  activeDocId: number | null;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
}

const TYPE_CONFIG: Record<WriterDocType, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  blog: { label: 'Blog', icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  caption: { label: 'Caption', icon: MessageCircle, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-500/10' },
  email: { label: 'Email', icon: Mail, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  description: { label: 'Desc.', icon: AlignLeft, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  ad: { label: 'Ad', icon: Megaphone, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10' },
  summary: { label: 'Summary', icon: ListChecks, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
};

/** Sidebar list of saved writer documents with load and delete actions. */
export default function DocumentHistory({
  documents,
  isLoading,
  activeDocId,
  onLoad,
  onDelete,
}: DocumentHistoryProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function handleDelete(id: number) {
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      // Auto-clear confirmation after 3s
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  }

  function formatDate(dateStr: string) {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
          Saved Documents
        </p>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-surface dark:bg-dark-secondary">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="w-14 h-5 rounded-md" />
              <Skeleton className="w-10 h-3 rounded-md ml-auto" />
            </div>
            <Skeleton className="w-full h-3 rounded-md mb-1" />
            <Skeleton className="w-3/4 h-3 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-10 h-10 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
          <FileQuestion size={18} className="text-text-muted" />
        </div>
        <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
          No documents yet
        </p>
        <p className="text-[11px] text-text-muted leading-relaxed max-w-[200px] mx-auto">
          Generated content will appear here for quick access
        </p>
      </div>
    );
  }

  // Document list
  return (
    <div>
      <p className="text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
        Saved Documents
      </p>
      <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {documents.map((doc) => {
          const cfg = TYPE_CONFIG[doc.type] || TYPE_CONFIG.blog;
          const Icon = cfg.icon;
          const isActive = activeDocId === doc.id;

          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onLoad(doc.id)}
              className={`
                w-full text-left p-3 rounded-xl transition-all duration-200
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                group cursor-pointer min-h-[44px]
                ${isActive
                  ? 'bg-primary/[0.06] dark:bg-primary/[0.08] ring-1 ring-primary/10'
                  : 'hover:bg-surface dark:hover:bg-white/[0.03]'
                }
              `}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                  <Icon size={10} />
                  {cfg.label}
                </span>
                <span className="text-[10px] text-text-muted ml-auto">
                  {formatDate(doc.created_at)}
                </span>
              </div>

              <p className="text-[12px] font-medium text-text dark:text-[#E0E0E0] line-clamp-2 leading-snug mb-1">
                {doc.title || 'Untitled Document'}
              </p>

              {doc.content_preview && (
                <p className="text-[11px] text-text-muted line-clamp-1">
                  {doc.content_preview}
                </p>
              )}

              {/* Delete button */}
              <div className="flex justify-end mt-1.5">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }
                  }}
                  className={`
                    inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                    transition-all min-w-[44px] min-h-[28px] md:min-w-0 md:min-h-0 justify-center
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer
                    ${confirmDeleteId === doc.id
                      ? 'bg-danger/10 text-danger'
                      : 'opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger hover:bg-danger/[0.06]'
                    }
                  `}
                >
                  <Trash2 size={11} />
                  {confirmDeleteId === doc.id ? 'Confirm' : 'Delete'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
