import core from "adamantite/lint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ".packref/**",
    "examples/*/.next/**",
    "examples/*/out/**",
    "examples/*/builds/**",
    "tests/package-contract/**",
  ],
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
})
