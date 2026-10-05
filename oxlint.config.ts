import core from "adamantite/lint"
import antislop from "adamantite/lint/antislop"
import nextjs from "adamantite/lint/nextjs"
import node from "adamantite/lint/node"
import react from "adamantite/lint/react"
import reactStrict from "adamantite/lint/react-strict"
import strict from "adamantite/lint/strict"
import vitest from "adamantite/lint/vitest"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, react, reactStrict, nextjs, node, strict, antislop],
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
  overrides: [
    {
      files: ["src/**/__tests__/**"],
      plugins: vitest.plugins,
      rules: {
        ...vitest.rules,
        // The vitest preset enables pairs of rules that contradict each other.
        // Keep one rule of each pair. See adelrodriguez/adamantite#496.
        "vitest/no-importing-vitest-globals": "off",
        "vitest/prefer-called-times": "off",
        "vitest/prefer-describe-function-title": "off",
      },
    },
  ],
  rules: {
    // The React integration is the hook module that consumers call.
    "adamantite/no-react-state-hooks": [
      "error",
      {
        allow: [
          "**/use[A-Z]*.{ts,tsx}",
          "**/use-*.{ts,tsx}",
          "**/hooks/**",
          "src/integrations/react/*.ts",
        ],
      },
    ],
  },
})
