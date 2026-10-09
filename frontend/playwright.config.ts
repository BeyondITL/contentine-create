import { defineConfig } from '@playwright/test';

/**
 * Contentine Create — E2E against the REAL static export (`next build` → out/),
 * served with the same COOP/COEP headers production ships (SharedArrayBuffer,
 * cross-origin isolation), driving real engines against the real HF/MLC CDN.
 * No mocks anywhere (Law L1) — model downloads are live, so timeouts are long.
 *
 * Run: npm run build && npx playwright test [--grep @quick]
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preflight.ts', // fail fast if a referenced build asset is missing from out/
  timeout: 60 * 60 * 1000, // model downloads + GPU compile are real
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1, // engines share GPU + network; serialize
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8321',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--use-angle=metal', // real GPU (Metal) in headless on macOS
        '--enable-features=Vulkan',
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },
  webServer: {
    command: 'node e2e/serve.mjs 8321',
    url: 'http://127.0.0.1:8321',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
