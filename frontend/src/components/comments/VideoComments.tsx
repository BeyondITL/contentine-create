'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Send, Clock } from 'lucide-react';
import { api } from '@/lib/api';

/** A single comment row as returned by GET /api/videos/{id}/comments. */
interface VideoComment {
  id: number;
  video_id: number;
  user_id: number;
  body: string;
  timestamp_seconds: number | null;
  author_name: string | null;
  created_at: string;
}

interface VideoCommentsProps {
  videoId: number;
}

/** Format an optional video timecode (seconds) as m:ss. */
function timecode(seconds: number | null): string | null {
  if (seconds == null || seconds < 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Threaded comments panel for a video (SA-13 / F-40). Backed by the real
 * VideoController endpoints: GET/POST /api/videos/{id}/comments. Flat, time-ordered
 * thread — the backend anchors each comment to an optional video timecode.
 */
export default function VideoComments({ videoId }: VideoCommentsProps) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<{ comments: VideoComment[] }>(`/videos/${videoId}/comments`);
      setComments(Array.isArray(data?.comments) ? data.comments : []);
    } catch {
      setError('Could not load comments. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/videos/${videoId}/comments`, { body: text });
      setDraft('');
      // Refetch so the new row carries its author_name (the POST response does not join users).
      await fetchComments();
    } catch {
      setError('Could not post your comment. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bento-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-primary" aria-hidden />
        <h4 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
          Comments{comments.length > 0 ? ` (${comments.length})` : ''}
        </h4>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-4 w-1/3 rounded bg-black/5 dark:bg-white/5 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-black/5 dark:bg-white/5 animate-pulse" />
        </div>
      ) : error && comments.length === 0 ? (
        <p className="text-[13px] text-danger py-2">{error}</p>
      ) : comments.length === 0 ? (
        <p className="text-[13px] text-text-muted py-2">No comments yet. Start the thread below.</p>
      ) : (
        <ul className="space-y-3 mb-3 max-h-72 overflow-y-auto pr-1">
          {comments.map((c) => {
            const tc = timecode(c.timestamp_seconds);
            return (
              <li key={c.id} className="text-[13px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-text dark:text-[#E0E0E0]">{c.author_name || 'User'}</span>
                  {tc && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary tabular-nums">
                      <Clock className="w-3 h-3" aria-hidden />
                      {tc}
                    </span>
                  )}
                  <span className="text-[11px] text-text-muted">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-text/90 dark:text-white/80 whitespace-pre-wrap break-words">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment..."
          aria-label="Add a comment"
          rows={2}
          maxLength={2000}
          className="flex-1 resize-none rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 text-[13px] text-text dark:text-[#E0E0E0] focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
        />
        <button
          type="submit"
          disabled={!draft.trim() || submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-black disabled:opacity-40 hover:brightness-110 active:scale-[0.98] transition"
        >
          <Send className="w-3.5 h-3.5" aria-hidden />
          {submitting ? 'Posting...' : 'Post'}
        </button>
      </form>
      {error && comments.length > 0 && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
