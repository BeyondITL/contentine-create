'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Video,
  Clapperboard,
  Sparkles,
  Lightbulb,
  Film,
  Send,
  Eye,
  ArrowUpRight,
  Play,
  Mic2,
  Wand2,
  Globe,
  ChevronRight,
  ArrowRight,
  Zap,
  Download,
  CheckCircle,
  AlertCircle,
  Mic,
  Image,
  MessageSquare,
  Subtitles,
  UserCircle,
  Rocket,
  Settings,
  Link2,
} from 'lucide-react';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import DeviceCard from '@/components/dashboard/DeviceCard';
import { api } from '@/lib/api';
import { useVideoStore } from '@/stores/video-store';
import { useEditorStore } from '@/stores/editor-store';
import { useModelStore, formatBytes } from '@/stores/model-store';
import type { AIModel } from '@/stores/model-store';
import type { Video as VideoModel, ScheduledPostWithVideo } from '@/types';

type DashboardState = 'loading' | 'empty' | 'populated';

interface DashboardData {
  videos: number;
  scheduled: number;
  views: number;
}

/** Icon map for AI model categories. */
const MODEL_ICON_MAP: Record<AIModel['category'], typeof Mic> = {
  tts: Mic,
  llm: MessageSquare,
  image: Image,
  lipsync: UserCircle,
  stt: Subtitles,
  voiceclone: Mic2,
};

/** Friendly category label for display. */
const MODEL_CATEGORY_LABEL: Record<AIModel['category'], string> = {
  tts: 'Text-to-Speech',
  llm: 'Language Model',
  image: 'Image Generation',
  lipsync: 'Lip Sync',
  stt: 'Speech-to-Text',
  voiceclone: 'Voice Cloning',
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>('loading');
  const [data, setData] = useState<DashboardData>({ videos: 0, scheduled: 0, views: 0 });
  const [recentVideos, setRecentVideos] = useState<VideoModel[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduledPostWithVideo[]>([]);

  /* ── Zustand stores for local data ── */
  const localVideos = useVideoStore((s) => s.videos);
  const editorScenes = useEditorStore((s) => s.scenes);
  const editorTitle = useEditorStore((s) => s.title);
  const models = useModelStore((s) => s.models);

  /* ── Derived model status ── */
  const modelStatus = useMemo(() => {
    const safeModels = models ?? [];
    const downloaded = safeModels.filter((m) => m.status === 'ready').length;
    const total = safeModels.length;
    const kokoroReady = safeModels.find((m) => m.id === 'kokoro-82m');
    const isKokoroReady = kokoroReady?.status === 'ready';
    return { downloaded, total, isKokoroReady };
  }, [models]);

  /* ── Key models for the status card (one per category, most important) ── */
  const keyModels = useMemo(() => {
    const ids = ['kokoro-82m', 'sd-turbo', 'llama-3.2-1b', 'whisper-tiny'];
    return ids.map((id) => (models ?? []).find((m) => m.id === id)).filter(Boolean) as AIModel[];
  }, [models]);

  /* ── Determine effective data: API data merged with local store fallbacks ── */
  const effectiveData = useMemo(() => {
    return {
      videos: data.videos || (localVideos ?? []).length,
      scheduled: data.scheduled,
      views: data.views,
    };
  }, [data, localVideos]);

  /* ── Has an active project? ── */
  const hasActiveProject = editorTitle.length > 0 && (editorScenes ?? []).some((s) => s.narration.length > 0);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const [videosRes, scheduleRes, analyticsRes] = await Promise.all([
          api.get<{ videos: VideoModel[]; total: number }>('/videos').catch(() => ({ videos: [], total: 0 })),
          api.get<{ posts: ScheduledPostWithVideo[]; total: number }>('/schedule').catch(() => ({ posts: [], total: 0 })),
          api.get<{ summary: { total_views: number } }>('/analytics').catch(() => ({ summary: { total_views: 0 } })),
        ]);
        if (cancelled) return;
        const dashboard = {
          videos: videosRes.total || videosRes.videos?.length || 0,
          scheduled: scheduleRes.total || scheduleRes.posts?.length || 0,
          views: analyticsRes.summary?.total_views || 0,
        };
        setData(dashboard);

        // D-55: keep the actual lists, not just counts — 6 most recent videos and
        // the next 5 scheduled posts (soonest first). Real data or an empty state.
        const vids = (videosRes.videos ?? []).length ? videosRes.videos : (localVideos ?? []);
        setRecentVideos(
          [...vids]
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
            .slice(0, 6)
        );
        const now = Date.now();
        setUpcoming(
          (scheduleRes.posts ?? [])
            .filter((p) => p.status !== 'published' && new Date(p.scheduled_at).getTime() >= now)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            .slice(0, 5)
        );
        /* Use local store data as fallback when API returns zeros */
        const totalVideos = dashboard.videos || localVideos.length;
        setState(totalVideos === 0 && dashboard.scheduled === 0 && dashboard.views === 0 ? 'empty' : 'populated');
      } catch {
        if (!cancelled) {
          /* Even on API failure, check if we have local data */
          setState(localVideos.length > 0 ? 'populated' : 'empty');
          setRecentVideos(
            [...(localVideos ?? [])]
              .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
              .slice(0, 6)
          );
        }
      }
    }
    loadDashboard();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'loading') return <DashboardSkeleton />;

  const isNewUser = state === 'empty' && !hasActiveProject;

  return (
    <div className="max-w-[1100px]">
      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-[18px] md:text-[22px] font-bold text-text tracking-[-0.02em]">Dashboard</h1>
        <p className="text-[13px] text-text-muted mt-0.5">Create, remix, and publish content from your browser.</p>
      </div>

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 auto-rows-min">

        {/* ━━━ Hero — Create Video (spans 7 cols) ━━━ */}
        <a href="/video/create" className="col-span-1 md:col-span-7 group relative overflow-hidden rounded-2xl bg-[#0A0A0A] p-5 md:p-7 min-h-[180px] md:min-h-[200px] flex flex-col justify-between cursor-pointer noise-overlay">
          <div className="absolute top-[-60px] right-[-40px] w-[280px] h-[280px] rounded-full bg-primary/25 blur-[80px] animate-[meshDrift_12s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-40px] left-[20%] w-[200px] h-[200px] rounded-full bg-accent/15 blur-[70px] animate-[meshDrift_15s_ease-in-out_infinite_reverse]" />
          <div className="absolute top-[40%] right-[30%] w-[120px] h-[120px] rounded-full bg-secondary/10 blur-[50px]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.08] border border-white/[0.06] mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span className="text-[10px] font-medium text-white/60 tracking-wide">
                {modelStatus.isKokoroReady ? 'Ready to create' : 'Set up AI models first'}
              </span>
            </div>
            <h2 className="text-[20px] md:text-[24px] font-bold text-white leading-[1.15] tracking-[-0.02em] mb-1.5">
              Create your next video
            </h2>
            <p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
              AI writes the script, generates visuals, and renders — entirely in your browser.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-2.5 mt-5">
            <span className="inline-flex items-center gap-2 px-4 py-2.5 md:py-2 min-h-[44px] md:min-h-0 rounded-xl bg-white text-[#0A0A0A] text-[12.5px] font-semibold group-hover:shadow-lg group-hover:shadow-white/10 transition-all duration-300">
              <Play className="w-3 h-3" fill="currentColor" />
              Start creating
            </span>
            <span className="text-[11px] text-white/30 font-medium">No limits, no credits</span>
          </div>
        </a>

        {/* ━━━ Remix Hub (spans 5 cols) ━━━ */}
        <a href="/remix" className="col-span-1 md:col-span-5 group bento-card-glow relative overflow-hidden p-5 md:p-6 flex flex-col justify-between ai-shimmer cursor-pointer">
          <div>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C084FC] to-accent/80 flex items-center justify-center mb-5 shadow-lg shadow-accent/15">
              <Sparkles className="w-[15px] h-[15px] text-white" strokeWidth={2} />
            </div>
            <p className="text-[15px] font-semibold text-text tracking-[-0.01em] mb-1 flex items-center gap-1.5">
              Remix Hub
              <ArrowUpRight className="w-3.5 h-3.5 text-text-muted/30 group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
            </p>
            <p className="text-[12px] text-text-muted leading-relaxed">
              Paste any URL, video, or text. Get optimized content for 9 platforms instantly.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-5">
            {['YouTube', 'TikTok', 'X', 'LinkedIn', 'Instagram'].map((p) => (
              <span key={p} className="text-[9.5px] font-medium text-text-muted/60 bg-black/[0.03] dark:bg-white/[0.06] px-2 py-0.5 rounded-md">
                {p}
              </span>
            ))}
            <span className="text-[9.5px] font-medium text-accent/60 bg-accent/[0.05] px-2 py-0.5 rounded-md">
              +4 more
            </span>
          </div>
        </a>

        {/* ━━━ Stat tiles — 4 across (D-55) ━━━ */}
        <StatTile icon={<Film className="w-[17px] h-[17px] text-primary" strokeWidth={1.75} />} value={effectiveData.videos} label="Videos created" color="primary" />
        <StatTile icon={<Send className="w-[17px] h-[17px] text-secondary" strokeWidth={1.75} />} value={effectiveData.scheduled} label="Scheduled" color="secondary" />
        <StatTile icon={<Eye className="w-[17px] h-[17px] text-info" strokeWidth={1.75} />} value={effectiveData.views} label="Total views" color="info" />
        <StatTile icon={<Sparkles className="w-[17px] h-[17px] text-accent" strokeWidth={1.75} />} value={modelStatus.downloaded} label="Models ready" color="accent" />

        {/* ━━━ Quick Actions — 3 across ━━━ */}
        {!modelStatus.isKokoroReady ? (
          /* Show "Set Up AI" card when Kokoro TTS not downloaded */
          <ActionCard
            href="/models"
            Icon={Download}
            gradient="from-[#E74C3C] to-[#C0392B]"
            shadowColor="danger"
            title="Set Up AI Models"
            desc="Download Kokoro TTS to start"
            badge="Required"
          />
        ) : (
          <ActionCard href="/video/create" Icon={Video} gradient="from-primary to-primary-hover" shadowColor="primary" title="Create Video" desc="AI script + voice + render" />
        )}
        <ActionCard href="/cartoon" Icon={Clapperboard} gradient="from-accent to-[#B569C9]" shadowColor="accent" title="Cartoon Video" desc="Script + voice + on-device render" />
        <ActionCard href="/discover" Icon={Lightbulb} gradient="from-warning to-[#E67E22]" shadowColor="warning" title="Discover Ideas" desc="Search ideas across 8 platforms" />
        {/* 4 quick actions kept as a deliberate D-55 divergence (operator-ratified) — each is a real feature link */}
        <ActionCard href="/writer" Icon={Wand2} gradient="from-info to-[#2980B9]" shadowColor="info" title="AI Writer" desc="Scripts, posts, and hooks" />

        {/* ━━━ Recent videos (D-55) — 6 most recent, spans 8 cols ━━━ */}
        <RecentVideosCard videos={recentVideos} />

        {/* ━━━ Upcoming scheduled (D-55) — next 5, spans 4 cols ━━━ */}
        <UpcomingScheduledCard posts={upcoming} />

        {/* ━━━ Getting Started — for new users (spans 8 cols) ━━━ */}
        {isNewUser ? (
          <GettingStartedCard isKokoroReady={modelStatus.isKokoroReady} />
        ) : (
          <div className="col-span-1 md:col-span-8 bento-card p-0 overflow-hidden cursor-default">
            <div className="px-4 md:px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-text dark:text-white">Get started</p>
                <p className="text-[11px] text-text-muted dark:text-white/50 mt-0.5">3 steps to your first published video</p>
              </div>
              <span className="text-[10px] font-semibold text-text-muted/40 bg-black/[0.03] dark:bg-white/[0.06] px-2.5 py-1 rounded-md">
                {(effectiveData.videos > 0 ? 1 : 0) + (effectiveData.scheduled > 0 ? 1 : 0)} / 3
              </span>
            </div>
            <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
              <StepRow num={1} title="Create your first video" desc="Write a script with AI, pick a voice, render in your browser" href="/video/create" done={effectiveData.videos > 0} />
              <StepRow num={2} title="Remix existing content" desc="Paste any URL or text, get posts for 9 platforms instantly" href="/remix" />
              <StepRow num={3} title="Connect a social platform" desc="Link YouTube, TikTok, or Instagram to publish directly" href="/settings" last />
            </div>
          </div>
        )}

        {/* ━━━ Device Card — right col, 4 cols ━━━ */}
        <div className="col-span-1 md:col-span-4">
          <DeviceCard />
        </div>

        {/* ━━━ AI Model Status — spans 8 cols ━━━ */}
        <AIModelStatusCard keyModels={keyModels} modelStatus={modelStatus} />

        {/* ━━━ Creative Tools — 4 cols ━━━ */}
        <div className="col-span-1 md:col-span-4 bento-card p-0 overflow-hidden cursor-default">
          <div className="px-4 md:px-5 py-4">
            <p className="text-[13px] font-semibold text-text dark:text-white flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-warning" strokeWidth={2} />
              Creative Tools
            </p>
          </div>
          <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
            <ToolLink href="/writer" Icon={Wand2} label="AI Writer" tag="6 formats" />
            <ToolLink href="/voices" Icon={Mic2} label="Voice Studio" tag="54+ voices" />
            <ToolLink href="/discover" Icon={Globe} label="Idea Search" tag="8 platforms" />
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── Stat tile ── */
function StatTile({ icon, value, label, color }: {
  icon: React.ReactNode; value: number; label: string; color: string;
}) {
  return (
    <div className="col-span-1 md:col-span-3 bento-card p-4 md:p-5 min-h-[44px] cursor-default">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-${color}/[0.07] dark:bg-${color}/[0.12] flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-[20px] font-bold text-text dark:text-white leading-none tracking-tight">{(value ?? 0).toLocaleString()}</p>
          <p className="text-[11px] text-text-muted dark:text-white/50 mt-1">{label}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Recent videos list (D-55: 6 most recent) ── */
function RecentVideosCard({ videos }: { videos: VideoModel[] }) {
  const STATUS_STYLE: Record<string, string> = {
    completed: 'text-secondary bg-secondary/[0.08] dark:bg-secondary/[0.15]',
    rendering: 'text-primary bg-primary/[0.08] dark:bg-primary/[0.15]',
    draft: 'text-text-muted bg-black/[0.04] dark:bg-white/[0.08]',
    failed: 'text-danger bg-danger/[0.08] dark:bg-danger/[0.15]',
  };
  return (
    <div className="col-span-1 md:col-span-8 bento-card p-0 overflow-hidden cursor-default">
      <div className="px-4 md:px-5 py-4 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-text dark:text-white flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
          Recent videos
        </p>
        <a href="/videos" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors duration-150 group/link">
          View all
          <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" strokeWidth={2} />
        </a>
      </div>
      <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
        {videos.length === 0 ? (
          <div className="px-4 md:px-5 py-8 text-center">
            <p className="text-[12px] text-text-muted dark:text-white/50">No videos yet.</p>
            <a href="/video/create" className="inline-flex items-center gap-1 mt-1 text-[12px] font-semibold text-primary hover:text-primary-hover">
              Create your first video
              <ArrowRight className="w-3 h-3" strokeWidth={2} />
            </a>
          </div>
        ) : (
          videos.map((v, i) => (
            <a
              key={v.id}
              href="/videos"
              className={`group flex items-center gap-3 px-4 md:px-5 py-3 min-h-[44px] hover:bg-black/[0.015] dark:hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer ${i === videos.length - 1 ? '' : 'border-b border-black/[0.04] dark:border-white/[0.06]'}`}
            >
              <div className="w-9 h-9 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] overflow-hidden shrink-0 flex items-center justify-center">
                {v.thumbnail_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnail_path} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-text-muted/50" strokeWidth={2} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-text dark:text-white truncate">{v.title || 'Untitled video'}</p>
                <p className="text-[10.5px] text-text-muted dark:text-white/40 mt-0.5">
                  {v.aspect_ratio}{v.duration_seconds ? ` · ${v.duration_seconds}s` : ''}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize ${STATUS_STYLE[v.status] || STATUS_STYLE.draft}`}>
                {v.status || 'draft'}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-text-muted/30 group-hover:text-text-muted group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </a>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Upcoming scheduled list (D-55: next 5) ── */
function UpcomingScheduledCard({ posts }: { posts: ScheduledPostWithVideo[] }) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  return (
    <div className="col-span-1 md:col-span-4 bento-card p-0 overflow-hidden cursor-default">
      <div className="px-4 md:px-5 py-4 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-text dark:text-white flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5 text-secondary" strokeWidth={2} />
          Upcoming
        </p>
        <a href="/calendar" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors duration-150 group/link">
          Schedule
          <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" strokeWidth={2} />
        </a>
      </div>
      <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
        {posts.length === 0 ? (
          <div className="px-4 md:px-5 py-8 text-center">
            <p className="text-[12px] text-text-muted dark:text-white/50">Nothing scheduled.</p>
          </div>
        ) : (
          posts.map((p, i) => (
            <a
              key={p.id}
              href="/calendar"
              className={`group flex items-center gap-2.5 px-4 md:px-5 py-3 min-h-[44px] hover:bg-black/[0.015] dark:hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer ${i === posts.length - 1 ? '' : 'border-b border-black/[0.04] dark:border-white/[0.06]'}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-text dark:text-white truncate">{p.title || 'Untitled post'}</p>
                <p className="text-[10.5px] text-text-muted dark:text-white/40 mt-0.5 capitalize">
                  {p.platform} · {fmt(p.scheduled_at)}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-text-muted/30 group-hover:text-text-muted group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </a>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Action card ── */
function ActionCard({ href, Icon, gradient, shadowColor, title, desc, badge }: {
  href: string; Icon: typeof Video; gradient: string; shadowColor: string; title: string; desc: string; badge?: string;
}) {
  return (
    <a href={href} className="col-span-1 md:col-span-4 bento-card group relative overflow-hidden p-4 md:p-5 min-h-[44px] cursor-pointer">
      <div className={`absolute top-0 right-0 w-20 h-20 bg-${shadowColor}/[0.03] dark:bg-${shadowColor}/[0.06] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-${shadowColor}/[0.06] dark:group-hover:bg-${shadowColor}/[0.10] transition-colors duration-500`} />
      <div className="flex items-center gap-2 mb-3 md:mb-4">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shadow-${shadowColor}/15`}>
          <Icon className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        {badge && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-danger bg-danger/[0.08] dark:bg-danger/[0.15] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[13px] font-semibold text-text dark:text-white mb-0.5 flex items-center gap-1.5">
        {title}
        <ArrowRight className="w-3 h-3 text-text-muted/30 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
      </p>
      <p className="text-[11px] text-text-muted dark:text-white/50 leading-relaxed">{desc}</p>
    </a>
  );
}

/* ── Getting Started card for new users ── */
function GettingStartedCard({ isKokoroReady }: { isKokoroReady: boolean }) {
  const completedSteps = isKokoroReady ? 1 : 0;

  return (
    <div className="col-span-1 md:col-span-8 bento-card p-0 overflow-hidden cursor-default">
      <div className="px-4 md:px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text dark:text-white flex items-center gap-1.5">
            <Rocket className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
            Getting Started
          </p>
          <p className="text-[11px] text-text-muted dark:text-white/50 mt-0.5">Complete these steps to start creating</p>
        </div>
        <span className="text-[10px] font-semibold text-text-muted/40 bg-black/[0.03] dark:bg-white/[0.06] px-2.5 py-1 rounded-md">
          {completedSteps} / 3
        </span>
      </div>
      <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
        <GettingStartedRow
          num={1}
          title="Download AI Models"
          desc="Kokoro TTS is required for voice generation. Download it to get started."
          href="/models"
          done={isKokoroReady}
          Icon={Download}
          accentColor="primary"
        />
        <GettingStartedRow
          num={2}
          title="Create Your First Video"
          desc="Write a script with AI, pick a voice, and render entirely in your browser."
          href="/video/create"
          done={false}
          Icon={Video}
          accentColor="secondary"
        />
        <GettingStartedRow
          num={3}
          title="Set Up Publishing"
          desc="Connect YouTube, TikTok, or Instagram to publish directly from Contentine Create."
          href="/settings?tab=integrations"
          done={false}
          Icon={Link2}
          accentColor="info"
          last
        />
      </div>
    </div>
  );
}

/* ── Getting started step row with completion state ── */
function GettingStartedRow({ num, title, desc, href, done, Icon, accentColor, last }: {
  num: number; title: string; desc: string; href: string; done: boolean; Icon: typeof Download; accentColor: string; last?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group flex items-center gap-3 md:gap-3.5 px-4 md:px-5 py-3.5 min-h-[44px] hover:bg-black/[0.015] dark:hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer ${last ? '' : 'border-b border-black/[0.04] dark:border-white/[0.06]'}`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
        done
          ? 'bg-secondary/[0.1] dark:bg-secondary/[0.15]'
          : `bg-${accentColor}/[0.06] dark:bg-${accentColor}/[0.1] group-hover:bg-${accentColor}/[0.1] dark:group-hover:bg-${accentColor}/[0.15]`
      }`}>
        {done ? (
          <CheckCircle className="w-4 h-4 text-secondary" strokeWidth={2} />
        ) : (
          <Icon className={`w-3.5 h-3.5 text-${accentColor}`} strokeWidth={1.75} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[12.5px] font-medium ${done ? 'text-text-muted dark:text-white/40 line-through' : 'text-text dark:text-white'}`}>{title}</p>
        <p className="text-[11px] text-text-muted dark:text-white/50 mt-0.5 line-clamp-2 md:line-clamp-none">{desc}</p>
      </div>
      {!done && (
        <span className={`text-[10px] font-semibold text-${accentColor} bg-${accentColor}/[0.06] dark:bg-${accentColor}/[0.12] px-2 py-0.5 rounded-full shrink-0 hidden md:inline-flex`}>
          {num === 1 ? 'Required' : `Step ${num}`}
        </span>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-text-muted/30 group-hover:text-text-muted group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
    </a>
  );
}

/* ── AI Model Status Card ── */
function AIModelStatusCard({ keyModels, modelStatus }: {
  keyModels: AIModel[];
  modelStatus: { downloaded: number; total: number; isKokoroReady: boolean };
}) {
  return (
    <div className="col-span-1 md:col-span-8 bento-card p-0 overflow-hidden cursor-default">
      <div className="px-4 md:px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
            AI Model Status
          </p>
          <p className="text-[11px] text-text-muted dark:text-white/50 mt-0.5">
            {modelStatus.downloaded} of {modelStatus.total} models ready
          </p>
        </div>
        <a
          href="/models"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors duration-150 group/link"
        >
          Manage
          <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" strokeWidth={2} />
        </a>
      </div>
      <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
        {keyModels.map((model, i) => {
          const IconComponent = MODEL_ICON_MAP[model.category] || MessageSquare;
          const isReady = model.status === 'ready';
          const isDownloading = model.status === 'queued' || model.status === 'downloading' || model.status === 'finalizing' || model.status === 'verifying';
          const isError = model.status === 'error';
          const isLast = i === keyModels.length - 1;

          return (
            <div
              key={model.id}
              className={`flex items-center gap-3 px-4 md:px-5 py-3 min-h-[44px] ${isLast ? '' : 'border-b border-black/[0.04] dark:border-white/[0.06]'}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isReady
                  ? 'bg-secondary/[0.08] dark:bg-secondary/[0.12]'
                  : isError
                    ? 'bg-danger/[0.08] dark:bg-danger/[0.12]'
                    : 'bg-black/[0.03] dark:bg-white/[0.06]'
              }`}>
                <IconComponent className={`w-3.5 h-3.5 ${
                  isReady ? 'text-secondary' : isError ? 'text-danger' : 'text-text-muted dark:text-white/40'
                }`} strokeWidth={1.75} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-text dark:text-white leading-tight">{model.name}</p>
                <p className="text-[10px] text-text-muted dark:text-white/40 mt-0.5">
                  {MODEL_CATEGORY_LABEL[model.category]} · {formatBytes(model.sizeBytes)}
                </p>
              </div>

              {/* Status badge */}
              {isReady && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-secondary bg-secondary/[0.08] dark:bg-secondary/[0.15] px-2 py-0.5 rounded-full shrink-0">
                  <CheckCircle className="w-3 h-3" strokeWidth={2} />
                  Ready
                </span>
              )}
              {isDownloading && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/[0.08] dark:bg-primary/[0.15] px-2 py-0.5 rounded-full shrink-0">
                  <Download className="w-3 h-3 animate-bounce" strokeWidth={2} />
                  {Math.round(model.downloadProgress * 100)}%
                </span>
              )}
              {isError && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-danger bg-danger/[0.08] dark:bg-danger/[0.15] px-2 py-0.5 rounded-full shrink-0">
                  <AlertCircle className="w-3 h-3" strokeWidth={2} />
                  Error
                </span>
              )}
              {!isReady && !isDownloading && !isError && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/[0.08] dark:bg-warning/[0.15] px-2 py-0.5 rounded-full shrink-0">
                  <AlertCircle className="w-3 h-3" strokeWidth={2} />
                  Not Downloaded
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Getting started row (original style for populated state) ── */
function StepRow({ num, title, desc, href, last, done }: {
  num: number; title: string; desc: string; href: string; last?: boolean; done?: boolean;
}) {
  return (
    <a href={href} className={`group flex items-center gap-3 md:gap-3.5 px-4 md:px-5 py-3.5 min-h-[44px] hover:bg-black/[0.015] dark:hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer ${last ? '' : 'border-b border-black/[0.04] dark:border-white/[0.06]'}`}>
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold transition-all duration-200 ${
        done
          ? 'bg-secondary/[0.1] dark:bg-secondary/[0.15]'
          : 'bg-[#F0F1F3] dark:bg-white/[0.08] text-text-muted/60 dark:text-white/50 group-hover:bg-primary/[0.08] group-hover:text-primary'
      }`}>
        {done ? <CheckCircle className="w-3.5 h-3.5 text-secondary" strokeWidth={2} /> : num}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[12.5px] font-medium ${done ? 'text-text-muted dark:text-white/40 line-through' : 'text-text dark:text-white'}`}>{title}</p>
        <p className="text-[11px] text-text-muted dark:text-white/50 mt-0.5 line-clamp-2 md:line-clamp-none">{desc}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-text-muted/30 group-hover:text-text-muted group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
    </a>
  );
}

/* ── Tools shortcut row ── */
function ToolLink({ href, Icon, label, tag }: {
  href: string; Icon: typeof Wand2; label: string; tag: string;
}) {
  return (
    <a href={href} className="group flex items-center gap-3 px-4 md:px-5 py-3 min-h-[44px] hover:bg-black/[0.015] dark:hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer border-b border-black/[0.04] dark:border-white/[0.06] last:border-0">
      <Icon className="w-4 h-4 text-text-muted/50 group-hover:text-text-secondary transition-colors duration-150 shrink-0" strokeWidth={1.5} />
      <span className="text-[12px] font-medium text-text-secondary dark:text-white/70 group-hover:text-text dark:group-hover:text-white transition-colors duration-150 flex-1">{label}</span>
      <span className="text-[9.5px] text-text-muted/50 font-medium bg-black/[0.03] dark:bg-white/[0.06] px-2 py-0.5 rounded-md">{tag}</span>
    </a>
  );
}
