import { rename, rm, symlink } from "node:fs/promises"
import { basename, join } from "node:path"

export async function activateBuild(exampleRoot: string, buildDirectory: string): Promise<void> {
  const serve = join(exampleRoot, "serve")
  const temporaryLink = join(exampleRoot, `.serve-${crypto.randomUUID()}`)
  const relativeTarget = join("builds", basename(buildDirectory))

  await symlink(relativeTarget, temporaryLink, "dir")
  try {
    await rename(temporaryLink, serve)
  } catch (error) {
    if (!isReplaceError(error)) {
      await rm(temporaryLink, { force: true })
      throw error
    }
    await rm(serve, { force: true })
    await rename(temporaryLink, serve)
  }
}

function isReplaceError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false
  }
  return error.code === "EEXIST" || error.code === "ENOTEMPTY"
}
