# Contentine Create — Architecture Reference

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js Static App (React 18 + TypeScript)          │   │
│  │  ├── 31 pages (App Router)                           │   │
│  │  ├── Zustand stores (22 stores, one per domain)      │   │
│  │  ├── Auth0 SPA SDK (JWT auth)                        │   │
│  │  └── Stripe.js (payments)                            │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                          │
│  ┌────────────────┴─────────────────────────────────────┐   │
│  │  Browser-Native ML/Video Engines                      │   │
│  │  ├── Kokoro/HeadTTS (TTS + viseme timestamps)        │   │
│  │  ├── TalkingHead (3D avatar + lip-sync)              │   │
│  │  ├── WebCodecs (H.264 video encoding)                │   │
│  │  ├── Mediabunny (video muxing, pure TS)              │   │
│  │  ├── face-api.js (face detection)                    │   │
│  │  ├── ONNX Runtime Web (ML inference)                 │   │
│  │  ├── WebLLM (in-browser LLM)                         │   │
│  │  └── Whisper.cpp WASM (speech-to-text)               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (API calls only)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              DreamHost Shared Hosting (Apache)                │
│                                                              │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │  Static Files        │  │  PHP 8.4 Backend             │  │
│  │  (HTML/JS/CSS/assets)│  │  ├── Router.php (39+ routes) │  │
│  │  served by Apache    │  │  ├── Auth.php (JWT verify)   │  │
│  │                      │  │  ├── Database.php (MySQL PDO)│  │
│  │  .htaccess handles:  │  │  ├── 33 Controllers          │  │
│  │  - SPA routing       │  │  ├── 8 Services              │  │
│  │  - /api/* → PHP      │  │  ├── 4 Middleware             │  │
│  │  - Auth header pass  │  │  └── Cron (analytics, publish)│  │
│  │  - GZIP, caching     │  │                               │  │
│  └──────────────────────┘  └──────────┬──────────────────┘  │
│                                        │                     │
│                            ┌───────────┴──────────────┐     │
│                            │  MySQL 8                  │     │
│                            │  25+ tables               │     │
│                            │  admin_config.php secrets │     │
│                            └───────────┬──────────────┘     │
│                                        │                     │
│                            ┌───────────┴──────────────┐     │
│                            │  External API Proxies     │     │
│                            │  ├── Anthropic (Claude)   │     │
│                            │  ├── OpenAI (DALL-E 3)    │     │
│                            │  ├── Pexels (stock media) │     │
│                            │  ├── Pixabay (stock media)│     │
│                            │  ├── Freesound (audio)    │     │
│                            │  ├── D-ID (pro avatars)   │     │
│                            │  ├── Auth0 (JWKS verify)  │     │
│                            │  └── Stripe (payments)    │     │
│                            └──────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

## Core Principle: Browser Does All Heavy Compute

Video rendering, TTS, face animation, image generation, and ML inference all happen in the browser. The PHP backend is intentionally thin — it stores data, proxies API calls (to keep secrets server-side), runs cron jobs, and serves as an auth gateway. This means:

- No video processing on the server
- No ML inference on the server
- No Node.js server needed
- Static export works on any Apache host
- Scales to unlimited users without server GPU costs

## Frontend Architecture

### Pages (31 Routes)

| Route | Purpose |
|-------|---------|
| / | Dashboard |
| /admin/* | Admin panel (users, credits, keys, enterprise, providers) |
| /analytics | Video analytics + consistency heatmap |
| /avatar-editor | Avatar video creation |
| /calendar | Publishing calendar |
| /converter | Format converter |
| /create/avatar | Avatar creation wizard |
| /credits | Credit management |
| /discover | Content ideas / SEO discovery |
| /marketplace | Creator marketplace |
| /models | ML model manager (download/cache status) |
| /notifications | Notification center |
| /onboarding | 4-step onboarding wizard |
| /pricing | Plan selection + enterprise contact |
| /remix | Content Remix Hub (7 inputs -> 10 outputs) |
| /scheduler | Social media scheduler + bulk upload |
| /settings | User settings + API keys + webhooks |
| /stock-media | Stock media library (Pexels/Pixabay/Freesound) |
| /team | Team management |
| /thumbnails | AI thumbnail generator |
| /translate | Video translation |
| /video/create | Faceless video editor (main creation flow) |
| /videos | My Videos library |
| /voices | Voice management + cloning |
| /writer | AI Writer (6 content types) |

### State Management (22 Zustand Stores)

Each store is independent and manages one domain:

| Store | Purpose |
|-------|---------|
| auth-store | Auth0 user state, login/logout |
| editor-store | Video editor state (scenes, timeline) |
| video-store | Video library, upload, render status |
| avatar-store | Avatar presets, selection |
| discover-store | Content ideas, SEO results |
| remix-store | Remix Hub state (source, outputs) |
| schedule-store | Scheduling calendar, bulk upload |
| analytics-store | Analytics data, charts |
| team-store | Team members, invites |
| writer-store | AI Writer documents |
| notification-store | Notifications |
| onboarding-store | Onboarding progress |
| settings-store | User preferences |
| stock-store | Stock media search results |
| credit-store | Credit balance, usage |
| marketplace-store | Marketplace listings, purchases |
| api-keys-store | API key management |
| webhooks-store | Webhook configuration |
| consistency-store | Posting streak data |
| model-store | ML model download status |
| device-store | Device capability detection |
| byok-store | Bring-your-own-key settings |

### Engine Layer (21 Browser-Native Engines)

| Engine | File | Purpose |
|--------|------|---------|
| TTS Manager | tts-manager.ts | Kokoro TTS orchestration |
| TTS Worker | tts-worker.ts | Web Worker for TTS processing |
| Ken Burns | ken-burns.ts | Pan/zoom animation on images |
| Subtitle Renderer | subtitle-renderer.ts | Text overlay on video frames |
| WebCodecs Encoder | webcodecs-encoder.ts | H.264 frame encoding |
| Mediabunny Muxer | mediabunny-muxer.ts | Video + audio muxing to MP4 |
| Render Pipeline | render-pipeline.ts | Orchestrates full video render |
| Face Animator | face-animator.ts | face-api.js landmark detection |
| Avatar Pipeline | avatar-render-pipeline.ts | Avatar video composition |
| TalkingHead Engine | talkinghead-engine.ts | 3D avatar rendering |
| Wav2Lip Engine | wav2lip-engine.ts | Photo-to-talking-head |
| F5-TTS Engine | f5tts-engine.ts | Voice cloning |
| SD Turbo Engine | sd-turbo-engine.ts | Image generation |
| WebLLM Engine | webllm-engine.ts | In-browser LLM |
| Whisper Engine | whisper-engine.ts | Speech-to-text |
| Translation Pipeline | translation-pipeline.ts | Multi-language translation |
| Asset Cache | asset-cache.ts | IndexedDB cache for models |
| Device Detect | device-detect.ts | GPU/memory capability detection |
| Device Scanner | device-scanner.ts | First-run capability scan (GPU/VRAM/CPU) |
| Browser Engine Manager | browser-engine-manager.ts | Runtime engine selection + fallback routing |
| Gemini Nano Engine | gemini-nano-engine.ts | On-device Gemini Nano inference |

### Video Rendering Pipeline

```
Script (scenes with text)
  → TTS Worker (Kokoro generates audio + viseme timestamps)
  → Image Fetch (AI-generated or stock, one per scene)
  → Ken Burns Canvas (pan/zoom animation on each image)
  → Subtitle Renderer (text overlay on frames)
  → WebCodecs Encoder (H.264 frame encoding)
  → Mediabunny Muxer (combine video + audio → MP4)
  → Upload to server / Download
```

## Backend Architecture

### Request Flow

```
Apache (.htaccess)
  → /api/* routes to backend/public/index.php
  → Router.php matches route + method
  → Middleware chain (CORS, rate limit, auth, CSRF, input validation)
  → Controller method
  → Service layer (if needed)
  → Database.php (PDO + prepared statements)
  → JSON response
```

### Controllers (33)

AdminCreditController, AdminKeyController, AiProviderController, AnalyticsController, ApiKeyController, AssetController, AuthController, AvatarController, CharacterController, CreditController, DocsController, EnterpriseController, IdeaController, ImageController, InspirationController, MarketplaceController, NotificationController, ProAvatarController, PromptController, PublishController, RemixController, ScheduleController, ScriptController, StockController, StripeController, TeamController, ThumbnailController, UserController, UserKeyController, VideoController, VoiceController, WebhookController, WriterController

### Services (8)

| Service | Purpose |
|---------|---------|
| LLMService | Proxies to Anthropic Claude API for script generation |
| ContentExtractor | Extracts text from URLs (Readability), YouTube transcripts |
| CreditService | Credit balance tracking and enforcement |
| ApiKeyService | Encrypted API key storage/retrieval |
| EncryptionService | AES-256-GCM encryption for secrets in database |
| SocialPublisher | OAuth token management for 7 publishing platforms |
| DidService | D-ID API integration for pro avatar generation |
| AiProviderService | Manages AI provider configuration + tier selection |

### Database Schema (25+ tables)

Core tables: users, teams, team_members, projects, videos, video_scenes, scheduled_posts, analytics_daily, templates, style_presets, avatar_presets, voice_presets, characters, notifications, user_settings

v2.2 additions: writer_documents, stock_media_cache, api_keys, webhooks, marketplace_listings, marketplace_purchases, marketplace_reviews, enterprise_leads, system_api_keys, credit_transactions, ai_provider_tiers

### Security

- JWT verification via Auth0 JWKS endpoint
- AES-256-GCM encryption for API keys in database
- CSRF tokens with HMAC validation
- Rate limiting (60 req/min general, 10 auth attempts/hour)
- Prepared statements only (no string concatenation in SQL)
- admin_config.php above webroot (never web-accessible)
- No secrets in frontend code (NEXT_PUBLIC_* are public by design)

## Three-Tier Avatar Strategy

| Tier | Technology | Quality | Cost |
|------|-----------|---------|------|
| Tier 1 (Quick) | TalkingHead + HeadTTS Kokoro | 3D avatar, real-time | Free, unlimited |
| Tier 2 (Photo) | Wav2Lip ONNX (browser) | Photo-to-talking-head | Free, unlimited |
| Tier 3 (Pro) | D-ID API (server proxy) | Photorealistic | ~$0.05-0.10 per 30s |
