import { resolve } from "node:path"
import { activateBuild } from "./deployment-files"
import { buildExample, buildPackage } from "./example-build"

const exampleRoot = resolve("examples/vite-react")
await buildPackage()
const output = await buildExample("vite-react", "A")
await activateBuild(exampleRoot, output)

const url = "http://127.0.0.1:4173/?seam=1"
const opener =
  process.platform === "darwin"
    ? ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", url]
      : ["xdg-open", url]

Bun.spawn(opener, { stderr: "ignore", stdout: "ignore" })
const server = Bun.spawn(
  ["bun", "scripts/static-server.ts", "--root", "examples/vite-react/serve"],
  { stderr: "inherit", stdout: "inherit" }
)
await server.exited
