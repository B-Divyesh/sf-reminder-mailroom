import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173", browserName: "chromium" },
  webServer: {
    command: "npm run build:site && npx vite preview --config vite.site.config.ts --host 127.0.0.1",
    port: 4173,
    reuseExistingServer: true
  }
});
