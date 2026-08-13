const EXPECTED_EXPORTS: Record<string, string[]> = {
  "../dist/adapters/next/index.js": ["CrispenScript", "GET", "crispenPagesHandler", "withCrispen"],
  "../dist/adapters/vite/index.js": ["crispen"],
  "../dist/index.js": [
    "DEFAULT_DESCRIPTOR_ENDPOINT",
    "TargetResolutionError",
    "createDeploymentMonitor",
    "createEmbeddedSource",
    "createHttpSource",
    "createStaticSource",
    "getDefaultMonitor",
    "getMonitor",
    "parseDescriptor",
    "readEmbed",
    "serializeDescriptor",
  ],
  "../dist/integrations/react/index.js": ["useDeploymentStatus"],
}

await Promise.all(
  Object.entries(EXPECTED_EXPORTS).map(async ([specifier, expected]) => {
    const module: Record<string, unknown> = await import(specifier)
    for (const name of expected) {
      if (module[name] === undefined) {
        throw new Error(`Expected ${specifier} to export ${name}`)
      }
    }
  })
)
