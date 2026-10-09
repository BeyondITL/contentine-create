# Contentine — Engineering Specification for Claude Code

> **Version:** 2.1 (Content Remix Update) | **Date:** February 28, 2026  
> **Purpose:** This file is the single source of truth for building Contentine. Hand it to Claude Code and it has everything needed to scaffold, build, and ship.

---

## 0. ABSOLUTE CONSTRAINTS

| Rule | Detail |
|------|--------|
| **Zero external runtime services** | No SaaS dependencies except: (1) LLM API (Claude/GPT) for script gen, (2) Image Gen API (DALL-E/Gemini) for visuals, (3) Social Platform APIs (YouTube/TikTok/Meta/LinkedIn/Threads/Twitter) for publishing, (4) Pexels/Pixabay free APIs for stock media |
| **Browser does ALL heavy compute** | TTS, video rendering, image animation, face detection, audio muxing — all client-side |
| **Backend is paper-thin** | PHP 8.4 + MySQL 8 on DreamHost shared hosting. Backend stores data, proxies API calls, runs cron for scheduled publishing, sends emails. **No video processing, no ML inference, no heavy compute on server.** |
| **All libraries vendored or npm-bundled** | Every dependency ships with the app. No CDN calls at runtime for core functionality (model weights cached in IndexedDB after first load from our own CDN/server) |
| **No credits system** | Unlimited usage on all paid plans |
| **Static Next.js export** | `next export` → static HTML/JS/CSS deployed to DreamHost. No Node.js server. |

---

## 1. VERIFIED DEPENDENCY REGISTRY

Every library below has been verified as of February 2026. Git repos are real, licenses confirmed, browser compatibility tested.

### 1.1 Core Framework

| Library | Version | Git Repo | License | Purpose | Bundle Strategy |
|---------|---------|----------|---------|---------|-----------------|
| Next.js | 14+ | `https://github.com/vercel/next.js` | MIT | Frontend framework, static export | npm dependency |
| React | 18+ | `https://github.com/facebook/react` | MIT | UI components | npm dependency (bundled with Next.js) |
| Zustand | 4+ | `https://github.com/pmndrs/zustand` | MIT | State management (lighter than Redux) | npm dependency |
| Tailwind CSS | 3+ | `https://github.com/tailwindlabs/tailwindcss` | MIT | Utility-first CSS | npm dev dependency (purged at build) |

### 1.2 Text-to-Speech (Browser-Side)

| Library | Version | Git Repo | License | Purpose | Size | Bundle Strategy |
|---------|---------|----------|---------|---------|------|-----------------|
| kokoro-js | latest | `https://github.com/hexgrad/kokoro` (subdir: `kokoro.js/`) | Apache 2.0 | 82M-param TTS model, runs 100% in browser via Transformers.js | ~87MB model (q8), ~326MB (fp32) | npm: `kokoro-js`. Model weights from `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX`. Cached in IndexedDB after first download. |
| Kokoro ONNX models | v1.0 | `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX` | Apache 2.0 | Pre-converted ONNX weights for browser inference | q8: ~87MB, q4: ~50MB | Host on our CDN or serve from DreamHost. User's browser caches in IndexedDB. |
| Kokoro voice files | v1.0 | Same HuggingFace repo, `/voices/` directory | Apache 2.0 | 54+ voice preset files (.bin) | ~2-5MB each | Lazy-load per voice selection. Cache in IndexedDB. |

**Key kokoro-js integration code:**
```javascript
import { KokoroTTS } from "kokoro-js";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",        // Options: "fp32", "fp16", "q8", "q4", "q4f16"
  device: "wasm",     // Options: "wasm", "webgpu"
});

// List all available voices
const voices = tts.list_voices();

// Generate speech
const audio = await tts.generate("Hello world", { voice: "af_sky" });

// Streaming generation (for long text)
const stream = tts.stream(longText);
for await (const { text, phonemes, audio } of stream) {
  // Process each chunk
}
```

**Voice cloning approach:** Record 5s via MediaRecorder API → extract AudioBuffer → use as reference embedding with Kokoro's voice conditioning. Store embedding blob in MySQL + IndexedDB.

### 1.3 Face Detection & Avatar Animation (Browser-Side)

| Library | Version | Git Repo | License | Purpose | Size | Bundle Strategy |
|---------|---------|----------|---------|---------|------|-----------------|
| face-api.js | 0.22.2 | `https://github.com/justadudewhohacks/face-api.js` | MIT | 68-point facial landmark detection in browser via TensorFlow.js | ~6MB models total | npm: `face-api.js`. Model weights from `https://github.com/justadudewhohacks/face-api.js-models`. Host models on our server, load into browser. |
| face-api.js models | latest | `https://github.com/justadudewhohacks/face-api.js-models` | MIT | Pre-trained model weight files (shard files) | tiny_face_detector: ~190KB, face_landmark_68: ~350KB, face_recognition: ~6.2MB | Serve from `/public/models/`. Browser fetches on first avatar use. |

**Phase 1 pseudo-avatar pipeline:**
```
1. User uploads photo OR selects from 30+ presets
2. face-api.js detects 68 facial landmarks
3. Canvas API + CSS3D transforms: mouth open/close synced to TTS audio amplitude
4. Eye blink animation (random intervals), subtle head bob
5. Composite on styled background → encode via WebCodecs
```

### 1.4 Neural Talking Head — Phase 2 (Month 4+)

| Library | Version | Git Repo | License | Purpose | Size | Bundle Strategy |
|---------|---------|----------|---------|---------|------|-----------------|
| SadTalker | latest | `https://github.com/OpenTalker/SadTalker` | Apache 2.0 | Audio-driven talking head animation from single image | ~190MB ONNX models (INT8 quantized) | Export PyTorch → ONNX. Run via onnxruntime-web in browser. Cache in IndexedDB. |
| SadTalker ONNX export reference | — | `https://github.com/foocker/SadTalkerTriton` | — | Reference for ONNX export of SadTalker submodels | — | Use as guide to export ExpNet, PoseVAE, MappingNet, Generator to ONNX |
| onnxruntime-web | 1.20+ | `https://github.com/microsoft/onnxruntime` (JS package: `onnxruntime-web`) | MIT | Run ONNX models in browser (WASM + WebGPU backends) | ~15MB WASM runtime | npm: `onnxruntime-web`. Include WASM files in static build. |

**⚠️ DO NOT USE:** `LAM` (LivePortrait) — research-only license, NOT commercial.

### 1.5 Video Encoding & Muxing (Browser-Side)

| Library | Version | Git Repo | License | Purpose | Size | Bundle Strategy |
|---------|---------|----------|---------|---------|------|-----------------|
| WebCodecs API | Native | Browser built-in (Chrome 94+, Edge 94+, Safari 16.4+) | Web Standard | Hardware-accelerated H.264 video encoding | 0 (native) | No bundle needed. Feature-detect at runtime. |
| @ffmpeg/ffmpeg | 0.12+ | `https://github.com/ffmpegwasm/ffmpeg.wasm` | MIT (wrapper), LGPL 2.1 (core) | Audio/video muxing, format conversion | ~22MB WASM core | npm: `@ffmpeg/ffmpeg` + `@ffmpeg/core`. Host WASM files on our server. **CRITICAL: Requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers for multi-thread.** |
| @ffmpeg/core-mt | 0.12+ | Same repo | LGPL 2.1 | Multi-threaded FFmpeg WASM core | ~22MB | For SharedArrayBuffer support. Single-thread fallback via `@ffmpeg/core`. |

### 1.6 Content Extraction & Remix (Browser + Backend)

| Library / API | Location | License | Purpose | Notes |
|---------------|----------|---------|---------|-------|
| PHP DOMDocument | Backend (built-in) | PHP License | HTML parsing for URL text extraction | No composer dependency, ships with PHP 8.4 |
| YouTube Transcript (free endpoint) | Backend (PHP cURL) | N/A | Extract auto-generated/manual subtitles from YouTube videos | Hit `https://www.youtube.com/watch?v={id}` page → parse `ytInitialPlayerResponse` for `captionTracks` → fetch `.srv1` XML → strip tags. Zero API key needed. |
| TikTok oEmbed | Backend (PHP cURL) | N/A | Extract TikTok video metadata + caption text | `https://www.tiktok.com/oembed?url={url}`. Caption only; no transcript unless creator added subtitles. |
| pdf.js (pdfjs-dist) | Browser | Apache 2.0 | Extract text from uploaded PDFs | npm: `pdfjs-dist`. ~1.5MB. Iterate pages → `page.getTextContent()` → concatenate. Already used if PDF uploads exist in Asset Library. |
| Whisper ONNX (Phase 2) | Browser | MIT (Transformers.js) + Apache 2.0 (Whisper model) | Transcribe uploaded audio/podcast files | `https://github.com/huggingface/transformers.js` — load `Xenova/whisper-tiny.en` (~40MB INT8 ONNX). Runs via onnxruntime-web. Cached in IndexedDB. Phase 2 only — MVP can skip audio source. |

**URL text extraction (Readability-style in PHP):**
```php
// backend/lib/url-extract.php
function extractArticleText(string $url): string {
    $html = file_get_contents($url, false, stream_context_create([
        'http' => ['user_agent' => 'Contentine/1.0', 'timeout' => 10]
    ]));
    $dom = new DOMDocument();
    @$dom->loadHTML($html, LIBXML_NOERROR);
    $xpath = new DOMXPath($dom);
    
    // Remove script, style, nav, header, footer, aside
    foreach (['script','style','nav','header','footer','aside','iframe'] as $tag) {
        foreach ($xpath->query("//{$tag}") as $node) $node->parentNode->removeChild($node);
    }
    
    // Extract from <article> or <main> or largest text block
    $article = $xpath->query('//article | //main | //*[@role="main"]');
    $root = $article->length > 0 ? $article->item(0) : $dom->getElementsByTagName('body')->item(0);
    
    return trim(preg_replace('/\s+/', ' ', $root->textContent));
}
```

**YouTube transcript extraction (PHP):**
```php
// backend/lib/youtube-extract.php
function extractYouTubeTranscript(string $videoUrl): string {
    preg_match('/(?:v=|\/)([\w-]{11})/', $videoUrl, $m);
    $videoId = $m[1] ?? throw new Exception('Invalid YouTube URL');
    
    $page = file_get_contents("https://www.youtube.com/watch?v={$videoId}");
    preg_match('/"captionTracks":(\[.*?\])/', $page, $m);
    $tracks = json_decode($m[1], true);
    
    // Prefer English manual captions, fallback to auto-generated
    $trackUrl = null;
    foreach ($tracks as $t) {
        if (str_contains($t['languageCode'] ?? '', 'en')) { $trackUrl = $t['baseUrl']; break; }
    }
    $trackUrl ??= $tracks[0]['baseUrl'] ?? throw new Exception('No captions available');
    
    $xml = file_get_contents($trackUrl);
    return trim(strip_tags(str_replace(['</text>', '&#39;'], ["\n", "'"], $xml)));
}
```

**Content Remix generation flow:**
```
User adds sources (text/URL/YouTube/TikTok/PDF/audio/existing video)
    ↓
Backend extracts text from each source type
    ↓
Frontend sends: { sources: [extracted_texts], targets: ["linkedin","twitter","video_script",...], custom_instructions: "..." }
    ↓
Backend proxies to LLM with platform-specific system prompts
    ↓
LLM returns: { linkedin: "...", twitter: "...", video_script: { scenes: [...] }, ... }
    ↓
Frontend renders in editor — user edits, then:
  → Publish text posts directly via existing publishing pipeline
  → Send video_script to Contentine video generator (UNIQUE ADVANTAGE)
  → Schedule via existing calendar
  → Save as draft
```

**Video encoding pipeline:**
```
1. Canvas renders frame (image + Ken Burns + subtitles) → ImageBitmap
2. WebCodecs VideoEncoder encodes to H.264 at 30fps
3. Kokoro generates audio segments → AudioBuffer
4. FFmpeg.wasm muxes video + audio → MP4
5. Blob URL created → download or upload to server
```

### 1.7 CSV Parsing (Browser-Side)

| Library | Version | Git Repo | License | Purpose | Size |
|---------|---------|----------|---------|---------|------|
| Papa Parse | 5+ | `https://github.com/mholt/PapaParse` | MIT | CSV parsing for bulk scheduler uploads | ~20KB min |

### 1.8 Payments

| Library | Version | Git Repo | License | Purpose |
|---------|---------|----------|---------|---------|
| Stripe.js | latest | `https://github.com/stripe/stripe-js` | MIT | Client-side Stripe Elements for payment UI |
| stripe-php | latest | `https://github.com/stripe/stripe-php` | MIT | Server-side Stripe API for PHP backend |

### 1.9 Stock Media APIs (Free, No Bundle Needed)

| API | Endpoint | Auth | Cost | Purpose |
|-----|----------|------|------|---------|
| Pexels | `api.pexels.com/v1/search` | API key (free) | Free, 200 req/hr | Stock video search |
| Pixabay | `pixabay.com/api/videos/` | API key (free) | Free, 100 req/min | Stock video + image search |

---

## 2. PROJECT STRUCTURE

```
contentine/
├── frontend/                          # Next.js static export
│   ├── next.config.js                 # Static export config
│   ├── package.json
│   ├── public/
│   │   ├── models/                    # face-api.js model weights
│   │   │   ├── tiny_face_detector_model-weights_manifest.json
│   │   │   ├── tiny_face_detector_model-shard1
│   │   │   ├── face_landmark_68_model-weights_manifest.json
│   │   │   ├── face_landmark_68_model-shard1
│   │   │   └── ...
│   │   ├── wasm/                      # FFmpeg WASM files
│   │   │   ├── ffmpeg-core.js
│   │   │   ├── ffmpeg-core.wasm
│   │   │   └── ffmpeg-core.worker.js
│   │   └── avatars/                   # 30+ preset avatar images
│   │       ├── theo.jpg
│   │       ├── sofia.jpg
│   │       └── ...
│   ├── src/
│   │   ├── app/                       # Next.js app router pages
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # Dashboard
│   │   │   ├── discover/page.tsx      # Discover Ideas
│   │   │   ├── create/
│   │   │   │   ├── faceless/page.tsx  # Faceless Video Generator
│   │   │   │   └── avatar/page.tsx    # Avatar Video Generator
│   │   │   ├── editor/page.tsx        # Video Editor
│   │   │   ├── avatar-editor/page.tsx # Avatar Video Editor
│   │   │   ├── scheduler/page.tsx     # Bulk Scheduler
│   │   │   ├── calendar/page.tsx      # Calendar View
│   │   │   ├── analytics/page.tsx     # Analytics Dashboard
│   │   │   ├── writer/page.tsx        # AI Writer
│   │   │   ├── remix/page.tsx         # Content Remix Hub — source input + platform selection
│   │   │   ├── remix/[id]/page.tsx    # Single remix project editor with output tabs
│   │   │   ├── thumbnails/page.tsx    # Thumbnail Generator
│   │   │   ├── converter/page.tsx     # Aspect Ratio Converter
│   │   │   ├── videos/page.tsx        # My Videos & Assets
│   │   │   ├── settings/page.tsx      # Account Settings
│   │   │   └── auth/
│   │   │       ├── login/page.tsx
│   │   │       └── register/page.tsx
│   │   ├── components/
│   │   │   ├── ui/                    # Reusable UI components
│   │   │   ├── dashboard/             # Dashboard widgets
│   │   │   ├── video-generator/       # Video creation forms
│   │   │   ├── editor/                # Canvas-based video editor
│   │   │   ├── avatar/                # Avatar selection & editor
│   │   │   ├── scheduler/             # Calendar & scheduling
│   │   │   ├── analytics/             # Charts & widgets
│   │   │   ├── remix/                 # Content Remix Hub components
│   │   │   │   ├── SourcePanel.tsx    # Add/manage sources (paste, URL, upload, drag-drop)
│   │   │   │   ├── SourceCard.tsx     # Individual source preview + extraction status
│   │   │   │   ├── PlatformSelector.tsx # Checkbox grid of target platforms/formats
│   │   │   │   ├── InstructionsInput.tsx # Custom instructions textarea
│   │   │   │   ├── OutputTabs.tsx     # Tabbed view of generated content per platform
│   │   │   │   ├── OutputEditor.tsx   # Rich text editor for individual outputs
│   │   │   │   ├── VideoScriptPreview.tsx # Scene-by-scene preview + "Send to Video" button
│   │   │   │   └── RemixProjectList.tsx # Saved remix projects list
│   │   │   └── shared/                # Layout, nav, notifications
│   │   ├── lib/
│   │   │   ├── api.ts                 # PHP backend API client
│   │   │   ├── auth.ts                # JWT auth helpers
│   │   │   └── utils.ts               # Common utilities
│   │   ├── workers/
│   │   │   ├── tts.worker.ts          # Kokoro TTS Web Worker
│   │   │   ├── render.worker.ts       # Video rendering Web Worker
│   │   │   └── pool.ts                # Worker pool manager
│   │   ├── engine/
│   │   │   ├── kokoro-tts.ts          # TTS wrapper (init, generate, stream, clone)
│   │   │   ├── video-renderer.ts      # Canvas compositor + WebCodecs encoder
│   │   │   ├── ffmpeg-muxer.ts        # FFmpeg.wasm audio+video muxer
│   │   │   ├── face-animator.ts       # face-api.js pseudo-avatar animator
│   │   │   ├── sadtalker.ts           # Phase 2: ONNX neural avatar
│   │   │   ├── ken-burns.ts           # Pan/zoom animation engine
│   │   │   ├── subtitle-renderer.ts   # Canvas subtitle overlay
│   │   │   ├── device-detect.ts       # Capability detection & routing
│   │   │   └── asset-cache.ts         # IndexedDB model/asset caching
│   │   ├── stores/
│   │   │   ├── auth-store.ts          # Zustand auth state
│   │   │   ├── video-store.ts         # Video generation state
│   │   │   ├── editor-store.ts        # Editor state
│   │   │   ├── schedule-store.ts      # Scheduling state
│   │   │   ├── remix-store.ts         # Remix Hub state (sources, outputs, active project)
│   │   │   └── notification-store.ts  # Notification state
│   │   └── types/
│   │       └── index.ts               # TypeScript type definitions
│   └── out/                           # Static export output → deploy to DreamHost
│
├── backend/                           # PHP 8.4 API
│   ├── public/
│   │   └── index.php                  # Single entry point (router)
│   ├── src/
│   │   ├── Router.php                 # Simple request router
│   │   ├── Auth.php                   # JWT auth + bcrypt
│   │   ├── Database.php               # MySQL 8 PDO wrapper
│   │   ├── Controllers/
│   │   │   ├── AuthController.php
│   │   │   ├── VideoController.php
│   │   │   ├── AvatarController.php
│   │   │   ├── CharacterController.php
│   │   │   ├── VoiceController.php
│   │   │   ├── ScheduleController.php
│   │   │   ├── IdeaController.php     # Proxy searches to Google/YT/etc
│   │   │   ├── AnalyticsController.php
│   │   │   ├── NotificationController.php
│   │   │   ├── PublishController.php   # Social API publish proxy
│   │   │   ├── AssetController.php
│   │   │   ├── TeamController.php
│   │   │   ├── WriterController.php    # LLM proxy for AI Writer
│   │   │   ├── ThumbnailController.php # Image gen proxy
│   │   │   ├── ScriptController.php    # LLM proxy for scripts
│   │   │   ├── ImageController.php     # Image gen proxy
│   │   │   ├── StripeWebhookController.php
│   │   │   ├── InspirationController.php
│   │   │   └── RemixController.php    # Content Remix: extract, generate, CRUD projects
│   │   ├── Services/
│   │   │   ├── LLMService.php          # Claude/GPT API calls
│   │   │   ├── ImageGenService.php     # DALL-E/Gemini API calls
│   │   │   ├── SocialPublisher.php     # YouTube/TikTok/Meta/etc
│   │   │   ├── MailService.php         # Email notifications
│   │   │   ├── ContentExtractor.php   # URL scraping, YouTube transcript, TikTok oEmbed
│   │   │   └── StripeService.php       # Subscription management
│   │   ├── Models/                     # Simple data models
│   │   └── Middleware/
│   │       ├── CorsMiddleware.php
│   │       └── AuthMiddleware.php
│   ├── migrations/
│   │   └── 001_initial_schema.sql      # All 25 tables
│   ├── cron/
│   │   ├── publish.php                 # Every 5 min: publish scheduled posts
│   │   └── analytics.php              # Daily: fetch platform analytics
│   ├── config.php                      # DB credentials, API keys, env
│   └── composer.json                   # stripe/stripe-php, firebase/php-jwt
│
├── database/
│   └── schema.sql                     # Complete MySQL 8 schema (22 tables)
│
└── docs/
    ├── CONTENTINE_ENGINEERING_SPEC.md  # This file
    └── API.md                         # API endpoint documentation
```

---

## 3. DATABASE SCHEMA (MySQL 8 — 25 Tables)

```sql
-- =============================================
-- Contentine Database Schema
-- MySQL 8.0+ | InnoDB | UTF-8mb4
-- =============================================

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    plan_tier ENUM('free','starter','professional','business','enterprise') DEFAULT 'free',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'UTC',
    team_id INT UNSIGNED NULL,
    role ENUM('owner','editor','viewer') DEFAULT 'owner',
    storage_used_bytes BIGINT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teams (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT UNSIGNED NOT NULL,
    plan_tier ENUM('business','enterprise') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    team_id INT UNSIGNED NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE videos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    project_id INT UNSIGNED NULL,
    title VARCHAR(300) NOT NULL,
    type ENUM('faceless','avatar') NOT NULL,
    style_mode VARCHAR(50),  -- ai_visuals, video_vault, stock, broll, url, product_url, audio, text_to_scene
    script_json JSON,
    art_style VARCHAR(50),
    voice_profile_id INT UNSIGNED NULL,
    character_anchor_id INT UNSIGNED NULL,
    aspect_ratio ENUM('9:16','16:9','1:1') DEFAULT '9:16',
    duration_seconds INT UNSIGNED DEFAULT 0,
    status ENUM('draft','rendering','completed','published','failed') DEFAULT 'draft',
    mp4_path VARCHAR(500),
    thumbnail_path VARCHAR(500),
    folder_path VARCHAR(200) DEFAULT '/',
    render_started_at TIMESTAMP NULL,
    render_completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_status (user_id, status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE character_anchors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,  -- NULL for system presets
    name VARCHAR(100) NOT NULL,
    photo_path VARCHAR(500),
    description_text TEXT,       -- Gemini Vision extracted description
    seed_value INT UNSIGNED,
    art_style VARCHAR(50),
    is_preset BOOLEAN DEFAULT FALSE,
    gender VARCHAR(20),
    age_range VARCHAR(20),
    ethnicity VARCHAR(50),
    style VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_preset (is_preset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voice_profiles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,  -- NULL for system presets
    name VARCHAR(100) NOT NULL,
    kokoro_voice_id VARCHAR(50),  -- e.g. "af_sky", "am_adam"
    embedding_blob MEDIUMBLOB,    -- Serialized voice embedding for clones
    source ENUM('preset','cloned') DEFAULT 'preset',
    language VARCHAR(10) DEFAULT 'en',
    gender VARCHAR(20),
    tone VARCHAR(50),
    speed DECIMAL(3,2) DEFAULT 1.00,
    pitch DECIMAL(5,2) DEFAULT 0.00,
    style VARCHAR(50) DEFAULT 'conversational',
    is_preset BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_preset (is_preset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE avatar_presets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    gender VARCHAR(20),
    age_range VARCHAR(20),
    ethnicity VARCHAR(50),
    style VARCHAR(50),
    photo_path VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE real_clone_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    consent_video_path VARCHAR(500),
    source_video_path VARCHAR(500),
    status ENUM('pending','approved','building','complete','rejected') DEFAULT 'pending',
    avatar_id INT UNSIGNED NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE scheduled_posts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id INT UNSIGNED NOT NULL,
    platform ENUM('youtube','tiktok','instagram','facebook','linkedin','threads','twitter') NOT NULL,
    scheduled_at DATETIME NOT NULL,
    status ENUM('pending','publishing','published','failed') DEFAULT 'pending',
    published_url VARCHAR(500),
    cta_template_id INT UNSIGNED NULL,
    title VARCHAR(300),
    description TEXT,
    tags JSON,
    hashtags JSON,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    INDEX idx_scheduled (scheduled_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cta_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    cta_text TEXT NOT NULL,
    links JSON,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE social_accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    platform ENUM('youtube','tiktok','instagram','facebook','linkedin','threads','twitter') NOT NULL,
    account_name VARCHAR(200),
    oauth_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_platform (user_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE idea_searches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    query VARCHAR(300) NOT NULL,
    platform VARCHAR(30) NOT NULL,
    results_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE favourite_topics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    topic_text VARCHAR(300) NOT NULL,
    source_platform VARCHAR(30),
    search_volume INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_topic (user_id, topic_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE analytics_snapshots (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id INT UNSIGNED NOT NULL,
    platform VARCHAR(30) NOT NULL,
    views INT UNSIGNED DEFAULT 0,
    likes INT UNSIGNED DEFAULT 0,
    comments INT UNSIGNED DEFAULT 0,
    shares INT UNSIGNED DEFAULT 0,
    ctr DECIMAL(5,4) DEFAULT 0,
    demographics_json JSON,
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY uk_video_platform_date (video_id, platform, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE analytics_alerts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    metric VARCHAR(50) NOT NULL,
    threshold INT UNSIGNED NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE asset_library (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('image','video','audio') NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    source ENUM('generated','uploaded','stock') NOT NULL,
    tags JSON,
    original_video_id INT UNSIGNED NULL,
    file_size_bytes INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_type (user_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bulk_jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('topic','csv','manual') NOT NULL,
    config_json JSON,
    total_count INT UNSIGNED DEFAULT 0,
    completed_count INT UNSIGNED DEFAULT 0,
    status ENUM('queued','processing','completed','failed') DEFAULT 'queued',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE thumbnails (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    video_id INT UNSIGNED NULL,
    prompt TEXT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('render_complete','post_published','team_activity','system','alert') NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    related_type VARCHAR(50),
    related_id INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_unread (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE video_comments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    comment_text TEXT NOT NULL,
    parent_id INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES video_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ai_writer_docs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('blog','caption','email','description','ad','summary') NOT NULL,
    title VARCHAR(300),
    content LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- Content Remix Tables (3 new tables → 25 total)
-- =============================================

CREATE TABLE remix_projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(200),
    custom_instructions TEXT,          -- User's per-project instructions (e.g. "Extract top 3 takeaways")
    target_platforms JSON,             -- ["linkedin","twitter","video_script","blog","newsletter"]
    status ENUM('draft','generated','published') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE remix_sources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    remix_project_id INT UNSIGNED NOT NULL,
    source_type ENUM('text','url','youtube','tiktok','pdf','audio','video') NOT NULL,
    source_url VARCHAR(2000),          -- Original URL (for url/youtube/tiktok types)
    source_title VARCHAR(500),         -- Extracted or user-provided title
    extracted_text LONGTEXT,           -- The extracted plain text content
    custom_instruction TEXT,           -- Per-source custom instruction (optional)
    file_path VARCHAR(500),            -- For uploaded files (pdf, audio)
    video_id INT UNSIGNED NULL,        -- Reference to existing Contentine video (for type='video')
    sort_order TINYINT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (remix_project_id) REFERENCES remix_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
    INDEX idx_project (remix_project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE remix_outputs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    remix_project_id INT UNSIGNED NOT NULL,
    target_platform VARCHAR(30) NOT NULL,   -- 'linkedin','twitter','instagram','facebook','tiktok','threads','blog','video_script','newsletter'
    generated_text LONGTEXT,                -- The generated post/article/script text
    generated_json JSON,                    -- For video_script: full scene-by-scene JSON ready for video pipeline
    is_edited BOOLEAN DEFAULT FALSE,        -- User has manually edited
    status ENUM('generated','scheduled','published') DEFAULT 'generated',
    scheduled_post_id INT UNSIGNED NULL,    -- Link to scheduled_posts if scheduled
    video_id INT UNSIGNED NULL,             -- Link to videos table if sent to video pipeline
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (remix_project_id) REFERENCES remix_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (scheduled_post_id) REFERENCES scheduled_posts(id) ON DELETE SET NULL,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
    INDEX idx_project_platform (remix_project_id, target_platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activity_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    team_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_team_date (team_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. PHP BACKEND API (39 Endpoints)

The PHP backend is a simple REST API router. **No frameworks** — pure PHP 8.4 with PDO for MySQL.

**Composer dependencies (only 2):**
```json
{
  "require": {
    "stripe/stripe-php": "^14.0",
    "firebase/php-jwt": "^6.0"
  }
}
```

### Endpoint Map

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/register` | POST | No | Create user + Stripe customer |
| `/api/auth/login` | POST | No | Return JWT + refresh token |
| `/api/auth/refresh` | POST | Refresh | Rotate JWT |
| `/api/auth/oauth/{platform}` | GET | JWT | Redirect to OAuth provider |
| `/api/auth/oauth/{platform}/callback` | GET | No | Store OAuth tokens |
| `/api/videos` | GET/POST | JWT | List (with filters) / Create video record |
| `/api/videos/{id}` | GET/PUT/DELETE | JWT | Single video CRUD |
| `/api/videos/{id}/upload` | POST | JWT | Receive rendered MP4 blob from browser |
| `/api/videos/{id}/comments` | GET/POST | JWT | Team comment threads |
| `/api/avatars/presets` | GET | JWT | Return 30+ preset avatars |
| `/api/avatars/real-clone` | POST | JWT | Submit Real Clone Studio request |
| `/api/characters` | GET/POST/PUT/DELETE | JWT | Character anchor CRUD |
| `/api/voices` | GET/POST/DELETE | JWT | Voice profile CRUD (presets + clones) |
| `/api/schedule` | GET/POST/PUT/DELETE | JWT | Scheduled posts CRUD |
| `/api/cta-templates` | GET/POST/PUT/DELETE | JWT | Reusable CTA templates |
| `/api/ideas/search` | POST | JWT | Proxy to Google/YT/IG/Twitter/Pinterest/Bing/TikTok |
| `/api/ideas/favourites` | GET/POST/DELETE | JWT | Favourite topics CRUD |
| `/api/analytics` | GET | JWT | Aggregated analytics data |
| `/api/analytics/alerts` | GET/POST/PUT/DELETE | JWT | Alert threshold CRUD |
| `/api/analytics/export` | GET | JWT | Generate PDF/CSV report |
| `/api/notifications` | GET/PUT | JWT | List / mark-read notifications |
| `/api/notifications/poll` | GET | JWT | Long-poll for new notifications |
| `/api/publish/{platform}` | POST | Cron | Platform-specific upload (YouTube/TikTok/Meta/etc) |
| `/api/thumbnails/generate` | POST | JWT | Proxy to image gen API |
| `/api/scripts/generate` | POST | JWT | Proxy to LLM API |
| `/api/images/generate` | POST | JWT | Proxy to image gen API |
| `/api/writer/generate` | POST | JWT | Proxy to LLM API for AI Writer |
| `/api/teams` | GET/POST/PUT | JWT | Team management |
| `/api/teams/invite` | POST | JWT | Send invite email |
| `/api/teams/activity` | GET | JWT | Activity log |
| `/api/assets` | GET/POST/DELETE | JWT | Asset library CRUD |
| `/api/remix/extract` | POST | JWT | Extract text from source (URL, YouTube, TikTok). Body: `{type, url}` → returns `{title, text}` |
| `/api/remix/generate` | POST | JWT | Generate remixed content. Body: `{sources[], targets[], custom_instructions}` → proxies to LLM with platform-specific system prompts → returns `{platform: content}` map |
| `/api/remix/projects` | GET/POST | JWT | List / create remix projects (saves sources + outputs) |
| `/api/remix/projects/{id}` | GET/PUT/DELETE | JWT | Single remix project CRUD |
| `/api/remix/projects/{id}/to-video` | POST | JWT | Convert a video_script output into a real video record in `videos` table, ready for the browser rendering pipeline |
| `/api/remix/projects/{id}/publish` | POST | JWT | Publish text outputs to selected platforms via existing publishing pipeline |
| `/api/stripe/webhook` | POST | Stripe sig | Handle subscription events |
| `/api/inspiration` | GET | JWT | Inspiration gallery feed |

### Cron Jobs (DreamHost cPanel)

```
# Every 5 minutes: publish scheduled posts
*/5 * * * * /usr/local/php84/bin/php /home/user/contentine/backend/cron/publish.php

# Daily at 3am: fetch analytics from social platforms
0 3 * * * /usr/local/php84/bin/php /home/user/contentine/backend/cron/analytics.php
```

---

## 5. BROWSER ENGINE ARCHITECTURE

### 5.1 Device Capability Detection

```typescript
// engine/device-detect.ts
interface DeviceCapabilities {
  tier: 'high' | 'standard' | 'mobile' | 'low';
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

function detectCapabilities(): DeviceCapabilities {
  const ram = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const hasWebGPU = 'gpu' in navigator;
  const hasWebCodecs = 'VideoEncoder' in window;
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  if (hasWebGPU && ram >= 8 && cores >= 8 && !isMobile) {
    return { tier: 'high', hasWebGPU: true, hasWebCodecs, hasSharedArrayBuffer,
             ramGB: ram, cores, maxWorkers: 4, maxResolution: '4k',
             ttsDevice: 'webgpu', ttsQuantization: 'fp32' };
  }
  if (ram >= 4 && cores >= 4 && !isMobile) {
    return { tier: 'standard', hasWebGPU: false, hasWebCodecs, hasSharedArrayBuffer,
             ramGB: ram, cores, maxWorkers: 2, maxResolution: '1080p',
             ttsDevice: 'wasm', ttsQuantization: 'q8' };
  }
  if (ram >= 4 && isMobile) {
    return { tier: 'mobile', hasWebGPU: false, hasWebCodecs, hasSharedArrayBuffer,
             ramGB: ram, cores, maxWorkers: 1, maxResolution: '720p',
             ttsDevice: 'wasm', ttsQuantization: 'q8' };
  }
  return { tier: 'low', hasWebGPU: false, hasWebCodecs, hasSharedArrayBuffer,
           ramGB: ram, cores, maxWorkers: 1, maxResolution: '720p',
           ttsDevice: 'wasm', ttsQuantization: 'q4' };
}
```

### 5.2 Web Worker Pool

```typescript
// workers/pool.ts
class WorkerPool {
  private workers: Worker[] = [];
  private queue: RenderJob[] = [];
  private maxWorkers: number;

  constructor(capabilities: DeviceCapabilities) {
    this.maxWorkers = capabilities.maxWorkers;
  }

  async enqueue(job: RenderJob): Promise<Blob> {
    // Add to queue, process when worker available
    // Each worker runs: TTS → image fetch → Ken Burns → WebCodecs encode → return encoded segments
    // Main thread: FFmpeg.wasm muxes all segments into final MP4
  }
}
```

### 5.3 Video Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Client-Side)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [Script JSON] ──→ For each scene segment:                    │
│                                                               │
│  1. TTS Worker: kokoro-js generates audio segment             │
│     └─→ AudioBuffer + word-level timestamps                  │
│                                                               │
│  2. Image: Fetch from backend proxy (DALL-E/Gemini)          │
│     └─→ ImageBitmap                                          │
│                                                               │
│  3. Ken Burns Engine: Canvas animated pan+zoom                │
│     └─→ Stream of ImageBitmap frames at 30fps                │
│                                                               │
│  4. Subtitle Renderer: Canvas 2D text overlay                 │
│     └─→ Word-by-word highlight synced to TTS timestamps      │
│                                                               │
│  5. Compositor: Merge image + motion + subtitles              │
│     └─→ Final ImageBitmap per frame                          │
│                                                               │
│  6. WebCodecs VideoEncoder: H.264 encode each frame           │
│     └─→ EncodedVideoChunk stream                             │
│                                                               │
│  7. Crossfade: 15-frame transition between segments           │
│                                                               │
│  8. FFmpeg.wasm: Mux video chunks + audio → MP4               │
│     └─→ Final Blob                                           │
│                                                               │
│  9. Upload Blob to backend /api/videos/{id}/upload            │
│                                                               │
│  10. Backend sends notification (in-app + email)              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Content Remix Engine

The Remix Hub is a content repurposing system that ingests any content source and generates platform-specific outputs — including video scripts that feed directly into the video pipeline above. This is the **key differentiator vs Blotato**: where Blotato can only generate text posts from sources, Contentine can generate text posts AND full videos from the same sources.

**Source extraction pipeline:**
```
┌─────────────────────────────────────────────────────────────┐
│                    SOURCE EXTRACTION                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [Text paste]  ──→ Direct (no extraction needed)              │
│                                                               │
│  [URL/Article] ──→ POST /api/remix/extract {type:"url"}      │
│                    PHP DOMDocument strips nav/ads/scripts      │
│                    Returns: {title, text, word_count}          │
│                                                               │
│  [YouTube URL] ──→ POST /api/remix/extract {type:"youtube"}  │
│                    PHP extracts captionTracks from page HTML   │
│                    Fetches .srv1 XML transcript                │
│                    Returns: {title, text, duration_seconds}    │
│                                                               │
│  [TikTok URL]  ──→ POST /api/remix/extract {type:"tiktok"}   │
│                    PHP oEmbed + page scrape for caption        │
│                    Returns: {title, text}                      │
│                                                               │
│  [PDF upload]  ──→ Browser-side: pdfjs-dist extracts text     │
│                    No backend call needed                      │
│                    Returns: {title: filename, text}            │
│                                                               │
│  [Audio file]  ──→ Browser-side: Whisper ONNX transcription   │
│                    (Phase 2 — MVP skips audio source)          │
│                    Returns: {text, duration_seconds}           │
│                                                               │
│  [Existing     ──→ Fetch script_json from videos table        │
│   Contentine       Flatten scene narrations into text          │
│   video]           Returns: {title, text, video_id}           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Output generation pipeline:**
```
┌─────────────────────────────────────────────────────────────┐
│                    REMIX GENERATION                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  User selects targets: [✓ LinkedIn] [✓ Twitter] [✓ Blog]      │
│                        [✓ Video Script] [✓ Newsletter]        │
│                                                               │
│  POST /api/remix/generate                                     │
│  {                                                            │
│    sources: [ {text: "...", instruction: "..."} ],            │
│    targets: ["linkedin","twitter","blog","video_script",      │
│              "newsletter"],                                    │
│    custom_instructions: "Focus on AI automation tips",        │
│    brand_voice: "professional, conversational"                │
│  }                                                            │
│                                                               │
│  Backend sends to LLM with platform-specific system prompts:  │
│                                                               │
│  ┌─ twitter: max 280 chars, hook-first, 3 hashtags           │
│  ├─ linkedin: professional tone, 1500-3000 chars, CTA        │
│  ├─ instagram: emoji-rich, 30 hashtags, CTA in bio           │
│  ├─ facebook: conversational, shareable, question-ending      │
│  ├─ tiktok: punchy, under 150 chars, trending hashtags       │
│  ├─ threads: thread-style, 3-7 posts chained                 │
│  ├─ blog: 1000-2000 words, H2 headings, SEO-friendly        │
│  ├─ newsletter: subject line + body, personal tone            │
│  └─ video_script: ⭐ SPECIAL — generates scene-by-scene JSON │
│        { scenes: [                                             │
│            { narration: "...", visual_prompt: "...",           │
│              duration: 5 }                                     │
│        ]}                                                      │
│        → This JSON is DIRECTLY compatible with the video       │
│          rendering pipeline (Section 5.3)                      │
│                                                               │
│  Returns: { platform: generated_content } map                 │
│                                                               │
│  Frontend renders all outputs in tabbed editor                │
│  User edits → then:                                           │
│    [Publish Now] → existing publishing pipeline                │
│    [Schedule]    → existing calendar/scheduler                 │
│    [→ Video]     → sends video_script to video pipeline ⭐    │
│    [Save Draft]  → saves to remix_projects                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**LLM system prompt template for video_script target:**
```
You are a video script generator for short-form social media videos.
Given the source material below, create a compelling video script.

Output ONLY valid JSON in this exact format:
{
  "title": "Video title",
  "scenes": [
    {
      "narration": "What the voiceover says for this scene",
      "visual_prompt": "Detailed image generation prompt for this scene's visual",
      "duration": 5
    }
  ],
  "total_duration": 30,
  "aspect_ratio": "9:16",
  "style": "cinematic"
}

Rules:
- 3-8 scenes, 15-60 seconds total
- Start with a hook that creates curiosity
- Each visual_prompt should be specific, cinematic, and visually distinct
- End with a clear CTA
- {custom_instructions}

SOURCE MATERIAL:
{concatenated_source_texts}
```

**Frontend Remix Hub UI components:**
```
/app/remix/page.tsx              — Main Remix Hub page
/app/remix/[id]/page.tsx         — Single remix project editor
/components/remix/
  SourcePanel.tsx                — Add/manage sources (drag-drop, URL input, file upload)
  SourceCard.tsx                 — Individual source preview with extraction status
  PlatformSelector.tsx           — Checkbox grid of target platforms
  InstructionsInput.tsx          — Custom instructions textarea
  OutputTabs.tsx                 — Tabbed view of generated content per platform
  OutputEditor.tsx               — Rich text editor for each output
  VideoScriptPreview.tsx         — Special preview for video_script outputs with "Send to Video Pipeline" button
  RemixProjectList.tsx           — List of saved remix projects
```

---

## 6. CRITICAL DreamHost DEPLOYMENT NOTES

### 6.1 Static Frontend

```bash
# Build static export
cd frontend
npm run build  # next build && next export

# Upload /out directory to DreamHost via SFTP
# Serve from: yourdomain.com/
```

### 6.2 PHP Backend

```bash
# Upload /backend to DreamHost
# Configure .htaccess for clean URLs:
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^api/(.*)$ index.php [QSA,L]
```

### 6.3 Required Headers for FFmpeg.wasm Multi-Threading

Add to `.htaccess`:
```
<IfModule mod_headers.c>
  Header set Cross-Origin-Embedder-Policy "require-corp"
  Header set Cross-Origin-Opener-Policy "same-origin"
  Header set Cross-Origin-Resource-Policy "cross-origin"
</IfModule>
```

**If DreamHost shared hosting doesn't support these headers**, fall back to single-threaded `@ffmpeg/core` (slower but works everywhere).

### 6.4 MySQL Setup

```bash
# Create database via DreamHost panel
# Import schema:
mysql -u contentine_user -p contentine_db < database/schema.sql
```

---

## 7. BUILD ORDER (Claude Code Implementation Sequence)

### Phase 1: Foundation (Week 1-2)
1. Scaffold Next.js project with TypeScript + Tailwind + Zustand
2. PHP backend router + auth (JWT + bcrypt) + MySQL schema
3. Stripe integration (subscription management)
4. Basic UI shell: layout, sidebar nav, auth pages, dashboard skeleton

### Phase 2: Core Engine (Week 3-4)
5. `kokoro-tts.ts` — Initialize model, generate speech, list voices, streaming
6. `tts.worker.ts` — Web Worker wrapper for TTS (off main thread)
7. Device capability detection + routing
8. IndexedDB model caching layer

### Phase 3: Video Generation (Week 5-6)
9. `ken-burns.ts` — Canvas pan/zoom animation engine
10. `subtitle-renderer.ts` — Canvas text overlay with word highlighting
11. `video-renderer.ts` — Canvas compositor (image + motion + subtitles → frames)
12. WebCodecs H.264 encoding
13. `ffmpeg-muxer.ts` — Audio + video muxing to MP4
14. Full faceless video pipeline: script → TTS → images → render → MP4

### Phase 4: Avatar System (Week 7-8)
15. `face-animator.ts` — face-api.js landmark detection + CSS3D animation
16. Avatar Video as distinct creation mode
17. 30+ preset avatar images + metadata
18. Avatar Video Editor (separate from faceless editor)

### Phase 5: Content Features (Week 9-10)
19. Discover Ideas (8 platform proxies in PHP backend)
20. AI Script Generation (LLM proxy)
21. AI Writer tool
22. Character Consistency system (Gemini Vision + prompt anchoring)

### Phase 5.5: Content Remix Hub (Week 10-11)
22a. PHP source extraction endpoints (URL scraper, YouTube transcript, TikTok oEmbed)
22b. Remix Hub frontend UI (SourcePanel, PlatformSelector, InstructionsInput)
22c. LLM remix generation endpoint with platform-specific system prompts
22d. Output editor with tabbed platform view
22e. "Send to Video Pipeline" bridge — converts video_script output into video record
22f. Remix project save/load (remix_projects, remix_sources, remix_outputs tables)
22g. Publish text outputs via existing publishing pipeline
22h. PDF source extraction (pdfjs-dist in browser)

### Phase 6: Publishing & Scheduling (Week 11-12)
23. Social OAuth flow (7 platforms)
24. Calendar UI + scheduling
25. Bulk Scheduler + CSV upload (Papa Parse)
26. Worker pool for concurrent rendering
27. Publishing cron job

### Phase 7: Polish (Week 13-14)
28. Thumbnail generator
29. Aspect Ratio Converter
30. Analytics dashboard (widgets, alerts, export)
31. Team collaboration (invites, roles, comments, activity log)
32. Notification system (polling + email)
33. My Videos management UI
34. Inspiration Gallery

### Phase 8: Advanced (Month 5-6)
35. SadTalker ONNX port for neural avatar (Phase 2)
36. Voice cloning refinement
37. Real Clone Studio service
38. Enterprise features
39. Whisper ONNX browser transcription for Remix Hub audio/podcast sources
40. Carousel/infographic generation from Remix outputs (Canvas → multi-image export)

---

## 8. QUICK REFERENCE — EXTERNAL API CALLS (ONLY THESE HIT THE NETWORK)

| Purpose | API | Called From | Cost |
|---------|-----|-------------|------|
| Script generation | Claude API / OpenAI GPT-4 | PHP backend proxy | Per-token |
| Image generation | DALL-E 3 / Gemini Imagen | PHP backend proxy | Per-image |
| Character description | Gemini Vision | PHP backend proxy | Per-call |
| Stock video search | Pexels API | PHP backend proxy | Free |
| Stock image search | Pixabay API | PHP backend proxy | Free |
| YouTube publish | YouTube Data API v3 | PHP cron | Free (quota) |
| TikTok publish | Content Posting API | PHP cron | Free |
| Instagram publish | Graph API | PHP cron | Free |
| Facebook publish | Graph API | PHP cron | Free |
| LinkedIn publish | Marketing API | PHP cron | Free |
| Threads publish | Threads Publishing API | PHP cron | Free |
| Twitter/X publish | Twitter API v2 | PHP cron | Free (basic) |
| Payments | Stripe API | PHP backend | Per-transaction |
| Email | PHP mail() or SendGrid | PHP backend | Free / per-email |
| Idea discovery | Google Suggest / YT / Bing etc | PHP backend proxy | Free |
| Content Remix: URL scraping | Target website (DOMDocument) | PHP backend | Free |
| Content Remix: YouTube transcript | YouTube page + caption XML | PHP backend | Free |
| Content Remix: TikTok metadata | TikTok oEmbed API | PHP backend | Free |
| Content Remix: LLM generation | Claude API / OpenAI GPT-4 | PHP backend proxy | Per-token (same LLM as scripts) |

**Everything else runs in the browser. No other network calls.**

---

## 9. LICENSE COMPLIANCE CHECKLIST

| Library | License | Commercial OK | Notes |
|---------|---------|---------------|-------|
| Next.js | MIT | ✅ | |
| React | MIT | ✅ | |
| Zustand | MIT | ✅ | |
| Tailwind CSS | MIT | ✅ | |
| kokoro-js | Apache 2.0 | ✅ | Include NOTICE file |
| Kokoro-82M weights | Apache 2.0 | ✅ | Include NOTICE file |
| face-api.js | MIT | ✅ | |
| SadTalker | Apache 2.0 | ✅ | Include NOTICE file. Was non-commercial, updated to Apache 2.0 |
| onnxruntime-web | MIT | ✅ | |
| @ffmpeg/ffmpeg (wrapper) | MIT | ✅ | |
| @ffmpeg/core (WASM) | LGPL 2.1 | ✅ with care | Loaded dynamically (not statically linked). Compliant. |
| Papa Parse | MIT | ✅ | |
| stripe-js | MIT | ✅ | |
| stripe-php | MIT | ✅ | |
| firebase/php-jwt | BSD 3-Clause | ✅ | |
| pdfjs-dist | Apache 2.0 | ✅ | PDF text extraction in browser for Remix Hub |
| **LAM / LivePortrait** | **Research Only** | **❌ DO NOT USE** | Non-commercial license |
