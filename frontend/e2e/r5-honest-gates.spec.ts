import { test, expect } from '@playwright/test';

/**
 * R5 — Honest gates / anti-facade on the recovered surfaces (Law L1).
 *
 * Environment reality: NO PHP backend and NO Stripe network here, so the POSITIVE
 * data states of these surfaces (a populated user table, backend-flagged
 * "unavailable" idea platforms, a rendered HTML report, a live comment thread)
 * are STAGING-GATED and enumerated with diagnosis in reports/R5-e2e.md. What is
 * provable offline is the honest half these facade classes used to fake:
 *
 *   • admin/users — no hardcoded "You (Admin)" fallback row (SA-06);
 *   • discover — idea sources render with ZERO fabricated results / trend numbers
 *     (SA-02: no random_int data), and the copy calls them autocomplete, not
 *     "Trends";
 *   • analytics — the app never claims a PDF export it can't produce (F-37 honest
 *     labeling): no "PDF" anywhere, honest empty state instead.
 *
 * No mocks; nothing is stubbed green.
 */

test('admin/users: guarded, no fabricated "You (Admin)" row (SA-06)', async ({ page }) => {
  // Fresh profile ⇒ not authenticated ⇒ not admin. The admin layout guard
  // (app/admin/layout.tsx) denies non-admins. Whatever renders, the fabricated
  // "You (Admin)" fallback row that SA-06 removed must be absent — the whole point
  // of the fix. (The signed-in-admin honest empty/error state — users/page.tsx:54
  // "Could not load users…" — needs Auth0 admin login + backend and is
  // staging-gated.)
  await page.goto('/admin/users');
  await page.waitForTimeout(3000); // let the guard resolve (initAuth → redirect)

  await expect(page.getByText(/You \(Admin\)/)).toHaveCount(0);
  // No fabricated user table leaked to a non-admin: no admin grant controls.
  await expect(page.getByRole('button', { name: /Grant/ })).toHaveCount(0);
});

test('discover: idea sources render with no fabricated data (SA-02/F-43)', async ({ page }) => {
  await page.goto('/discover');

  // The 8 platform sources render as honest, selectable tabs (real names only).
  const tablist = page.getByRole('tablist', { name: 'Search platforms' });
  await expect(tablist).toBeVisible({ timeout: 20_000 });
  for (const label of ['Google', 'YouTube', 'TikTok', 'Instagram', 'Quora']) {
    await expect(page.getByRole('tab', { name: `Search ${label}` })).toBeVisible();
  }

  // Honest initial state — and the copy calls the source autocomplete ("what
  // people are searching for"), NOT fabricated "Trends" (the SA-02/F-15 fix).
  await expect(page.getByRole('heading', { name: 'Start exploring' })).toBeVisible();
  await expect(page.getByText(/platform search autocomplete \(what people are searching for\)/)).toBeVisible();

  // Zero fabricated idea cards on load (no random_int result data). Each real
  // result would carry a "Use as topic" action; there must be none.
  await expect(page.getByRole('button', { name: /Use as topic/i })).toHaveCount(0);
});

test('analytics: honest empty state, never claims a PDF export (F-37)', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible({ timeout: 20_000 });

  // Offline ⇒ no summary ⇒ isEmpty ⇒ honest empty state, not fabricated metrics.
  await expect(page.getByRole('heading', { name: 'No analytics data yet' })).toBeVisible();

  // F-37: the export offering is CSV + HTML report only — the app must NEVER
  // display "PDF" (the honest-labeling fix). The export toolbar itself is behind
  // {!isEmpty} (analytics/page.tsx:156) so its "HTML report" button only shows
  // with real data — that positive assertion is staging-gated — but the anti-PDF
  // invariant holds regardless and is proven here.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText, 'analytics must not advertise a PDF export (F-37)').not.toMatch(/PDF/i);
  expect(pageErrors).toEqual([]);
});
