// ============================================
// Contentine Create — Core Type Definitions
// ============================================

// --- User & Auth ---

export type PlanTier = 'free' | 'starter' | 'professional' | 'business' | 'enterprise';
export type UserRole = 'owner' | 'editor' | 'viewer' | 'admin';

export interface User {
  id: number;
  auth0_sub: string;
  email: string;
  name: string | null;
  plan_tier: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  timezone: string;
  team_id: number | null;
  role: UserRole;
  storage_used_bytes: number;
  onboarding_completed_at: string | null;
  onboarding_data: OnboardingData | null;
  trial_ends_at: string | null;
  created_at: string;
}

export interface OnboardingData {
  content_types: string[];
  connected_platforms: string[];
  first_action: string;
}

// --- Video ---

export type VideoType = 'faceless' | 'avatar';
export type VideoStatus = 'draft' | 'rendering' | 'completed' | 'published' | 'failed';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export type StyleMode = 'ai_visuals' | 'video_vault' | 'stock' | 'broll' | 'url' | 'product_url' | 'audio' | 'text_to_scene';

export interface Video {
  id: number;
  user_id: number;
  project_id: number | null;
  title: string;
  type: VideoType;
  style_mode: StyleMode | null;
  script_json: ScriptJSON;
  art_style: string | null;
  voice_profile_id: number | null;
  character_anchor_id: number | null;
  aspect_ratio: AspectRatio;
  duration_seconds: number;
  status: VideoStatus;
  mp4_path: string | null;
  thumbnail_path: string | null;
  folder_path: string;
  render_started_at: string | null;
  render_completed_at: string | null;
  created_at: string;
}

export interface ScriptJSON {
  scenes: Scene[];
  music?: { url: string; volume: number };
  settings?: {
    aspect_ratio: AspectRatio;
    voice_id: string;
    subtitle_style: string;
  };
}

export interface Scene {
  id: string;
  narration: string;
  visual_prompt: string;
  image_url?: string;
  duration: number;
  transition?: 'crossfade' | 'cut' | 'slide';
  ken_burns?: { start: KenBurnsPos; end: KenBurnsPos };
  subtitle_style?: string;
}

export interface KenBurnsPos {
  x: number;
  y: number;
  scale: number;
}

// --- Avatar ---

export interface AvatarPreset {
  id: number;
  name: string;
  description: string | null;
  gender: string | null;
  age_range: string | null;
  ethnicity: string | null;
  style: string | null;
  photo_path: string;
  is_active: boolean;
  sort_order: number;
}

export interface CharacterAnchor {
  id: number;
  user_id: number | null;
  name: string;
  photo_path: string | null;
  description_text: string | null;
  seed_value: number | null;
  art_style: string | null;
  is_preset: boolean;
  gender: string | null;
  age_range: string | null;
  ethnicity: string | null;
  style: string | null;
}

// --- Voice ---

export type VoiceSource = 'preset' | 'cloned';

export interface VoiceProfile {
  id: number;
  user_id: number | null;
  name: string;
  kokoro_voice_id: string | null;
  source: VoiceSource;
  language: string;
  gender: string | null;
  tone: string | null;
  speed: number;
  pitch: number;
  style: string;
  is_preset: boolean;
  /** Object URL for cloned voice reference sample playback (client-side only). */
  preview_url?: string;
  /** Kokoro voice ID matched by detected gender — used for TTS preview of cloned voices. */
  matched_kokoro_id?: string;
  /** Raw audio blob of the reference sample (client-side only). */
  sample_blob?: Blob;
  /** Duration of the reference sample in seconds. */
  sample_duration?: number;
  /** Clone method used — f5tts for real voice cloning, kokoro-matched for gender-based Kokoro fallback. */
  cloneType?: 'f5tts' | 'kokoro-matched';
}

// --- Schedule ---

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'threads' | 'twitter';
export type PostStatus = 'pending' | 'publishing' | 'published' | 'failed';

export interface ScheduledPost {
  id: number;
  video_id: number;
  platform: Platform;
  scheduled_at: string;
  status: PostStatus;
  published_url: string | null;
  cta_template_id: number | null;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  hashtags: string[] | null;
  error_message: string | null;
}

export interface SocialAccount {
  id: number;
  user_id: number;
  platform: Platform;
  account_name: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
}

// --- Content Remix ---

export type SourceType = 'text' | 'url' | 'youtube' | 'tiktok' | 'pdf' | 'audio' | 'video';
export type RemixTarget = 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'tiktok' | 'threads' | 'blog' | 'newsletter' | 'video_script';
export type RemixStatus = 'draft' | 'generated' | 'published';

export interface RemixProject {
  id: number;
  user_id: number;
  name: string | null;
  custom_instructions: string | null;
  target_platforms: RemixTarget[];
  status: RemixStatus;
  sources?: RemixSource[];
  outputs?: RemixOutput[];
  created_at: string;
}

export interface RemixSource {
  id: number;
  remix_project_id: number;
  source_type: SourceType;
  source_url: string | null;
  source_title: string | null;
  extracted_text: string | null;
  sort_order: number;
}

export interface RemixOutput {
  id: number;
  remix_project_id: number;
  target_platform: RemixTarget;
  generated_text: string | null;
  generated_json: ScriptJSON | null;
  is_edited: boolean;
  status: 'generated' | 'scheduled' | 'published';
  scheduled_post_id: number | null;
  video_id: number | null;
}

// --- Analytics ---

export interface AnalyticsSnapshot {
  id: number;
  video_id: number;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  ctr: number;
  snapshot_date: string;
}

// --- Notifications ---

export type NotificationType = 'render_complete' | 'post_published' | 'publish_success' | 'publish_failed' | 'team_activity' | 'system' | 'alert';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  is_read: boolean;
  related_type: string | null;
  related_id: number | null;
  created_at: string;
}

// --- Device Capabilities ---

export type DeviceTier = 'high' | 'standard' | 'mobile' | 'low';

export interface DeviceCapabilities {
  tier: DeviceTier;
  hasWebGPU: boolean;
  hasWebCodecs: boolean;
  hasSharedArrayBuffer: boolean;
  ramGB: number;
  cores: number;
  maxWorkers: number;
  maxResolution: '4k' | '1080p' | '720p';
  ttsDevice: 'webgpu' | 'wasm';
  ttsQuantization: 'fp32' | 'fp16' | 'q8' | 'q4';
}

// --- Render Pipeline ---

export type RenderPhase = 'idle' | 'transcribing' | 'tts' | 'images' | 'compositing' | 'encoding' | 'muxing' | 'uploading' | 'complete' | 'error';

export interface RenderProgress {
  phase: RenderPhase;
  currentScene: number;
  totalScenes: number;
  percent: number;
  message: string;
}

// --- CTA Templates ---

export interface CTATemplate {
  id: number;
  user_id: number;
  name: string;
  cta_text: string;
  links: { label: string; url: string }[] | null;
  is_default: boolean;
  created_at: string;
}

// --- Calendar ---

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  posts: ScheduledPost[];
}

export interface ScheduledPostWithVideo extends ScheduledPost {
  video_title: string;
  video_thumbnail: string | null;
  video_type: VideoType;
}

// --- Bulk Schedule ---

export interface BulkScheduleRow {
  video_id: number;
  platform: Platform;
  scheduled_at: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
}

/* ── Idea Discovery ── */

export type IdeaPlatform = 'google' | 'youtube' | 'bing' | 'tiktok' | 'instagram' | 'twitter' | 'pinterest' | 'quora';

export interface IdeaSearchResult {
  title: string;
  url?: string;
  source_platform: IdeaPlatform;
  search_volume?: number;
  description?: string;
}

export interface FavouriteTopic {
  id: number;
  user_id: number;
  topic_text: string;
  source_platform: IdeaPlatform | null;
  search_volume: number | null;
  created_at: string;
}

/* ── AI Writer ── */

export type WriterDocType = 'blog' | 'caption' | 'email' | 'description' | 'ad' | 'summary';
export type WriterTone = 'professional' | 'casual' | 'witty' | 'formal' | 'inspirational';
export type WriterLength = 'short' | 'medium' | 'long';

export interface AIWriterDoc {
  id: number;
  user_id: number;
  type: WriterDocType;
  title: string | null;
  content: string | null;
  content_preview?: string;
  created_at: string;
}

export interface WriterGenerateRequest {
  type: WriterDocType;
  topic: string;
  tone: WriterTone;
  length: WriterLength;
  additional_instructions?: string;
}

export interface WriterGenerateResponse {
  title: string;
  content: string;
  type: WriterDocType;
  word_count: number;
}

/* ── Inspiration ── */

export interface InspirationItem {
  id: number;
  type: 'video' | 'post' | 'idea';
  title: string;
  thumbnail?: string;
  source_platform: string;
  engagement_score?: number;
}

/* ── Analytics (Phase 7) ── */

export type AnalyticsMetric = 'views' | 'likes' | 'comments' | 'shares' | 'ctr';

export interface AnalyticsAlert {
  id: number;
  metric: AnalyticsMetric;
  threshold: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AnalyticsSummary {
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  avg_ctr: number;
  top_platform: string;
  best_video_id: number | null;
}

export interface DailyAnalytics {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface VideoAnalytics {
  video_id: number;
  title: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  ctr: number;
}

export interface PlatformAnalytics {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface AnalyticsResponse {
  summary: AnalyticsSummary;
  daily: DailyAnalytics[];
  per_video: VideoAnalytics[];
  platform_breakdown: PlatformAnalytics[];
}

export type AnalyticsRange = '7d' | '30d' | '90d' | 'custom';

/* ── Team (Phase 7) ── */

export interface Team {
  id: number;
  name: string;
  owner_id: number;
  plan_tier: 'business' | 'enterprise';
  created_at: string;
}

export interface TeamMember {
  id: number;
  name: string | null;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface ActivityLogEntry {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  created_at: string;
}

// ── Billing & Plans (Phase 8) ──

export interface PlanInfo {
  id: PlanTier;
  name: string;
  price: number;
  features: string[];
  recommended?: boolean;
}

export interface UserUsage {
  videos_created: number;
  posts_scheduled: number;
  posts_published: number;
  storage_used_mb: number;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  trial_videos_used: number;
}

// ── Settings (Phase 8) ──

export interface UserPreferences {
  timezone: string;
  default_aspect_ratio: '16:9' | '9:16' | '1:1';
  email_notifications: boolean;
  push_notifications: boolean;
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  plan_tier: PlanTier;
  trial_ends_at: string | null;
  onboarding_completed_at: string | null;
  onboarding_data: OnboardingData | null;
  preferences: UserPreferences | null;
  created_at: string;
}

// ── Thumbnails (Phase 8) ──

export interface Thumbnail {
  id: number;
  video_id: number | null;
  prompt: string;
  image_path: string;
  created_at: string;
}

// ── Marketplace ──

export type MarketplaceCategory = 'templates' | 'prompts' | 'voices' | 'styles';
export type MarketplaceSort = 'popular' | 'newest' | 'price_asc' | 'price_desc';
export type MarketplaceListingStatus = 'active' | 'paused' | 'removed';

export interface MarketplaceListing {
  id: number;
  seller_id: number;
  seller_name?: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  price_cents: number;
  preview_url: string;
  asset_data: Record<string, unknown>;
  downloads: number;
  rating_avg: number;
  rating_count: number;
  status: MarketplaceListingStatus;
  created_at: string;
}

export interface MarketplacePurchase {
  id: number;
  buyer_id: number;
  listing_id: number;
  listing?: MarketplaceListing;
  price_cents: number;
  purchased_at: string;
}

export interface MarketplaceReview {
  id: number;
  listing_id: number;
  reviewer_id: number;
  reviewer_name?: string;
  rating: number;
  review_text: string;
  created_at: string;
}
