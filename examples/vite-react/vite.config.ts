import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { crispen } from "../../dist/adapters/vite/index.js"

export default defineConfig({
  build: {
    outDir: process.env.CRISPEN_OUT_DIR ?? "dist",
  },
  plugins: [react(), tailwindcss(), crispen({ deploymentId: process.env.CRISPEN_DEPLOYMENT_ID })],
  resolve: {
    alias: [
      {
        find: "crispen/react",
        replacement: resolve(import.meta.dirname, "../../src/integrations/react/index.ts"),
      },
      { find: "crispen", replacement: resolve(import.meta.dirname, "../../src/index.ts") },
    ],
  },
})
