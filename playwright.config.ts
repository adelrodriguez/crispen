import { defineConfig } from "@playwright/test"

export default defineConfig({
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "vite-react",
      use: { baseURL: "http://127.0.0.1:4173" },
    },
    {
      name: "nextjs",
      use: { baseURL: "http://127.0.0.1:4174" },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "bun scripts/static-server.ts --root examples/vite-react/serve --port 4173 --spa-fallback",
      reuseExistingServer: false,
      url: "http://127.0.0.1:4173/__health",
    },
    {
      command:
        "bun scripts/static-server.ts --root examples/nextjs/serve --port 4174 --spa-fallback",
      reuseExistingServer: false,
      url: "http://127.0.0.1:4174/__health",
    },
  ],
  workers: 1,
})
