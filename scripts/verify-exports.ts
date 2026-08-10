const [core, react, vite, next] = await Promise.all([
  import("../dist/index.js"),
  import("../dist/integrations/react/index.js"),
  import("../dist/adapters/vite/index.js"),
  import("../dist/adapters/next/index.js"),
])

assertExport(core, "createDeploymentMonitor")
assertExport(react, "useDeploymentStatus")
assertExport(vite, "crispen")
assertExport(next, "withCrispen")

function assertExport(module: object, name: string): void {
  if (!(name in module)) {
    throw new Error(`Built package entry does not export ${name}.`)
  }
}

console.info("Verified all four built package entries.")
