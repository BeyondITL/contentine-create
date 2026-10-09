import { test, expect } from '@playwright/test';

/**
 * R3 · D-55 — Dashboard structure + honest empty states on a fresh profile.
 *
 * On the static export there is no backend, so every dashboard API call returns
 * the SPA fallback (no data) — exactly the "brand-new user" condition. We assert
 * the spec's furniture is present and that the empty states are HONEST (no
 * fabricated counts, no placeholder rows):
 *  - 4 stat tiles (Videos created / Scheduled / Total views / Models ready)
 *  - quick-action cards (see divergence note below)
 *  - Recent videos section with a real "No videos yet." empty state
 *  - Upcoming (scheduled) section with a real "Nothing scheduled." empty state
 *
 * DIVERGENCE (recorded, not failed): D-55 as written says "3 quick actions".
 * The shipped dashboard renders 4 quick-action cards — an operator-ratified
 * divergence documented in app/page.tsx ("4 quick actions kept as a deliberate
 * D-55 divergence"). This test asserts the real, shipped set of 4 rather than
 * pretending the spec's 3; each is a genuine feature link, so it is not a facade.
 *
 * Default (ephemeral) profile ⇒ no models downloaded ⇒ Kokoro not ready ⇒ the
 * first quick action is "Set Up AI Models". No model download in the fast lane.
 */
test('dashboard: 4 stat tiles, quick actions, and honest empty sections', async ({ page }) => {
  await page.goto('/');

  // Skeleton → loaded. The heading is the real dashboard, not the skeleton.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

  // ── 4 stat tiles ─────────────────────────────────────────────────────────
  for (const label of ['Videos created', 'Scheduled', 'Total views', 'Models ready']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // ── Quick actions (real shipped set = 4; operator-ratified D-55 divergence) ─
  // Identify each quick-action card by its unique description text (the titles
  // like "AI Writer" also appear in the Creative Tools list, so title-only
  // matching would be ambiguous). Fresh profile ⇒ first action is "Set Up AI".
  const quickActionDescs = [
    'Download Kokoro TTS to start', // Set Up AI Models
    'Script + voice + on-device render', // Cartoon Video
    'Search ideas across 8 platforms', // Discover Ideas
    'Scripts, posts, and hooks', // AI Writer
  ];
  for (const desc of quickActionDescs) {
    await expect(page.getByText(desc)).toBeVisible();
  }

  // ── Recent videos: honest empty state, no fabricated rows ─────────────────
  await expect(page.getByText('Recent videos', { exact: true })).toBeVisible();
  await expect(page.getByText('No videos yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Create your first video/ })).toBeVisible();

  // ── Upcoming scheduled: honest empty state ────────────────────────────────
  await expect(page.getByText('Upcoming', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing scheduled.')).toBeVisible();

  // Fresh profile ⇒ Kokoro not downloaded ⇒ the AI Model Status card reports
  // an honest "0 of N models ready" rather than a fabricated ready count.
  await expect(page.getByText(/\b0 of \d+ models ready\b/)).toBeVisible();
});
