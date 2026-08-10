import react from "@vitejs/plugin-react"
import { crispen } from "crispen/vite"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    outDir: process.env.CRISPEN_OUT_DIR ?? "dist",
  },
  plugins: [react(), crispen({ deploymentId: process.env.CRISPEN_DEPLOYMENT_ID })],
})
