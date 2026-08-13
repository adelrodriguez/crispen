import { defineConfig } from "bunup"

export default defineConfig({
  define: {
    "process.env.NODE_ENV": "process.env.NODE_ENV",
  },
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
  target: "browser",
})
