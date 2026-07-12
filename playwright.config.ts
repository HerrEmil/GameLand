import { defineConfig, devices } from "@playwright/test";

// GameLand is a screen state-machine shell. `npm run build` copies the site to
// dist/ (content-hashing large assets), and dist/ is exactly what deploys to S3.
// The harness builds first and serves dist/ so the playtest exercises the real
// deployed artifact, not the unhashed source tree.
const PORT = 5052;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/playtest",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run build && node tests/playtest/static-server.mjs dist ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
