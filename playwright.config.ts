import { defineConfig, devices } from "@playwright/test";

/**
 * Two e2e suites share this config:
 *
 * - "web-demo" (apps/web/e2e): the original demo-mode web specs; they mock
 *   every API call with page.route and only need the web server.
 * - "dispatch" (tests/e2e, tagged @dispatch): drive the real API in
 *   DEMO_MODE with the deterministic mock call backend (CALL_BACKEND=mock).
 *
 * Both servers boot for every run: the API on 8180 (demo mode, mock
 * backend) and web on 3180 (demo mode, /api rewrites pointed at the test
 * API). See tests/e2e/README.md for the startup details. The commands use
 * `bash -c` (not a login shell) so they inherit the Node/pnpm PATH of the
 * process that launched Playwright.
 */

const WEB_PORT = 3180;
const API_PORT = 8180;

export default defineConfig({
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `bash -c "DEMO_MODE=true CALL_BACKEND=mock PORT=${API_PORT} pnpm --filter api dev"`,
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `bash -c "PORT=${WEB_PORT} NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_API_URL=http://127.0.0.1:${API_PORT} BACKEND_URL=http://127.0.0.1:${API_PORT} pnpm --filter web dev -- --port ${WEB_PORT}"`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "web-demo",
      testDir: "./apps/web/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "dispatch",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
