import format from "adamantite/format"
import { defineConfig } from "oxfmt"

export default defineConfig({
  ...format,
  ignorePatterns: [".packref/**", "examples/*/next-env.d.ts"],
})
