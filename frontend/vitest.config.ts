import { defineConfig } from 'vitest/config';

/**
 * Vitest owns the unit tests under src/. It must NOT collect `e2e/*.spec.ts` —
 * those are Playwright specs (`npm run test:e2e`, playwright.config.ts) and
 * importing @playwright/test under vitest is a collection error, not a test
 * failure. Without this exclude, `npm test` exits non-zero with 20 red files on
 * a clean tree, which makes the unit suite unreadable as a gate: a genuinely
 * failing unit test is indistinguishable from the permanent red. SA-32 added a
 * gate (src/lib/voice-presets.test.ts) that only means something if this suite
 * is green when the code is correct.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'out/**', '.next/**'],
  },
});
