import { spawn } from "node:child_process"
import { cp, mkdir, rename, rm, stat } from "node:fs/promises"
import { join, resolve as resolvePath } from "node:path"

export type ExampleName = "nextjs" | "vite-react"

export const EXAMPLES: ExampleName[] = ["vite-react", "nextjs"]

export async function buildPackage(): Promise<void> {
  await run(["bun", "run", "build"], process.cwd())
}

export async function buildExample(example: ExampleName, id: string): Promise<string> {
  const exampleRoot = resolvePath("examples", example)
  const output = join(exampleRoot, "builds", id)
  const staging = join(exampleRoot, "builds", `.${id}-${crypto.randomUUID()}`)
  await mkdir(join(exampleRoot, "builds"), { recursive: true })
  await removeBrokenServeLink(exampleRoot)
  try {
    if (example === "vite-react") {
      await run(["bun", "run", "build"], exampleRoot, {
        CRISPEN_DEPLOYMENT_ID: id,
        CRISPEN_OUT_DIR: staging,
      })
    } else {
      await run(["bun", "run", "build"], exampleRoot, {
        CRISPEN_DEPLOYMENT_ID: id,
      })
      await cp(join(exampleRoot, "out"), staging, { recursive: true })
    }

    await rm(output, { force: true, recursive: true })
    await rename(staging, output)
  } finally {
    await rm(staging, { force: true, recursive: true })
  }

  return output
}

async function removeBrokenServeLink(exampleRoot: string): Promise<void> {
  try {
    await stat(join(exampleRoot, "serve"))
  } catch {
    await rm(join(exampleRoot, "serve"), { force: true })
  }
}

async function run(
  command: string[],
  cwd: string,
  environment: Record<string, string> = {}
): Promise<void> {
  const [executable, ...arguments_] = command
  if (!executable) {
    throw new Error("A build command must include an executable")
  }
  const child = spawn(executable, arguments_, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`)
  }
}
