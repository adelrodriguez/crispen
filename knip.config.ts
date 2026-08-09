import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

export default {
  ...analyze,
  project: ["src/**/*.ts"],
} satisfies KnipConfig
