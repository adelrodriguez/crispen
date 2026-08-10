import path from "node:path"
import { withCrispen } from "../../dist/adapters/next/index.js"

const directory = import.meta.dirname
const webpackAliases = {
  crispen: path.resolve(directory, "../../src/index.ts"),
  "crispen/next": path.resolve(directory, "../../src/adapters/next/index.ts"),
  "crispen/react": path.resolve(directory, "../../src/integrations/react/index.ts"),
}

/**
 * @param {{ resolve?: { alias?: Record<string, false | string> } } & Record<string, unknown>} config
 *
 * @returns {{ resolve: { alias: Record<string, false | string> } } & Record<string, unknown>} The
 *   config with Crispen source aliases.
 */
function addWebpackAliases(config) {
  const currentAliases = config.resolve?.alias
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: { ...currentAliases, ...webpackAliases },
    },
  }
}

export default withCrispen(
  {
    experimental: { externalDir: true },
    output: "export",
    turbopack: {
      resolveAlias: {
        crispen: "../../src/index.ts",
        "crispen/next": "../../src/adapters/next/index.ts",
        "crispen/react": "../../src/integrations/react/index.ts",
      },
      root: path.resolve(directory, "../.."),
    },
    webpack: addWebpackAliases,
  },
  { deploymentId: process.env.CRISPEN_DEPLOYMENT_ID }
)
