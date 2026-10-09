# UI_UX_SPEC.md — Contentine Create Design System & Interaction Guide

> **READ THIS BEFORE BUILDING ANY PAGE OR COMPONENT.**  
> This file defines every visual and interaction pattern. Follow it exactly.
> The goal: a polished, premium SaaS product that feels like HeyGen/Linear/Notion — not generic AI-generated UI.

---

## 0. DESIGN PHILOSOPHY

**Aesthetic:** Clean luxury SaaS — the "Apple of video creation tools." Every pixel earns its place.

**Principles:**
1. **Show, don't overwhelm** — Progressive disclosure everywhere. Big number first, details on click.
2. **Every state is designed** — Loading, empty, error, success, hover, active, disabled — no state is left to browser defaults.
3. **Motion with purpose** — Every animation communicates something. No decoration-only animation.
4. **Density with breathing room** — Information-rich but never cramped. Generous padding, deliberate whitespace.
5. **One primary action per view** — The user should never ask "what do I do here?" The answer is visually obvious.

**CRITICAL ANTI-PATTERNS — NEVER DO THESE:**
- ❌ Generic placeholder text ("Lorem ipsum", "Click here", "Coming soon")  
- ❌ Gray boxes as placeholders for unbuilt features
- ❌ Centered-text-on-white-background empty states
- ❌ Overuse of shadows (max 1 elevation level per card)
- ❌ Cookie-cutter grid layouts with identical cards
- ❌ Modals for everything (use inline expansion, sheets, or page navigation)
- ❌ Flat, lifeless lists without visual hierarchy
- ❌ Loading spinners without context (always say WHAT is loading)

---

## 1. TYPOGRAPHY

**Font stack:** `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`

Inter is deliberately chosen for SaaS readability at small sizes. This is a tool people use 8 hours a day — legibility > novelty.

| Element | Size | Weight | Line-height | Tracking | Color |
|---------|------|--------|-------------|----------|-------|
| Page title | 24px | 700 | 1.2 | -0.02em | `text-text` |
| Section heading | 18px | 600 | 1.3 | -0.01em | `text-text` |
| Card title | 14px | 600 | 1.4 | 0 | `text-text` |
| Body | 14px | 400 | 1.5 | 0 | `text-text` |
| Secondary text | 13px | 400 | 1.5 | 0 | `text-secondary` |
| Caption / label | 12px | 500 | 1.4 | 0.01em | `text-muted` |
| Tiny / badge | 11px | 500 | 1 | 0.02em | varies |
| Monospace | 13px | 400 | 1.5 | 0 | `text-text` — `font-mono` |

**Rules:**
- Never use bold for paragraph text. Bold is for headings and emphasis only.
- Never all-caps except badges and tiny labels.
- Truncate with `...` at 1 line for card titles, 2 lines for descriptions. Never wrap endlessly.
- Numbers use tabular figures: `font-variant-numeric: tabular-nums` for alignment in tables/stats.

---

## 2. COLOR APPLICATION

Colors are already defined in tailwind.config.ts. Here's HOW to apply them:

### Primary `#00C3FF` — Use for:
- Active sidebar item background + text
- CTA buttons (filled)
- Links (text color, no underline by default, underline on hover)
- Input focus ring
- Progress indicators
- Toggle/switch active state
- Selected tab underline
- Chart primary series

### Secondary `#35C838` — Use for:
- "Published" / "Connected" / "Success" badges
- Checkmarks and success icons
- "Go Live" / "Publish" buttons
- Connected social account indicator dots
- Render complete state
- Positive change indicators (+12% ↑)

### Accent `#F3A6FF` — Use for:
- Remix Hub section highlights
- "AI Generate" / "AI Write" buttons and icons
- Sparkle icons (✦) next to AI features
- AI processing indicators
- Creative feature cards border-left accent
- "New" badges on AI features

### Danger `#E74C3C` — Use for:
- Delete buttons (ghost style with red text, filled on confirm)
- Error states and error toasts
- Failed render/publish badges
- Disconnected account indicators
- Form validation errors
- Negative change indicators (-8% ↓)

### Warning `#F39C12` — Use for:
- "Rendering" / "Processing" / "Queued" badges
- Trial expiring banner
- Incomplete form step indicators
- Usage approaching limit warnings

### Neutral scale — Use for:
- `#171717` — Primary text, headings
- `#636E7B` — Secondary text, labels, descriptions
- `#8B949E` — Placeholder text, disabled text, timestamps
- `#D0D7DE` — Borders, dividers, input borders
- `#E8EAED` — Light borders, card outlines
- `#F6F8FA` — Surface backgrounds, input backgrounds, table row alt
- `#FFFFFF` — Page background, card backgrounds

---

## 3. LAYOUT SYSTEM

### 3.1 Page Shell

```
┌─────────────────────────────────────────────────┐
│ [Logo]  ──  Search  ──────────────  🔔  [Avatar] │ ← Top bar h-14, white bg, bottom border
├──────┬──────────────────────────────────────────┤
│ 📊   │                                          │
│ 🎬   │   Page Content Area                      │
│ 🤖   │   - max-w-[1200px] for content pages     │
│ 🎙   │   - full-width for editor/canvas pages   │
│ 💡   │   - p-6 default padding                  │
│ 📅   │   - scroll-y with hidden scrollbar        │
│ ✦    │                                          │
│ ✍️   │                                          │
│ 📊   │                                          │
│ 👥   │                                          │
├──────┤                                          │
│ ⚙️   │                                          │
└──────┴──────────────────────────────────────────┘
  w-56     flex-1
```

### 3.2 Sidebar

- Width: `w-56` (224px) desktop, collapsible to `w-16` (64px icons only) on tablet
- Hidden on mobile (hamburger menu triggers slide-over)
- Active item: `bg-primary-bg text-primary font-medium` with `border-r-2 border-primary`
- Hover: `bg-surface`
- Remix Hub item always has accent color to draw attention
- Section dividers between main nav and bottom settings
- Bottom section: Settings + avatar/plan info

### 3.3 Top Bar

- Height: `h-14` (56px)
- Left: Search input (spans up to 480px)
- Right: Notification bell (with red dot if unread count > 0), user avatar circle
- Search: On focus, shows recent searches dropdown. On type, shows live results (videos, projects, ideas)
- User avatar: Click → dropdown with: Plan badge, Settings, Dark mode toggle, Sign out

### 3.4 Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|-----------|-------|---------------|
| Mobile | < 768px | Sidebar hidden, hamburger menu. Cards stack single column. Top bar compact. |
| Tablet | 768-1024px | Sidebar collapsed to icons. Cards 2-column. |
| Desktop | 1024-1440px | Full sidebar. Cards 3-column. Content max-w-[1200px]. |
| Wide | > 1440px | Full sidebar. Cards 4-column. Content centered with margin. |

---

## 4. COMPONENT PATTERNS

### 4.1 Buttons

```tsx
// Primary — one per view section, the main action
<button className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 active:scale-[0.98]">
  Create Video
</button>

// Secondary — supporting action
<button className="bg-primary-bg text-primary hover:bg-primary-light/30 px-4 py-2.5 rounded-lg text-sm font-medium border border-primary/20 transition-all">
  Save Draft
</button>

// Accent — AI/creative actions
<button className="bg-accent hover:bg-accent/80 text-dark px-4 py-2.5 rounded-lg text-sm font-medium transition-all">
  ✦ Generate
</button>

// Ghost — tertiary / cancel
<button className="text-text-secondary hover:bg-surface px-3 py-2 rounded-lg text-sm transition-colors">
  Cancel
</button>

// Danger — destructive (default ghost, filled on confirm)
<button className="text-danger hover:bg-danger/10 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
  Delete
</button>

// Icon button
<button className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface hover:text-text transition-colors">
  <IconName size={18} />
</button>
```

**Button rules:**
- Always show loading spinner (inline, replacing text) when action is processing
- Disable button during processing: `opacity-60 cursor-not-allowed`
- Minimum touch target: 36px height
- Never use "Submit" — use action verbs: "Create Video", "Generate Script", "Publish Now"

### 4.2 Cards

```tsx
// Standard card
<div className="bg-white dark:bg-dark-secondary rounded-xl border border-border-light p-5 hover:shadow-sm hover:border-primary/20 transition-all duration-200 cursor-pointer group">
  <div className="flex items-start justify-between mb-3">
    <h3 className="text-sm font-semibold text-text truncate">{title}</h3>
    <span className="badge-success shrink-0 ml-2">Published</span>
  </div>
  <p className="text-xs text-text-secondary line-clamp-2 mb-3">{description}</p>
  <div className="flex items-center gap-2 text-xs text-text-muted">
    <span>45s</span>
    <span>·</span>
    <span>9:16</span>
    <span>·</span>
    <span>2 hours ago</span>
  </div>
</div>
```

**Card rules:**
- Cards are ALWAYS interactive (hoverable) unless displaying pure info
- On hover: subtle border color shift + optional shadow — never dramatic scale transforms
- Video cards must show thumbnail with play icon overlay on hover
- Group actions (edit/delete/share) appear on hover via `opacity-0 group-hover:opacity-100`
- Cards in a grid use `gap-4` (16px) consistently

### 4.3 Inputs

```tsx
// Text input
<div className="space-y-1.5">
  <label className="text-xs font-medium text-text-secondary">{label}</label>
  <input
    className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
    placeholder={placeholder}
  />
  {error && <p className="text-xs text-danger">{error}</p>}
</div>

// Textarea — same style but with resize-none and min-h-[100px]
// Select — same border style, with custom chevron icon
```

**Input rules:**
- Labels are always above the input, never inside (placeholder ≠ label)
- Error messages appear below with red text, input border turns red
- Success state: green border, green checkmark icon inside right side
- Character count shown as `{current}/{max}` below right when near limit
- Focus: blue ring glow `ring-2 ring-primary/20 border-primary`

### 4.4 Badges & Status

```tsx
// Status badges — always with icon
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Published
</span>

// Rendering (animated)
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" /> Rendering
</span>

// AI badge
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-bg text-[#A855C0]">
  ✦ Remix
</span>
```

### 4.5 Toasts / Notifications

- Position: Bottom-right corner, stacked with 8px gap
- Auto-dismiss: 4 seconds for success, 6 seconds for error, persistent for actions
- Anatomy: Icon (left) + Message + optional action button + close X
- Enter: slide-up + fade-in (200ms)
- Exit: fade-out + slide-right (150ms)
- Success: Green left border accent
- Error: Red left border accent
- Info: Blue left border accent

```tsx
<div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
  <div className="bg-white dark:bg-dark-secondary rounded-lg shadow-lg border border-border-light p-4 pl-3 flex items-start gap-3 min-w-[320px] max-w-[420px] animate-slide-up border-l-4 border-l-secondary">
    <CheckCircle size={18} className="text-secondary shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-sm font-medium text-text">Video published successfully</p>
      <p className="text-xs text-text-muted mt-0.5">Morning Routine Tips is now live on TikTok</p>
    </div>
    <button className="text-text-muted hover:text-text"><X size={14} /></button>
  </div>
</div>
```

---

## 5. LOADING STATES

**CRITICAL: Never show a blank page or a generic spinner.**

### 5.1 Skeleton Screens

Use skeleton loaders that match the exact layout the real content will have.

```tsx
// Skeleton card
<div className="bg-white rounded-xl border border-border-light p-5 animate-pulse">
  <div className="h-4 bg-surface rounded w-2/3 mb-3" />
  <div className="h-3 bg-surface rounded w-full mb-2" />
  <div className="h-3 bg-surface rounded w-4/5 mb-4" />
  <div className="flex gap-2">
    <div className="h-5 bg-surface rounded-full w-16" />
    <div className="h-5 bg-surface rounded-full w-12" />
  </div>
</div>
```

**Rules:**
- Page-level: Show 3-6 skeleton cards in the same grid the real content uses
- Table: Show skeleton rows with same column widths
- Dashboard stats: Show skeleton number + skeleton label
- Duration: If loading > 3 seconds, add a text hint below: "Loading your videos..."
- Never use spinners for page-level loads. Only for inline actions (button clicks, form submissions)

### 5.2 Progress Indicators

For video rendering (long operation):

```tsx
<div className="rounded-xl border border-border-light bg-white p-6">
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 rounded-lg bg-primary-bg flex items-center justify-center">
      <Film size={20} className="text-primary" />
    </div>
    <div>
      <p className="text-sm font-semibold text-text">Rendering: Morning Routine Tips</p>
      <p className="text-xs text-text-muted">Scene 3 of 7 — Generating narration...</p>
    </div>
  </div>
  <div className="h-2 bg-surface rounded-full overflow-hidden">
    <div className="h-full bg-gradient-to-r from-primary via-accent to-secondary rounded-full transition-all duration-500" style={{ width: '42%' }} />
  </div>
  <div className="flex justify-between mt-2 text-xs text-text-muted">
    <span>42% complete</span>
    <span>~2 min remaining</span>
  </div>
</div>
```

**Rendering progress bar uses the brand gradient** — this is a signature visual.

---

## 6. EMPTY STATES

Every list, grid, table, and content area needs a designed empty state.

**Structure:**
1. Illustration or icon (48px, muted color or brand gradient)
2. Headline (16px, semibold) — what's missing
3. Description (13px, text-secondary) — why + what to do
4. CTA button — the obvious next action

```tsx
// Example: No videos yet
<div className="flex flex-col items-center justify-center py-20 text-center">
  <div className="w-16 h-16 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
    <Film size={28} className="text-primary" />
  </div>
  <h3 className="text-base font-semibold text-text mb-1">No videos yet</h3>
  <p className="text-sm text-text-secondary max-w-[320px] mb-4">
    Create your first AI-powered video in minutes. Start with a script or let AI generate one.
  </p>
  <button className="btn-primary">🎬 Create First Video</button>
</div>
```

**Empty state copy for each section:**

| Section | Headline | Description | CTA |
|---------|----------|-------------|-----|
| My Videos | No videos yet | Create your first AI-powered video in minutes | 🎬 Create First Video |
| Schedule | Nothing scheduled | Plan your content calendar. Schedule posts to publish automatically. | 📅 Schedule a Post |
| Analytics | No data yet | Publish videos and connect accounts to see your analytics | 🔗 Connect Accounts |
| Remix Hub | No remixes yet | Turn any content into multi-platform posts and video scripts | ✦ Start First Remix |
| AI Writer | No documents yet | Generate blog posts, captions, emails, and more with AI | ✍️ Start Writing |
| Ideas | Start exploring | Search any topic to find trending content ideas across platforms | 💡 Search Ideas |
| Team | Just you for now | Invite team members to collaborate on videos and content | 👥 Invite Team |
| Notifications | All caught up | You'll see updates about renders, publishes, and team activity here | — |

---

## 7. PAGE-BY-PAGE INTERACTION SPEC

### 7.1 Dashboard

**Layout:** Stats row (4 cards) → Quick actions row → Recent videos grid (3 col) → Upcoming schedule list

**Stats cards:**
- Total Videos (number + "this month" subtext)
- Scheduled Posts (number + green dot if any are today)
- Total Views (number + % change from last period with colored arrow)
- Render Queue (number with animated pulse if > 0)

**Quick actions:** 3 buttons — "New Video" (primary), "New Remix" (accent), "Find Ideas" (ghost)

**Recent videos:** Top 6 videos, each with thumbnail, title, status badge, creation date. "View All →" link.

**Upcoming schedule:** Next 5 scheduled posts with platform icon, title, scheduled time, countdown ("in 2 hours"). "View Calendar →" link.

### 7.2 Video Generator (Faceless)

**Layout:** Left panel (60%) = script editor. Right panel (40%) = preview + settings.

**Flow:** Step indicator at top (1. Script → 2. Visuals → 3. Voice → 4. Style → 5. Generate)

Step 1 — Script:
- Large textarea for script OR "Generate with AI" button
- AI generation: slide-down form with topic, tone selector, length selector
- Script auto-parses into scenes (split on paragraph breaks or `---`)
- Each scene shown as a draggable card with narration text + visual prompt field
- Scene duration auto-estimated from word count

Step 2 — Visuals:
- For each scene, show visual prompt + "Generate Image" button
- Generated images shown as thumbnails with regenerate/replace/upload options
- Ken Burns direction selector (zoom in/out/pan left/right)
- Style mode selector: AI Visuals, Stock Footage, Upload Your Own

Step 3 — Voice:
- Voice preset grid (card per voice with play button, name, gender, tone tags)
- Cloned voices section (if any)
- Speed slider (0.75x – 1.5x)
- Preview: click any scene to hear TTS preview

Step 4 — Style:
- Subtitle style selector (8 presets shown as visual thumbnails)
- Background music (optional) — browse/upload/none
- Aspect ratio selector (9:16, 16:9, 1:1 as visual cards)
- Transition style (crossfade/cut/slide)

Step 5 — Generate:
- Summary card showing all settings
- "Generate Video" big primary button
- On click: render progress overlay (see section 5.2)
- On complete: confetti micro-animation + "View Video" CTA

### 7.3 Content Remix Hub

**Layout:** Wizard flow (3 steps)

Step 1 — Add Sources:
- Drop zone for files (PDF, audio) with `border-2 border-dashed border-border hover:border-primary`
- URL input with paste detection → auto-classify (YouTube/TikTok/article)
- Text input tab for raw paste
- Each added source shows as a card with title, type icon, word count, remove button
- Max 10 sources per remix

Step 2 — Select Platforms:
- Checkbox grid of 9 platforms, each as a card with platform icon, name, and description of output format
- "Select All" / "Deselect All" buttons
- Custom instructions textarea: "Any special instructions for the AI?"
- Brand voice dropdown (if saved)

Step 3 — Results:
- Tab bar with one tab per selected platform
- Each tab shows the generated content in an editable rich text area
- Action bar per tab: Copy, Schedule, Publish, Edit, Regenerate
- Video Script tab: special view with scene cards + "→ Send to Video Generator" button (accent)
- Saving: Auto-saves every edit to remix_outputs table

### 7.4 Calendar / Schedule

- Monthly calendar grid view (default)
- Scheduled posts shown as colored dots on dates (color = platform)
- Click date → side panel showing all posts for that date
- Drag-and-drop to reschedule posts between dates
- "Bulk Schedule" button → upload CSV modal
- Platform filter bar at top

### 7.5 Analytics

- Date range selector (preset: 7d, 30d, 90d, custom)
- Top stats: Views, Engagement Rate, Top Platform, Best Performing Video
- Chart area: Line chart for views over time (all platforms overlaid)
- Per-video breakdown table: sortable by views, likes, shares, CTR
- Platform breakdown: horizontal bar chart
- "Export PDF" / "Export CSV" buttons

---

## 8. MICRO-INTERACTIONS & ANIMATION

### 8.1 Timing Standards

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button hover | 150ms | `ease-out` |
| Button active (press) | 100ms | `ease-in` — `scale(0.98)` |
| Card hover | 200ms | `ease-out` |
| Sidebar expand/collapse | 200ms | `ease-in-out` |
| Modal enter | 200ms | `ease-out` — fade + scale from 0.95 |
| Modal exit | 150ms | `ease-in` — fade + scale to 0.95 |
| Toast enter | 200ms | `ease-out` — slide-up from 8px |
| Toast exit | 150ms | `ease-in` — fade |
| Tab switch | 0ms (instant content swap) | underline slides with 200ms `ease-out` |
| Dropdown open | 150ms | `ease-out` — scale-y from 0.95 + fade |
| Page transition | None | Instant (SPA, no page transition animations) |

### 8.2 Signature Animations

1. **Render progress bar** — Gradient animation using brand colors (turquoise → mauve → green) flowing left-to-right
2. **AI generating shimmer** — When AI is processing (script gen, remix gen), show a shimmer animation on the output area: `background: linear-gradient(90deg, transparent, rgba(243,166,255,0.08), transparent)` sweeping left to right
3. **Publish celebration** — On successful publish: small confetti burst (12 particles, brand colors, 1.5s duration)
4. **Voice preview waveform** — Animated waveform bars (5 bars, staggered height animation) when audio is playing
5. **Sidebar active indicator** — The `border-right` on the active nav item slides vertically to follow selection (200ms ease)

### 8.3 Hover Behaviors

- **Video thumbnail card**: On hover, show play icon overlay (centered, semi-transparent black bg circle) + shift thumbnail slightly up (transform: translateY(-2px))
- **Avatar preset card**: On hover, subtle zoom on face image (scale 1.05, overflow hidden)
- **Social platform card**: On hover, platform brand color fills the border
- **Table rows**: On hover, `bg-surface` background

---

## 9. DARK MODE

Toggle via user avatar dropdown. Stored in localStorage + CSS class on `<html>`.

**Swap map:**
| Token | Light | Dark |
|-------|-------|------|
| Background | `#FFFFFF` | `#171717` |
| Surface | `#F6F8FA` | `#1E1E1E` |
| Card bg | `#FFFFFF` | `#232323` |
| Border | `#E8EAED` | `#333333` |
| Text primary | `#171717` | `#E0E0E0` |
| Text secondary | `#636E7B` | `#9CA3AF` |
| Text muted | `#8B949E` | `#6B7280` |
| Input bg | `#F6F8FA` | `#1E1E1E` |

**Brand colors stay the same in dark mode.** Turquoise, green, and mauve are vibrant enough to work on dark backgrounds.

Badge backgrounds become 15% opacity: `bg-primary/15 text-primary`, `bg-secondary/15 text-secondary`, `bg-accent/15 text-accent`.

---

## 10. ACCESSIBILITY

- All interactive elements: `min-h-[36px] min-w-[36px]` touch targets
- Focus rings: `focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2`
- Color contrast: All text meets WCAG AA (4.5:1 ratio minimum)
- Keyboard navigation: Tab through all interactive elements, Enter to activate, Escape to close modals/dropdowns
- Screen reader: Use semantic HTML (`<nav>`, `<main>`, `<section>`, `<article>`), ARIA labels on icon-only buttons
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables all non-essential animation

---

## 11. ONBOARDING FLOW

### First Login — Welcome Wizard (4 steps, full-screen overlay)

**Step 1 — Welcome:**
- Animated logo (brand gradient)
- "Welcome to Contentine Create"
- "Create unlimited AI-powered videos, repurpose content, and publish everywhere."
- "Get Started →" button

**Step 2 — What do you create?** (multi-select cards)
- Options: Short-form Video, Long-form Video, Social Posts, Podcasts, Educational Content, Marketing, Other
- Minimum 1 selection
- Icons + labels, not text-heavy

**Step 3 — Connect platforms** (optional, skip button visible)
- Grid of 7 platform cards with "Connect" buttons
- Each shows auth flow on click
- Skip button clearly visible: "I'll do this later"

**Step 4 — First action** (3 choices as large illustration cards)
- "🎬 Create a Video" → routes to /create/faceless
- "✦ Remix Content" → routes to /remix
- "💡 Explore Ideas" → routes to /discover

### Feature Tooltips (Progressive Disclosure)

After onboarding, on first visit to each section, show a 3-5 step tooltip tour:
- Tooltip: Dark bg, white text, 12px body, step indicator (1/4), "Next" button, "Skip tour" link
- Anchored to specific UI elements with arrow pointer
- Stored in localStorage: `tooltip_${feature}_completed`
- Features with tours: video-generator, remix-hub, scheduler, analytics, ai-writer

### Trial Banner

During free trial, show a persistent but dismissible banner below the top bar:
```tsx
<div className="bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-between">
  <p className="text-sm text-text">
    <span className="font-medium">Free trial:</span> 5 days left · 3 of 10 videos used
  </p>
  <button className="text-sm font-medium text-primary hover:underline">Upgrade →</button>
</div>
```

---

## 12. RESPONSIVE DESIGN PATTERNS

### Mobile (< 768px)
- Sidebar: Hidden, accessible via hamburger icon (top-left). Slides in as overlay.
- Cards: Single column, full width
- Video editor: Script panel full-width, settings accessible via bottom sheet
- Calendar: List view by default (no grid)
- Tables: Horizontal scroll OR collapse into card layout
- Action buttons: Sticky bottom bar for primary actions

### Tablet (768-1024px)  
- Sidebar: Icons only (w-16), expands on hover
- Cards: 2-column grid
- Video editor: Script 55% / Preview 45%
- Modals: Slightly smaller, more padding

---

## 13. FILE NAMING & COMPONENT STRUCTURE

```
components/
  ui/              ← Reusable atoms: Button, Input, Badge, Avatar, Tooltip, Toast, Modal, Skeleton
  shared/          ← Layout pieces: Sidebar, TopBar, PageHeader, EmptyState, TrialBanner
  dashboard/       ← Dashboard-specific widgets: StatsCard, RecentVideos, UpcomingSchedule
  video-generator/ ← Step components: ScriptEditor, VisualPanel, VoiceSelector, StylePicker
  editor/          ← Canvas editor components: Timeline, SceneCard, PropertyPanel
  remix/           ← Remix Hub: SourcePanel, PlatformSelector, OutputTabs, OutputEditor
  avatar/          ← AvatarGrid, AvatarCard, CharacterManager
  scheduler/       ← CalendarGrid, ScheduleCard, BulkUploadModal
  analytics/       ← StatsRow, ViewsChart, PlatformBreakdown, VideoTable
```

**Component rules:**
- One component per file. File name = component name in PascalCase.
- Props type defined above the component in the same file.
- All components accept `className` prop for composition.
- Default export only.
- No inline styles. Tailwind only.
- Extract repeated class strings into `globals.css` @layer components.

---

## 14. FINAL CHECKLIST — BEFORE SHIPPING ANY PAGE

- [ ] Every interactive element has hover, active, focus, and disabled states
- [ ] Loading state uses skeleton loaders matching the real layout
- [ ] Empty state has icon + headline + description + CTA
- [ ] Error state shows what went wrong + what to do
- [ ] Success state confirms what happened
- [ ] All text is real (no "Lorem ipsum")
- [ ] Page works at 768px, 1024px, and 1440px widths
- [ ] Dark mode looks correct
- [ ] No horizontal scrollbar at any breakpoint
- [ ] Primary CTA is visually the most prominent element
- [ ] Tab/keyboard navigation works
- [ ] Brand gradient appears somewhere signature (progress bar, logo, section accent)
