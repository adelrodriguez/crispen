import { rm } from "node:fs/promises"
import { resolve } from "node:path"

const projectRoot = resolve(import.meta.dirname, "..")

await rm(resolve(projectRoot, "dist"), { force: true, recursive: true })
await run("bun", "run", "build")
await run("node", "tests/package-contract/runtime.mjs")
await run("bun", "x", "tsc", "--project", "tests/package-contract/tsconfig.json")

async function run(...command: [string, ...string[]]): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: projectRoot,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
