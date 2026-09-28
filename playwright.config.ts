import { defineConfig, devices } from "@playwright/test";

// e2e 一律跑 production build 加 mock LLM，用獨立 port，避免沿用使用者開著的 dev server。
export default defineConfig({
  testDir: "e2e",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start -p 3100",
    port: 3100,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { LLM_MOCK: "1" },
  },
});
