import { spawn } from "node:child_process"
import { once } from "node:events"
import { resolve } from "node:path"
import { activateBuild } from "./deployment-files.ts"
import { buildExample, buildPackage } from "./example-build.ts"

const exampleRoot = resolve("examples/vite-react")
await buildPackage()
const output = await buildExample("vite-react", "A")
await activateBuild(exampleRoot, output)

const url = "http://127.0.0.1:4173/?seam=1"
const [openCommand, openArguments] =
  process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", url]]
      : ["xdg-open", [url]]

spawn(openCommand, openArguments, { stdio: "ignore" }).on("error", () => {
  // Opening a browser is optional. The server URL is still printed.
})
const server = spawn(
  process.execPath,
  ["scripts/static-server.ts", "--root", "examples/vite-react/serve"],
  { stdio: "inherit" }
)
await once(server, "exit")
