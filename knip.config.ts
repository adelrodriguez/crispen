import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

export default {
  ...analyze,
  ignoreDependencies: [...ignoreDependencies.monorepo, "tailwindcss"],
  project: ["src/**/*.ts"],
} satisfies KnipConfig
