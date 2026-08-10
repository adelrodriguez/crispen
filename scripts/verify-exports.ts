const entries = [
  ["../dist/index.js", "createDeploymentMonitor"],
  ["../dist/integrations/react/index.js", "useDeploymentStatus"],
  ["../dist/adapters/vite/index.js", "crispen"],
  ["../dist/adapters/next/index.js", "withCrispen"],
] as const

const modules = await Promise.all(
  entries.map(async ([path]) => {
    const module: unknown = await import(path)
    return module
  })
)

for (const [index, [, name]] of entries.entries()) {
  assertExport(modules[index], name)
}

function assertExport(module: unknown, name: string): void {
  if (typeof module !== "object" || module === null || !(name in module)) {
    throw new Error(`Built package entry does not export ${name}.`)
  }
}

const declarationCheck = Bun.spawn(
  [
    "node_modules/.bin/tsc",
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--target",
    "ESNext",
    "--module",
    "Preserve",
    "--moduleResolution",
    "bundler",
    "tests/fixtures/package-exports.ts",
  ],
  { stderr: "inherit", stdout: "inherit" }
)
if ((await declarationCheck.exited) !== 0) {
  throw new Error("Built package declarations failed the consumer type check.")
}

console.info("Verified all four built package entries and declarations.")
