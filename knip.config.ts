import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

export default {
  ...analyze,
  entry: [
    "src/index.ts",
    "src/integrations/react/index.ts",
    "src/adapters/vite/index.ts",
    "src/adapters/next/index.ts",
  ],
  ignoreDependencies: ["tailwindcss"],
  project: ["src/**/*.ts"],
} satisfies KnipConfig
