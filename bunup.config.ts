import { defineConfig } from "bunup"

export default defineConfig({
  dts: true,
  entry: [
    "src/index.ts",
    "src/integrations/react/index.ts",
    "src/adapters/vite/index.ts",
    "src/adapters/next/index.ts",
  ],
  format: "esm",
  outDir: "dist",
  sourcemap: true,
  target: "node",
})
