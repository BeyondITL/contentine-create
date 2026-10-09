import { test, expect } from '@playwright/test';

/**
 * R5 · F-50 — Billing & usage page: honest states on a fresh, backend-less profile.
 *
 * The static export ships with NO PHP backend and NO Stripe network in this
 * environment, so every `/credits/*` call fails and the credit store falls back
 * to its localStorage-first defaults (credit-store.ts). That is exactly the
 * honest condition R5 must prove: the page shows a real balance card, a genuinely
 * EMPTY spend ledger (no fabricated transaction rows, Law L1), and a purchase
 * modal that renders its honest disclosure with ZERO fabricated credit packs when
 * the packs endpoint is unreachable.
 *
 * The authoritative metered-charge path (server-side CreditService.deductForFeature
 * + Stripe Checkout redirect) is STAGING-GATED — see reports/R5-e2e.md. Here we
 * prove the browser-native surface and the honest no-backend fallbacks only, with
 * no mocks.
 */

/** Emoji sweep — the brand is Lucide-only (no emoji in UI). */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

test('billing: honest balance card + empty ledger, no fabricated rows, Lucide-only', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/billing');

  // Real page, not a skeleton or crash.
  await expect(page.getByRole('heading', { name: 'Billing & usage' })).toBeVisible({ timeout: 20_000 });

  // ── Balance card ──────────────────────────────────────────────────────────
  // Offline, fetchBalance() throws → the store uses its localStorage default
  // (DEFAULT_BALANCE = 1000). That is the honest offline fallback, NOT a value
  // fabricated as if it came from the backend.
  await expect(page.getByText('Credit balance', { exact: true })).toBeVisible();
  await expect(page.getByText('1,000', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get credits' })).toBeVisible();
  // The metering disclosure is the honest promise, present regardless of backend.
  await expect(
    page.getByText(
      'On-device generation is never metered. Only hosted models spend credits, and failed jobs are auto-refunded.',
    ),
  ).toBeVisible();

  // ── Spend ledger: honest EMPTY state, no fabricated rows ───────────────────
  await expect(page.getByText('Spend history', { exact: true })).toBeVisible();
  await expect(page.getByText('No transactions yet', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Credit top-ups, usage, and refunds will appear here once you run a metered job.'),
  ).toBeVisible();
  // The ledger renders a <ul> of rows ONLY when transactions exist; offline there
  // are none, so there must be zero ledger list items (no invented history).
  await expect(page.locator('ul li')).toHaveCount(0);

  // ── Lucide-only + no crash ─────────────────────────────────────────────────
  const bodyText = await page.locator('body').innerText();
  expect(bodyText, 'billing page must contain no emoji (Lucide-only brand)').not.toMatch(EMOJI);
  expect(pageErrors, 'no uncaught page errors').toEqual([]);
});

test('billing: Get-credits modal renders honest quote plumbing (no fabricated packs)', async ({ page }) => {
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Billing & usage' })).toBeVisible({ timeout: 20_000 });

  // Open the purchase / credit-quote modal (BuyCreditsModal — the surface that
  // renders <CreditQuote/> and the credit packs the metering gate would sell).
  await page.getByRole('button', { name: 'Get credits' }).click();

  // Modal renders with its honest header + the on-device-is-free disclosure.
  await expect(page.getByRole('heading', { name: 'Get More Credits' })).toBeVisible();
  await expect(page.getByText('On-device creation is unlimited')).toBeVisible();
  await expect(
    page.getByText(
      'Browser-native generation never uses credits. Credits apply only to hosted AI like real avatars and cloud voices.',
    ),
  ).toBeVisible();

  // Packs come from GET /credits/packs — unreachable here, so the store holds an
  // empty pack list. The modal must therefore show NO purchasable packs rather
  // than fabricating any (Law L1): zero "Buy" buttons in the pack list.
  await expect(page.getByRole('button', { name: /^Buy$/ })).toHaveCount(0);
});
