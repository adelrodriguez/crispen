import { spawn } from "node:child_process"
import { rm } from "node:fs/promises"
import { resolve } from "node:path"

const projectRoot = resolve(import.meta.dirname, "..")

await rm(resolve(projectRoot, "dist"), { force: true, recursive: true })
await run("pnpm", "run", "build")
await run("node", "tests/package-contract/runtime.mjs")
await run("pnpm", "exec", "tsc", "--project", "tests/package-contract/tsconfig.json")

async function run(executable: string, ...arguments_: string[]): Promise<void> {
  const child = spawn(executable, arguments_, { cwd: projectRoot, stdio: "inherit" })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  if (exitCode !== 0) {
    process.exit(exitCode ?? 1)
  }
}
