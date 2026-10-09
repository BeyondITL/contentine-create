# Contentine Create — Implementation Supplement v1.0

> **Companion to:** Engineering Spec v2.1 + PRD v2.1  
> **Date:** February 28, 2026  
> **Purpose:** Closes every remaining gap between spec and buildable code. Hand this + the Engineering Spec to Claude Code and build.

---

## S1. DESIGN SYSTEM

### S1.1 Brand Colors

The Contentine Create logo uses a 3D animated gradient mark cycling through all three brand colors (`#00C3FF` → `#35C838` → `#F3A6FF`). The original shape comes from the Contentine Analyze logo, now with depth (bevel, specular lighting, shadow layer) and motion (float, gradient cycle, pupil pulse, ring expansion).

**Logo files:**
- `contentine_create_logo.html` — Full animated version (website hero, app splash, marketing)
- `contentine_logo.svg` — Static gradient fallback (favicon, social, email signatures)

**Wordmark:** "Contentine" in Inter 800 weight with animated gradient + "CREATE" in spaced uppercase below.

**Logo usage rules:**
- Always use the animated version where HTML/CSS is supported (web, app)
- Use static SVG for contexts that don't support animation (print, email, favicon)
- Minimum clear space: 1× the eye pupil diameter on all sides
- Never use a single flat color — always gradient

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#00C3FF` | Logo, CTAs, active states, links |
| `--primary-hover` | `#00A8DB` | Button hover, link hover |
| `--primary-light` | `#66DAFF` | Tags, badges, secondary buttons |
| `--primary-bg` | `#E5F8FF` | Card backgrounds, selected states |
| `--secondary` | `#35C838` | Success states, publish indicators, green screen homage |
| `--secondary-hover` | `#2BAF2E` | Secondary button hover |
| `--accent` | `#F3A6FF` | AI features, remix hub, creative highlights |
| `--accent-bg` | `#FDF0FF` | AI/creative feature backgrounds |
| `--dark` | `#171717` | Primary text, headings |
| `--dark-secondary` | `#2D333B` | Sidebar background, cards (dark mode) |
| `--text` | `#171717` | Body text |
| `--text-secondary` | `#636E7B` | Captions, timestamps, labels |
| `--text-muted` | `#8B949E` | Placeholder text, disabled |
| `--border` | `#D0D7DE` | Input borders, dividers |
| `--border-light` | `#E8EAED` | Subtle dividers, table lines |
| `--bg` | `#FFFFFF` | Main background |
| `--bg-surface` | `#F6F8FA` | Sidebar, panels, input fields |
| `--bg-elevated` | `#FFFFFF` | Modal, dropdown, popover |
| `--danger` | `#E74C3C` | Delete, error, destructive actions |
| `--warning` | `#F39C12` | Alerts, rendering in progress |
| `--info` | `#3498DB` | Informational badges |

**Dark Mode:** Swap `--bg` ↔ `#171717`, `--bg-surface` ↔ `#1E1E1E`, `--text` ↔ `#E0E0E0`, `--border` ↔ `#333333`. Primary/secondary/accent stay the same.

### S1.2 Typography

```css
/* Tailwind config */
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

| Element | Font | Size (rem) | Weight | Line-height | Tailwind |
|---------|------|-----------|--------|-------------|----------|
| H1 (page title) | Inter | 1.875 (30px) | 700 | 1.2 | `text-3xl font-bold` |
| H2 (section) | Inter | 1.5 (24px) | 600 | 1.3 | `text-2xl font-semibold` |
| H3 (subsection) | Inter | 1.25 (20px) | 600 | 1.4 | `text-xl font-semibold` |
| Body | Inter | 0.875 (14px) | 400 | 1.5 | `text-sm` |
| Body large | Inter | 1.0 (16px) | 400 | 1.5 | `text-base` |
| Caption | Inter | 0.75 (12px) | 400 | 1.4 | `text-xs` |
| Button | Inter | 0.875 (14px) | 500 | 1.0 | `text-sm font-medium` |
| Code | JetBrains Mono | 0.8125 (13px) | 400 | 1.5 | `font-mono text-[13px]` |

### S1.3 Spacing & Layout

```
Base unit: 4px (Tailwind default)
Spacing scale: 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px, 10=40px, 12=48px, 16=64px

Layout:
├── Sidebar: 240px (collapsed: 64px)
├── Main content: flex-1, max-width 1280px, centered
├── Page padding: 24px (desktop), 16px (mobile)
├── Card padding: 16px (compact), 24px (standard)
├── Section gap: 32px
└── Component gap: 16px
```

### S1.4 Component Library (Tailwind + shadcn/ui conventions)

All components built with Tailwind utility classes. No external UI library — keep bundle small. Use headless patterns from Radix UI where needed (accessible modals, dropdowns, tooltips).

**Button variants:**

```tsx
// Primary
<button className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
  Create Video
</button>

// Secondary
<button className="bg-primary-bg hover:bg-primary-light/30 text-primary px-4 py-2 rounded-lg text-sm font-medium border border-primary/20 transition-colors">
  Save Draft
</button>

// Ghost
<button className="hover:bg-bg-surface text-text-secondary px-3 py-2 rounded-lg text-sm transition-colors">
  Cancel
</button>

// Danger
<button className="bg-danger hover:bg-danger/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
  Delete
</button>
```

**Card:**
```tsx
<div className="bg-white dark:bg-dark-secondary rounded-xl border border-border dark:border-border-dark p-6 shadow-sm">
  {/* content */}
</div>
```

**Input:**
```tsx
<input className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
```

**Badge:**
```tsx
// Status badges
<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Published</span>
<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Rendering</span>
<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Draft</span>
```

### S1.5 Icon System

Use `lucide-react` (MIT, tree-shakeable, 1000+ icons). Already popular in Next.js ecosystem.

```bash
npm install lucide-react
```

```tsx
import { Video, Mic, Wand2, LayoutDashboard, Calendar, BarChart3, Users, Shuffle } from 'lucide-react';
// Icon size: 20px in nav, 16px inline, 24px in empty states
```

### S1.6 Page Layouts

**Dashboard layout (all authenticated pages):**
```
┌──────────────────────────────────────────────────────┐
│ [Logo]  Search...                  🔔 [Avatar] ▼    │  ← Top bar (h-14, fixed)
├────────┬─────────────────────────────────────────────┤
│ 📊 Dash│                                             │
│ 🎬 Vids│        Main Content Area                    │
│ 🤖 Avat│        (scrollable)                         │
│ 🎙 Voice│        max-w-screen-xl mx-auto             │
│ 💡 Ideas│                                             │
│ 📅 Sched│                                             │
│ 🔀 Remix│                                             │  ← NEW
│ ✍️ Write│                                             │
│ 📊 Analy│                                             │
│ 👥 Team │                                             │
│ ⚙️ Sett │                                             │
├────────┴─────────────────────────────────────────────┤
│                    Footer (minimal)                   │
└──────────────────────────────────────────────────────┘
  Sidebar     Main content
  w-60        flex-1
```

**Video Editor layout:**
```
┌──────────────────────────────────────────────────────┐
│ ← Back to Videos   "Untitled Video"   [Save] [Export]│
├──────────┬───────────────────────┬───────────────────┤
│ Scenes   │                       │ Properties        │
│ Panel    │   Preview Canvas      │ Panel             │
│ (w-64)   │   (flex-1)            │ (w-80)            │
│          │                       │                   │
│ [Scene 1]│   ┌─────────────┐     │ ☐ Voice: Alex    │
│ [Scene 2]│   │   Preview   │     │ ☐ Style: Anime   │
│ [Scene 3]│   │   Player    │     │ ☐ Duration: 5s   │
│ [+ Add]  │   └─────────────┘     │ ☐ Subtitle: On   │
│          │   [◀ ▶ ⏸]  0:15/1:00 │ ☐ Transition: Fa │
├──────────┴───────────────────────┴───────────────────┤
│ Timeline (h-32): [Scene1][Scene2][Scene3]...         │
└──────────────────────────────────────────────────────┘
```

**Remix Hub layout:**
```
┌──────────────────────────────────────────────────────┐
│ Content Remix Hub               [New Project] [Hist] │
├──────────────────────────────────────────────────────┤
│ STEP 1: Add Sources                                  │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [📎 URL] [📺 YouTube] [📄 PDF] [✏️ Text] [🎵 Audio]│ │
│ │                                                    │ │
│ │ Enter URL or paste text...                         │ │
│ │ [+ Add Another Source]                             │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ STEP 2: Select Targets                               │
│ [✓ Twitter] [✓ LinkedIn] [ ] Instagram [ ] Facebook  │
│ [ ] TikTok [ ] Threads [✓ Blog] [ ] Newsletter       │
│ [✓ Video Script ⭐]                                   │
│                                                      │
│ STEP 3: Customize                                    │
│ Brand voice: [Professional ▼]  Template: [None ▼]    │
│ Instructions: [Focus on key takeaways...]            │
│                                                      │
│ [🔀 Generate Remix]                                   │
├──────────────────────────────────────────────────────┤
│ OUTPUTS (tabbed):                                    │
│ [Twitter] [LinkedIn] [Blog] [Video Script ⭐]        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Generated content with inline editing...          │ │
│ │                                                    │ │
│ │ [Publish Now] [Schedule] [→ Video Pipeline] [Save]│ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### S1.7 Responsive Breakpoints

| Breakpoint | Width | Behavior |
|-----------|-------|----------|
| Mobile | < 768px | Sidebar hidden (hamburger), single column, bottom nav |
| Tablet | 768–1024px | Sidebar collapsed (icons only), 2-column grids |
| Desktop | 1024–1440px | Full sidebar, 3-column grids |
| Wide | > 1440px | Max-width container, centered |

### S1.8 Animation & Transitions

```css
/* Standard transition */
transition-all duration-200 ease-in-out

/* Page transitions */
animate-fadeIn: { from: { opacity: 0, transform: translateY(8px) } }

/* Loading skeleton */
animate-pulse (Tailwind built-in)

/* Toast notifications: slide in from top-right, auto-dismiss 5s */
```

---

## S2. AUTHENTICATION — Auth0 INTEGRATION

### S2.1 Architecture

Auth0 handles: signup, login, password reset, social login, email verification, MFA.
Contentine backend validates Auth0 JWT tokens. No custom auth logic needed.

**Flow:**
```
Browser → Auth0 Universal Login → Auth0 callback → Contentine frontend
                                                      ↓
                                              POST /api/auth/sync
                                                      ↓
                                              PHP validates JWT (RS256)
                                              Upserts user in MySQL
                                              Returns Contentine JWT + user object
```

### S2.2 Auth0 Tenant Setup Instructions

```
1. Go to https://manage.auth0.com
2. Create Application:
   - Name: "Contentine Create"
   - Type: "Single Page Application"
   - Allowed Callback URLs: https://app.contentine.ai/callback, http://localhost:3000/callback
   - Allowed Logout URLs: https://app.contentine.ai, http://localhost:3000
   - Allowed Web Origins: https://app.contentine.ai, http://localhost:3000

3. Enable Connections:
   - Username-Password-Authentication (Database)
   - Google (Social)
   - Apple (Social) — optional

4. Branding:
   - Upload Contentine Create logo (contentine_logo.svg)
   - Primary color: #00C3FF
   - Background color: #F6F8FA

5. Email Templates (Auth0 handles sending):
   - Welcome email
   - Password reset
   - Email verification
   - Blocked account
   → Customize with Contentine branding in Auth0 Dashboard → Branding → Email Templates

6. Rules/Actions (Auth0 Actions):
   - Post-login Action: Attach plan_tier and team_id from app_metadata to ID token
   - Post-registration Action: Call Contentine /api/auth/sync to create user row in MySQL

7. API:
   - Create API: "Contentine API"
   - Identifier: https://api.contentine.ai
   - Signing Algorithm: RS256

8. Environment variables for Contentine:
   NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
   NEXT_PUBLIC_AUTH0_CLIENT_ID=xxxxxx
   AUTH0_CLIENT_SECRET=xxxxxx (server-side only)
   AUTH0_AUDIENCE=https://api.contentine.ai
   AUTH0_ISSUER=https://your-tenant.auth0.com/
```

### S2.3 Frontend Integration (Next.js)

```bash
npm install @auth0/nextjs-auth0
```

Since Contentine uses static export (`next export`), we use the SPA SDK instead:

```bash
npm install @auth0/auth0-spa-js
```

```typescript
// lib/auth.ts
import { Auth0Client } from '@auth0/auth0-spa-js';

let auth0Client: Auth0Client | null = null;

export async function getAuth0Client() {
  if (auth0Client) return auth0Client;
  auth0Client = new Auth0Client({
    domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN!,
    clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!,
    authorizationParams: {
      redirect_uri: `${window.location.origin}/callback`,
      audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
    },
    cacheLocation: 'localstorage',
  });
  return auth0Client;
}

export async function login() {
  const client = await getAuth0Client();
  await client.loginWithRedirect();
}

export async function logout() {
  const client = await getAuth0Client();
  await client.logout({ logoutParams: { returnTo: window.location.origin } });
}

export async function getToken(): Promise<string> {
  const client = await getAuth0Client();
  return client.getTokenSilently();
}
```

### S2.4 Backend JWT Validation (PHP)

```php
// backend/lib/auth0-validate.php
// Install: composer require firebase/php-jwt

use Firebase\JWT\JWT;
use Firebase\JWT\JWK;

function validateAuth0Token(string $token): object {
    $domain = getenv('AUTH0_DOMAIN'); // your-tenant.auth0.com
    $audience = getenv('AUTH0_AUDIENCE'); // https://api.contentine.ai

    // Fetch JWKS (cache for 1 hour)
    $cacheFile = sys_get_temp_dir() . '/auth0_jwks_' . md5($domain) . '.json';
    if (!file_exists($cacheFile) || filemtime($cacheFile) < time() - 3600) {
        $jwksJson = file_get_contents("https://{$domain}/.well-known/jwks.json");
        file_put_contents($cacheFile, $jwksJson);
    } else {
        $jwksJson = file_get_contents($cacheFile);
    }

    $jwks = json_decode($jwksJson, true);
    $keys = JWK::parseKeySet($jwks, 'RS256');

    $decoded = JWT::decode($token, $keys);

    // Validate claims
    if ($decoded->aud !== $audience && !in_array($audience, (array)$decoded->aud)) {
        throw new Exception('Invalid audience');
    }
    if ($decoded->iss !== "https://{$domain}/") {
        throw new Exception('Invalid issuer');
    }

    return $decoded;
}

// Middleware for all API routes
function requireAuth(): object {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        http_response_code(401);
        echo json_encode(['error' => 'Missing token']);
        exit;
    }
    return validateAuth0Token($m[1]);
}
```

### S2.5 User Sync Endpoint

```php
// POST /api/auth/sync
// Called after first login to ensure user exists in MySQL
function syncUser() {
    $auth = requireAuth();
    $sub = $auth->sub; // "auth0|abc123" or "google-oauth2|xyz"
    $email = $auth->email ?? '';
    $name = $auth->name ?? '';

    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM users WHERE auth0_sub = ?");
    $stmt->execute([$sub]);
    $user = $stmt->fetch();

    if (!$user) {
        // New user — create with free trial
        $stmt = $db->prepare("INSERT INTO users (auth0_sub, email, name, plan_tier, trial_ends_at, created_at) VALUES (?, ?, ?, 'free_trial', DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())");
        $stmt->execute([$sub, $email, $name]);
        $userId = $db->lastInsertId();
    } else {
        $userId = $user['id'];
    }

    // Return user profile
    $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
}
```

### S2.6 Social Platform OAuth (Separate from Auth0)

Auth0 handles user authentication only. Social platform OAuth (YouTube, TikTok, etc.) for publishing is separate. These use the existing `/api/auth/oauth/{platform}` endpoints.

```
Auth0 = "Who is this user?" (login/signup)
Platform OAuth = "Can we publish to their YouTube?" (publishing permission)
```

The 7 platform OAuth flows remain as specified in the Engineering Spec, using server-side PHP OAuth with token storage in `social_accounts` table.

---

## S3. LLM SYSTEM PROMPTS — CONTENT REMIX ENGINE

All 9 platform-specific system prompts for the Remix transformation engine. Used by `POST /api/remix/generate`.

### S3.1 Prompt Architecture

```php
// backend/lib/remix-prompts.php

function getRemixSystemPrompt(string $platform, array $options = []): string {
    $brandVoice = $options['brand_voice'] ?? 'professional yet conversational';
    $customInstructions = $options['custom_instructions'] ?? '';

    $baseContext = "You are an expert content repurposing engine. Your job is to transform source material into platform-optimized content that feels native to each platform — not like a generic rewrite.\n\nBrand voice: {$brandVoice}\n";

    if ($customInstructions) {
        $baseContext .= "Additional instructions: {$customInstructions}\n";
    }

    return $baseContext . "\n" . PLATFORM_PROMPTS[$platform];
}

const PLATFORM_PROMPTS = [/* see below */];
```

### S3.2 Twitter/X Post

```
PLATFORM: Twitter/X
CONSTRAINTS:
- Maximum 280 characters per tweet
- If content warrants it, create a thread (3-7 tweets) with [1/N] numbering
- First tweet MUST be a hook — surprising, contrarian, or curiosity-driven
- No more than 3 hashtags, placed at the end
- Use line breaks strategically for readability
- Avoid linking (links reduce reach); focus on standalone value
- Use numbers, data points, or bold claims when available

FORMAT:
For single tweet: Return plain text, 280 chars max.
For thread: Return JSON array:
{"format": "thread", "tweets": ["Tweet 1 [1/5]", "Tweet 2 [2/5]", ...]}

STYLE RULES:
- Hook patterns that work: "Most people think X. They're wrong.", "I spent [time] doing [thing]. Here's what I learned:", "Stop doing X. Do Y instead.", "The #1 mistake in [field]:"
- Short sentences. Punchy rhythm.
- End thread with a CTA: "Follow for more" or "Retweet if you agree" or "What would you add?"
- Remove all filler words. Every word must earn its place.

SOURCE MATERIAL:
{source_text}

Generate the most engaging Twitter/X content possible from this source.
```

### S3.3 LinkedIn Post

```
PLATFORM: LinkedIn
CONSTRAINTS:
- Length: 1,200-3,000 characters (sweet spot for LinkedIn algorithm)
- First 2 lines visible before "...see more" — make them count
- Professional tone but NOT corporate-speak — write like a real person sharing insights
- Include 3-5 relevant hashtags at the very end, separated by line breaks
- End with a question or CTA to drive comments (LinkedIn algorithm rewards comments)

FORMAT:
Return the post as plain text with line breaks. Use single-line spacing for readability.

STRUCTURE (proven LinkedIn format):
1. Hook line (bold/surprising insight or personal story opener)
2. [blank line]
3. Context/setup (2-3 lines)
4. [blank line]
5. Key insight or lessons (use "→" arrows for list items, not bullet points)
6. [blank line]
7. Personal reflection or takeaway (1-2 sentences, authentic voice)
8. [blank line]
9. CTA question ("What's your experience with...?" or "Agree or disagree?")
10. [blank line]
11. #hashtag1 #hashtag2 #hashtag3

STYLE RULES:
- Write in first person ("I", "we")
- Lead with value, not self-promotion
- Short paragraphs (1-3 sentences max)
- Use "→" for list items, never bullet points or numbers
- Include a specific data point or result if available
- Avoid: buzzwords (synergy, leverage, ecosystem), humble brags, "I'm thrilled to announce"

SOURCE MATERIAL:
{source_text}

Generate a LinkedIn post that would get strong engagement from a professional audience.
```

### S3.4 Instagram Caption

```
PLATFORM: Instagram
CONSTRAINTS:
- Caption length: 150-2,200 characters (optimal: 500-1,000)
- First line must hook — this is what shows before "...more"
- Emoji usage: 5-10 per caption, contextual not excessive
- Up to 30 hashtags (mix of high-volume and niche)
- Include a CTA driving comments, saves, or shares

FORMAT:
Return JSON: {"caption": "...", "hashtags": ["#tag1", "#tag2", ...]}

STRUCTURE:
1. Hook line with emoji (question, bold statement, or relatable pain point)
2. Value content (tips, story, or insights from source)
3. CTA ("Save this for later 🔖", "Double tap if you agree ❤️", "Tag someone who needs this")
4. [blank line]
5. Hashtags block (separate from caption)

STYLE RULES:
- Conversational, warm, relatable
- Use emojis as visual paragraph breaks
- Line breaks between thoughts for scannability
- Mix of branded hashtags + discovery hashtags + niche hashtags
- Write as if talking to a friend, not a crowd

SOURCE MATERIAL:
{source_text}

Generate an Instagram caption that maximizes saves and shares.
```

### S3.5 Facebook Post

```
PLATFORM: Facebook
CONSTRAINTS:
- Length: 100-500 characters (optimal for engagement)
- First 3 lines visible before truncation
- Conversational, shareable tone — write like you're posting in a group
- End with a question to drive comments (Facebook algorithm = comments > reactions)
- No hashtags or max 1-2

FORMAT:
Return plain text.

STYLE RULES:
- Most engaging Facebook formats: questions, polls, "This or that?", personal stories, hot takes
- Lead with emotion or curiosity
- Use "you" language — make it about the reader
- Short paragraphs, casual punctuation okay
- Emojis sparingly (1-3 max)
- End with an open question or "thoughts?" prompt

SOURCE MATERIAL:
{source_text}

Generate a Facebook post optimized for shares and comments.
```

### S3.6 TikTok Caption

```
PLATFORM: TikTok
CONSTRAINTS:
- Maximum 150 characters for caption (keep it SHORT)
- 3-5 hashtags (mix trending + niche)
- Caption should create curiosity or FOMO — it accompanies a video
- Hook-first: the caption should make someone stop scrolling

FORMAT:
Return JSON: {"caption": "...", "hashtags": ["#tag1", "#tag2", ...]}

STYLE RULES:
- Ultra-punchy, Gen-Z friendly language okay
- Patterns that work: "POV: [scenario]", "Things nobody tells you about [topic]", "Wait for it...", "[Topic] hack that actually works"
- Controversial or polarizing angles get more engagement
- Use emojis sparingly (1-2 max in caption)
- Hashtags: always include #fyp or #foryou + topic-specific

SOURCE MATERIAL:
{source_text}

Generate a TikTok caption that maximizes watch-through rate.
```

### S3.7 Threads Post

```
PLATFORM: Threads (Meta)
CONSTRAINTS:
- Maximum 500 characters per post
- For longer content, create a thread (3-7 connected posts)
- Casual, Twitter-like tone but slightly more personal
- No hashtags (Threads deprioritizes them)
- Cross-post friendly with Instagram

FORMAT:
For single post: Return plain text.
For thread: Return JSON array:
{"format": "thread", "posts": ["Post 1", "Post 2", ...]}

STYLE RULES:
- Conversational, like texting a smart friend
- Hot takes work well
- Questions drive engagement
- Short sentences, clear thoughts
- Authentic > polished
- No link previews, no hashtags

SOURCE MATERIAL:
{source_text}

Generate Threads content that feels native and drives replies.
```

### S3.8 Blog Article

```
PLATFORM: Blog/Website
CONSTRAINTS:
- Length: 1,000-2,000 words
- SEO-optimized: include target keywords naturally (2-3% density)
- Scannable: use H2 headings every 200-300 words
- Include meta description (155 characters max)
- Introduction should hook within first 2 sentences
- Conclusion with clear CTA

FORMAT:
Return JSON:
{
  "title": "SEO-optimized title (60 chars max)",
  "meta_description": "155 chars max",
  "content": "Full article in Markdown format with ## headings",
  "suggested_tags": ["tag1", "tag2", "tag3"]
}

STRUCTURE:
1. Title (power word + number + promise)
2. Introduction (hook → context → what reader will learn)
3. Body sections (H2 headings, 200-300 words each)
4. Key takeaways or actionable summary
5. Conclusion + CTA

STYLE RULES:
- Write for humans first, SEO second
- Active voice, short sentences, clear examples
- Include specific data/examples from source material
- Use transition phrases between sections
- Avoid: passive voice, jargon without explanation, walls of text
- Reading level: 8th grade (Hemingway standard)

SOURCE MATERIAL:
{source_text}

Generate an SEO-friendly blog article that provides genuine value.
```

### S3.9 Email Newsletter

```
PLATFORM: Email Newsletter
CONSTRAINTS:
- Subject line: 6-10 words, curiosity-driven (A/B: provide 2 variants)
- Preview text: 40-90 characters (complements subject, doesn't repeat it)
- Body: 300-800 words (skimmable)
- Single clear CTA
- Personal tone — like an email from a knowledgeable friend

FORMAT:
Return JSON:
{
  "subject_a": "Subject line variant A",
  "subject_b": "Subject line variant B",
  "preview_text": "Preview text...",
  "body": "Full newsletter body in Markdown",
  "cta_text": "Read the full guide →",
  "cta_url_placeholder": "[INSERT_LINK]"
}

STRUCTURE:
1. Personal opener (1-2 sentences, relatable)
2. The insight/value (main content from source, reformatted for email)
3. Key takeaways (3-5 bullet points)
4. CTA (single, clear, compelling)
5. Sign-off (personal, brief)

STYLE RULES:
- Subject line patterns: "The [adjective] way to [benefit]", "[Number] things I learned about [topic]", "You're probably doing [thing] wrong"
- Write like a person, not a company
- Use "you" and "I" liberally
- One topic per email — don't dilute
- Bold key phrases for skimmers
- Short paragraphs (2-3 sentences max)

SOURCE MATERIAL:
{source_text}

Generate a newsletter that gets opened and read all the way through.
```

### S3.10 Video Script (existing from Engineering Spec — included for completeness)

```
PLATFORM: Video Script
CONSTRAINTS:
- Duration target: 30-60 seconds for short-form, up to 5 minutes for long-form
- Each scene: 5-15 seconds of narration + visual prompt
- Hook in first 3 seconds — or viewers scroll away
- Scene count: 4-8 for short-form, 15-30 for long-form

FORMAT:
Output ONLY valid JSON:
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
  "suggested_music_mood": "upbeat" | "calm" | "dramatic" | "inspiring",
  "target_platform": "tiktok" | "youtube_shorts" | "youtube" | "instagram_reels"
}

STYLE RULES:
- Narration: conversational, natural speech patterns (how people actually talk)
- Visual prompts: specific, detailed, art-style-agnostic (the user picks the art style separately)
- Each visual prompt should describe: subject, action, setting, mood, camera angle
- Pacing: fast for hooks (3s), moderate for info (5-7s), slow for impact (8-10s)
- Always end with CTA scene

SOURCE MATERIAL:
{source_text}

Generate a compelling video script with vivid scene descriptions.
```

### S3.11 Prompt Integration Code

```php
// backend/controllers/RemixController.php — generate endpoint

function generate() {
    $auth = requireAuth();
    $body = json_decode(file_get_contents('php://input'), true);

    $sources = $body['sources'] ?? [];      // [{text: "...", title: "..."}]
    $targets = $body['targets'] ?? [];      // ["twitter", "linkedin", ...]
    $customInstructions = $body['custom_instructions'] ?? '';
    $brandVoice = $body['brand_voice'] ?? 'professional yet conversational';

    // Combine all source texts
    $combinedSource = '';
    foreach ($sources as $i => $src) {
        $title = $src['title'] ?? "Source " . ($i + 1);
        $combinedSource .= "--- {$title} ---\n{$src['text']}\n\n";
    }

    $results = [];
    foreach ($targets as $platform) {
        $systemPrompt = getRemixSystemPrompt($platform, [
            'brand_voice' => $brandVoice,
            'custom_instructions' => $customInstructions,
        ]);

        $userPrompt = str_replace('{source_text}', $combinedSource, $systemPrompt);

        // Call LLM API (Claude or GPT)
        $response = callLLM($userPrompt, [
            'temperature' => $platform === 'video_script' ? 0.7 : 0.8,
            'max_tokens' => $platform === 'blog' ? 4000 : 2000,
        ]);

        $results[$platform] = $response;
    }

    echo json_encode(['outputs' => $results]);
}
```

---

## S4. ERROR HANDLING & RETRY STRATEGY

### S4.1 Frontend Error Handling

```typescript
// lib/api-client.ts

class APIError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiCall<T>(
  url: string,
  options: RequestInit = {},
  retryConfig = { maxRetries: 3, backoffMs: 1000 }
): Promise<T> {
  const token = await getToken();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (res.status === 401) {
        // Token expired — try refresh once, then redirect to login
        if (attempt === 0) {
          await refreshToken();
          continue;
        }
        window.location.href = '/login';
        throw new APIError(401, 'AUTH_EXPIRED', 'Session expired');
      }

      if (res.status === 429) {
        // Rate limited — exponential backoff
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5');
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, body.code || 'UNKNOWN', body.message || res.statusText);
      }

      return res.json();
    } catch (err) {
      lastError = err as Error;
      if (err instanceof APIError && err.status < 500) throw err; // Don't retry client errors
      if (attempt < retryConfig.maxRetries) {
        await sleep(retryConfig.backoffMs * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
```

### S4.2 Backend Error Handling

```php
// backend/lib/error-handler.php

function handleError(Throwable $e): void {
    $code = match(true) {
        $e instanceof AuthException => 401,
        $e instanceof ForbiddenException => 403,
        $e instanceof NotFoundException => 404,
        $e instanceof ValidationException => 422,
        $e instanceof RateLimitException => 429,
        default => 500,
    };

    http_response_code($code);

    $response = [
        'error' => true,
        'code' => $e->getCode() ?: 'INTERNAL_ERROR',
        'message' => $code < 500 ? $e->getMessage() : 'An internal error occurred',
    ];

    // Log server errors
    if ($code >= 500) {
        error_log("[CONTENTINE] {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
    }

    echo json_encode($response);
    exit;
}

set_exception_handler('handleError');
```

### S4.3 LLM API Retry Strategy

```php
// backend/lib/llm-client.php

function callLLM(string $prompt, array $options = []): string {
    $maxRetries = 3;
    $backoff = 1; // seconds

    for ($attempt = 0; $attempt <= $maxRetries; $attempt++) {
        try {
            $response = callClaudeAPI($prompt, $options);
            return $response;
        } catch (RateLimitException $e) {
            if ($attempt === $maxRetries) throw $e;
            sleep(min($backoff * pow(2, $attempt), 30)); // Max 30s backoff
        } catch (TimeoutException $e) {
            if ($attempt === $maxRetries) throw $e;
            sleep($backoff);
        } catch (ServerException $e) {
            // 5xx from LLM provider
            if ($attempt === $maxRetries) throw $e;
            sleep($backoff * pow(2, $attempt));
        }
        // 4xx client errors: throw immediately, don't retry
    }
}
```

### S4.4 Browser-Side Error Handling

```typescript
// For rendering pipeline failures
class RenderError extends Error {
  scene: number;
  phase: 'tts' | 'image' | 'encode' | 'mux';
  constructor(scene: number, phase: string, message: string) {
    super(`Scene ${scene} failed at ${phase}: ${message}`);
    this.scene = scene;
    this.phase = phase as any;
  }
}

// Rendering with per-scene retry
async function renderVideo(scenes: Scene[]): AsyncGenerator<RenderProgress> {
  for (let i = 0; i < scenes.length; i++) {
    let retries = 2;
    while (retries >= 0) {
      try {
        yield { scene: i, status: 'rendering', progress: i / scenes.length };
        await renderScene(scenes[i]);
        break;
      } catch (err) {
        retries--;
        if (retries < 0) {
          yield { scene: i, status: 'error', error: err.message };
          throw new RenderError(i, detectPhase(err), err.message);
        }
        yield { scene: i, status: 'retrying', retriesLeft: retries };
        await sleep(1000);
      }
    }
  }
}
```

### S4.5 Error Boundary (React)

```tsx
// components/ErrorBoundary.tsx
'use client';
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Contentine Error]', error, info);
    // TODO: Send to error tracking service (Sentry)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
          <h2 className="text-xl font-semibold text-text mb-2">Something went wrong</h2>
          <p className="text-text-secondary mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## S5. TESTING STRATEGY

### S5.1 Overview

| Layer | Tool | Coverage Target | Run When |
|-------|------|----------------|----------|
| Unit (Frontend) | Vitest + React Testing Library | 80% statements | Every commit |
| Unit (Backend) | PHPUnit | 80% statements | Every commit |
| Integration (API) | PHPUnit + HTTP client | All 39 endpoints | Every PR |
| E2E | Playwright | 15 critical flows | Nightly + pre-release |
| Visual | Playwright screenshots | Key pages | Pre-release |
| Performance | Lighthouse CI | Core Web Vitals | Weekly |

### S5.2 Frontend Unit Tests (Vitest)

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], thresholds: { statements: 80 } },
  },
});
```

**What to test:**
- Zustand stores: state transitions, computed values
- Utility functions: script parsing, duration calculation, URL validation
- Component rendering: correct props, conditional display
- Form validation: input constraints, error messages
- API client: retry logic, error mapping

**What NOT to test:**
- WebCodecs/WASM rendering (browser APIs — test via E2E)
- Third-party libraries (Kokoro, face-api.js)

### S5.3 Backend Unit Tests (PHPUnit)

```bash
composer require --dev phpunit/phpunit
```

**Test every controller:**
```php
// tests/RemixControllerTest.php
class RemixControllerTest extends TestCase {
    public function testExtractYouTubeUrl() { /* mock cURL, assert transcript returned */ }
    public function testExtractArticleUrl() { /* mock DOMDocument, assert text extracted */ }
    public function testGenerateRequiresAuth() { /* assert 401 without token */ }
    public function testGenerateWithValidSources() { /* mock LLM, assert outputs returned */ }
    public function testGenerateRateLimiting() { /* assert 429 after limit */ }
}
```

### S5.4 Integration Tests

Test all 39 API endpoints against a test MySQL database:

```php
// tests/integration/ApiTest.php
// Uses test Auth0 token (machine-to-machine)
// Runs against test DB (auto-created, auto-torn-down)

public function testFullVideoWorkflow() {
    $video = $this->post('/api/videos', ['title' => 'Test', 'type' => 'faceless']);
    $this->assertEquals(201, $video->status);

    $upload = $this->post("/api/videos/{$video->id}/upload", ['mp4' => $testFile]);
    $this->assertEquals(200, $upload->status);

    $schedule = $this->post('/api/schedule', [
        'video_id' => $video->id,
        'platform' => 'youtube',
        'scheduled_at' => '2026-03-01T10:00:00Z',
    ]);
    $this->assertEquals(201, $schedule->status);
}

public function testRemixWorkflow() {
    $extract = $this->post('/api/remix/extract', ['type' => 'url', 'url' => 'https://example.com']);
    $this->assertEquals(200, $extract->status);
    $this->assertNotEmpty($extract->body['text']);

    $project = $this->post('/api/remix/projects', ['name' => 'Test Remix']);
    $this->assertEquals(201, $project->status);

    $generate = $this->post('/api/remix/generate', [
        'sources' => [['text' => $extract->body['text']]],
        'targets' => ['twitter', 'linkedin'],
    ]);
    $this->assertEquals(200, $generate->status);
    $this->assertArrayHasKey('twitter', $generate->body['outputs']);
    $this->assertArrayHasKey('linkedin', $generate->body['outputs']);
}
```

### S5.5 E2E Tests (Playwright)

```bash
npm install -D @playwright/test
npx playwright install
```

**15 critical user flows:**

| # | Flow | Steps |
|---|------|-------|
| 1 | Sign up | Auth0 login → /callback → dashboard loads |
| 2 | Create faceless video | New Video → write script → select voice → select style → render → download |
| 3 | Create avatar video | New Avatar Video → select preset → write script → render |
| 4 | Edit video | Open video → change scene order → change image → re-render |
| 5 | Schedule post | Select video → pick platform → pick date/time → confirm |
| 6 | Bulk schedule | Upload CSV → verify queue → confirm bulk |
| 7 | Discover ideas | Search topic → browse results → star favourite → create video from idea |
| 8 | Content remix | Add YouTube URL → extract → select targets → generate → edit → publish |
| 9 | Remix to video | Remix → generate video script → send to pipeline → render |
| 10 | Voice cloning | Record sample → save profile → use in video |
| 11 | Character consistency | Create anchor → generate video → verify same character across scenes |
| 12 | AI Writer | Select type → enter topic → generate → copy |
| 13 | Analytics view | Navigate to analytics → verify widgets → set alert |
| 14 | Team invite | Invite user → accept → verify shared content |
| 15 | Billing upgrade | Settings → upgrade plan → Stripe checkout → verify features unlock |

```typescript
// tests/e2e/remix.spec.ts
import { test, expect } from '@playwright/test';

test('Content Remix: URL to Twitter + LinkedIn', async ({ page }) => {
  await page.goto('/remix');
  await page.click('[data-testid="source-type-url"]');
  await page.fill('[data-testid="source-url"]', 'https://example.com/article');
  await page.click('[data-testid="extract-btn"]');
  await expect(page.locator('[data-testid="extracted-text"]')).not.toBeEmpty();

  await page.click('[data-testid="target-twitter"]');
  await page.click('[data-testid="target-linkedin"]');
  await page.click('[data-testid="generate-btn"]');

  await expect(page.locator('[data-testid="output-twitter"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-testid="output-linkedin"]')).toBeVisible();
});
```

### S5.6 CI Pipeline

```yaml
# .github/workflows/test.yml (for local dev reference — actual deploy is manual via Claude Cowork)
name: Test
on: [push, pull_request]
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - run: npm run build

  backend:
    runs-on: ubuntu-latest
    services:
      mysql: { image: 'mysql:8', env: { MYSQL_ROOT_PASSWORD: test, MYSQL_DATABASE: contentine_test } }
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.4' }
      - run: composer install
      - run: vendor/bin/phpunit

  e2e:
    runs-on: ubuntu-latest
    needs: [frontend, backend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npx playwright install --with-deps
      - run: npm run e2e
```

---

## S6. DEPLOYMENT — Claude Cowork + DreamHost

### S6.1 Build Process

```bash
# Local build (or via Claude Cowork)
cd contentine/
npm install
npm run build        # next build
npx next export      # Generates /out/ directory with static HTML/JS/CSS

# The /out/ directory is what gets uploaded to DreamHost
```

### S6.2 DreamHost File Structure

```
~/contentine.ai/
├── public_html/              ← DreamHost document root
│   ├── index.html            ← Next.js static export entry
│   ├── _next/                ← Next.js static assets (JS, CSS, chunks)
│   ├── favicon.ico
│   ├── contentine_logo.svg
│   ├── models/               ← face-api.js model files (served statically)
│   └── .htaccess             ← Apache rewrite rules for SPA routing
│
├── backend/                  ← PHP API (above or alongside public_html)
│   ├── index.php             ← API router
│   ├── controllers/
│   ├── lib/
│   ├── vendor/               ← Composer dependencies
│   └── .env                  ← Environment variables
│
└── cron/                     ← Cron scripts
    └── publish.php           ← Called every 5 minutes
```

### S6.3 Apache .htaccess (SPA Routing)

```apache
# public_html/.htaccess
RewriteEngine On

# API routes → backend
RewriteRule ^api/(.*)$ ../backend/index.php [L,QSA]

# Static files (Next.js assets, models, images) → serve directly
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

# Everything else → index.html (SPA routing)
RewriteRule ^ index.html [L]
```

### S6.4 Deploy Steps (Manual via Claude Cowork / SFTP)

```bash
# 1. Build locally
npm run build && npx next export

# 2. Upload static frontend
rsync -avz --delete out/ user@contentine.ai:~/contentine.ai/public_html/ \
  --exclude='.htaccess' --exclude='models/'

# 3. Upload backend
rsync -avz backend/ user@contentine.ai:~/contentine.ai/backend/ \
  --exclude='vendor/' --exclude='.env'

# 4. Install PHP dependencies on server
ssh user@contentine.ai "cd ~/contentine.ai/backend && composer install --no-dev"

# 5. Run database migrations
ssh user@contentine.ai "cd ~/contentine.ai/backend && php migrate.php"
```

### S6.5 Environment Variables (DreamHost)

```bash
# ~/contentine.ai/backend/.env
DB_HOST=mysql.contentine.ai
DB_NAME=contentine
DB_USER=contentine_user
DB_PASS=xxxxxx

AUTH0_DOMAIN=contentine.auth0.com
AUTH0_AUDIENCE=https://api.contentine.ai

CLAUDE_API_KEY=sk-ant-xxxxxx
OPENAI_API_KEY=sk-xxxxxx
DALLE_API_KEY=sk-xxxxxx

STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxx

PEXELS_API_KEY=xxxxxx
PIXABAY_API_KEY=xxxxxx

APP_ENV=production
APP_URL=https://app.contentine.ai
```

---

## S7. ONBOARDING FLOW

### S7.1 First-Time User Flow

```
1. WELCOME SCREEN (after Auth0 callback, first login detected)
   ┌────────────────────────────────────────────┐
   │  🎬 Welcome to Contentine!                 │
   │                                             │
   │  Let's set you up in 60 seconds.            │
   │                                             │
   │  [Get Started →]                            │
   └────────────────────────────────────────────┘

2. WHAT DO YOU CREATE? (multi-select)
   ┌────────────────────────────────────────────┐
   │  What kind of content do you create?        │
   │                                             │
   │  [📱 Short-form video (TikTok, Reels)]     │
   │  [🎬 Long-form video (YouTube)]             │
   │  [✍️ Written content (blogs, newsletters)]  │
   │  [🔀 Content remixing / repurposing]        │
   │  [📊 Marketing / ads]                       │
   │  [🎓 Educational content]                   │
   │                                             │
   │  [Continue →]                               │
   └────────────────────────────────────────────┘

3. CONNECT PLATFORMS (optional, skippable)
   ┌────────────────────────────────────────────┐
   │  Connect your publishing accounts           │
   │  (You can always do this later)             │
   │                                             │
   │  [📺 YouTube]  [🎵 TikTok]  [📸 Instagram] │
   │  [📘 Facebook] [💼 LinkedIn] [🧵 Threads]   │
   │  [🐦 Twitter/X]                             │
   │                                             │
   │  [Skip for now]  [Continue →]               │
   └────────────────────────────────────────────┘

4. PICK YOUR FIRST ACTION (routes to feature)
   ┌────────────────────────────────────────────┐
   │  What would you like to do first?           │
   │                                             │
   │  [🎬 Create my first video]                 │
   │  → Opens Video Generator with guided mode   │
   │                                             │
   │  [🔀 Remix existing content]                │
   │  → Opens Remix Hub with tutorial overlay     │
   │                                             │
   │  [💡 Find content ideas]                    │
   │  → Opens Idea Discovery                     │
   │                                             │
   │  [🏠 Just explore the dashboard]            │
   │  → Goes to dashboard                        │
   └────────────────────────────────────────────┘
```

### S7.2 Feature Tooltips (Progressive Disclosure)

On first visit to each feature, show a brief tooltip tour (3-5 steps max per feature):

```typescript
// Tooltip system using Zustand + localStorage
interface OnboardingState {
  completedTours: Set<string>;
  activeTour: string | null;
  currentStep: number;
}

const tours = {
  'video-generator': [
    { target: '#creation-mode', title: 'Choose your mode', body: 'Faceless uses AI images, Avatar uses a talking head.' },
    { target: '#script-editor', title: 'Write or generate', body: 'Type your script or click ✨ to generate one with AI.' },
    { target: '#voice-picker', title: 'Pick a voice', body: '60+ voices included. You can also clone your own voice!' },
    { target: '#render-btn', title: 'Render & export', body: 'Everything renders in your browser. No waiting for servers.' },
  ],
  'remix-hub': [
    { target: '#source-input', title: 'Add your content', body: 'Paste a URL, upload a file, or type/paste text.' },
    { target: '#target-platforms', title: 'Choose outputs', body: 'Select which platforms you want content for.' },
    { target: '#video-script-target', title: '⭐ Video scripts!', body: 'This is unique to Contentine Create — turn any content into a video.' },
    { target: '#generate-btn', title: 'Generate all at once', body: 'AI creates all outputs simultaneously.' },
  ],
  'idea-discovery': [
    { target: '#search-input', title: 'Enter a topic', body: 'Search across 8 platforms at once.' },
    { target: '#platform-tabs', title: 'Browse by platform', body: 'Each platform shows questions, hashtags, and video titles.' },
    { target: '#star-btn', title: 'Save your favourites', body: 'Star any idea to save it for later.' },
  ],
};
```

### S7.3 Empty States

Every list/grid view shows a helpful empty state on first use:

```tsx
// components/EmptyState.tsx
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

// Examples:
// My Videos: "No videos yet. Create your first video in under 2 minutes."
// Remix Projects: "No remix projects yet. Turn any content into multi-platform posts."
// Scheduled Posts: "Nothing scheduled. Plan your content calendar."
// Analytics: "No data yet. Publish your first video to start tracking."
```

### S7.4 Trial Banner

Persistent banner during free trial:

```tsx
// Shows on all pages during trial
<div className="bg-primary-bg border-b border-primary/20 px-4 py-2 text-center text-sm">
  <span className="text-primary font-medium">Free Trial: {daysLeft} days remaining</span>
  <span className="text-text-secondary"> · {videosUsed}/5 videos used · </span>
  <a href="/pricing" className="text-primary font-medium underline">Upgrade for unlimited →</a>
</div>
```

### S7.5 Storage of Onboarding State

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN onboarding_data JSON; -- {"content_types": [...], "first_action": "video"}
```

Store tooltip tour completion in localStorage (client-side only, not critical data):
```typescript
localStorage.setItem('contentine_tours_completed', JSON.stringify(['video-generator', 'remix-hub']));
```

---

## S8. ADDITIONAL DECISIONS

### S8.1 Rate Limiting

```php
// backend/lib/rate-limiter.php
// Simple file-based rate limiter (suitable for shared hosting)

function rateLimit(string $key, int $maxRequests, int $windowSeconds): void {
    $file = sys_get_temp_dir() . '/rl_' . md5($key) . '.json';
    $data = file_exists($file) ? json_decode(file_get_contents($file), true) : ['requests' => [], 'window_start' => time()];

    // Clean old entries
    $data['requests'] = array_filter($data['requests'], fn($t) => $t > time() - $windowSeconds);

    if (count($data['requests']) >= $maxRequests) {
        header('Retry-After: ' . ($windowSeconds - (time() - min($data['requests']))));
        throw new RateLimitException("Rate limit exceeded: {$maxRequests} per {$windowSeconds}s");
    }

    $data['requests'][] = time();
    file_put_contents($file, json_encode($data), LOCK_EX);
}

// Usage in controllers:
rateLimit("llm:{$userId}", 30, 60);      // 30 LLM calls per minute
rateLimit("remix:{$userId}", 10, 60);     // 10 remix generations per minute
rateLimit("extract:{$userId}", 20, 60);   // 20 URL extractions per minute
rateLimit("image:{$userId}", 60, 60);     // 60 image gens per minute
```

### S8.2 Caching Strategy

```php
// API responses cached in PHP temp directory
function cacheGet(string $key, int $ttl = 300): mixed {
    $file = sys_get_temp_dir() . '/cache_' . md5($key);
    if (file_exists($file) && filemtime($file) > time() - $ttl) {
        return json_decode(file_get_contents($file), true);
    }
    return null;
}

function cacheSet(string $key, mixed $value): void {
    $file = sys_get_temp_dir() . '/cache_' . md5($key);
    file_put_contents($file, json_encode($value), LOCK_EX);
}

// Cache targets:
// - Auth0 JWKS: 1 hour
// - Idea Discovery results: 15 minutes
// - Stock media search results: 1 hour
// - Analytics aggregations: 5 minutes
// - Avatar presets list: 24 hours
```

### S8.3 Logging

```php
// Simple file-based logging (DreamHost compatible)
function appLog(string $level, string $message, array $context = []): void {
    $logFile = dirname(__DIR__) . '/logs/' . date('Y-m-d') . '.log';
    $line = sprintf("[%s] %s: %s %s\n",
        date('Y-m-d H:i:s'),
        strtoupper($level),
        $message,
        $context ? json_encode($context) : ''
    );
    file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
}

// Rotate: cron deletes logs older than 30 days
// 0 2 * * * find ~/contentine.ai/backend/logs/ -name "*.log" -mtime +30 -delete
```

---

## S9. FILE MANIFEST

All files that should exist in this project workspace:

| File | Location | Status |
|------|----------|--------|
| PRD v1.0 | `/mnt/user-data/outputs/Contentine_PRD_v1.0.docx` | ✅ |
| PRD v2.0 | `/mnt/user-data/outputs/Contentine_PRD_v2.0.docx` | ✅ |
| PRD v2.1 | `/mnt/user-data/outputs/Contentine_PRD_v2.1.docx` | ✅ |
| Engineering Spec v2.1 | `/mnt/user-data/outputs/CONTENTINE_ENGINEERING_SPEC.md` | ✅ |
| Implementation Supplement | `/mnt/user-data/outputs/CONTENTINE_IMPLEMENTATION_SUPPLEMENT.md` | ✅ This file |
| Contentine Create Logo (Animated) | `/mnt/user-data/outputs/contentine_create_logo.html` | ✅ Official |
| Contentine Create Logo (Static SVG) | `/mnt/user-data/outputs/contentine_logo.svg` | ✅ Fallback |
| Handoff Package | `/mnt/user-data/uploads/HANDOFF.md` | ✅ Reference |

---

*End of Implementation Supplement v1.0. Combined with the Engineering Spec v2.1 and PRD v2.1, this provides everything needed to build Contentine from scratch.*
