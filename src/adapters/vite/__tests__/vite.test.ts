import { afterEach, describe, expect, it } from "bun:test"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build, createServer } from "vite"
import { parseDescriptor } from "../../../lib/protocol"
import { crispen } from "../index"

const temporaryDirectories: string[] = []
const deploymentEnvironmentVariables = [
  "GIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "GITHUB_SHA",
] as const
const originalEnvironment = new Map(
  deploymentEnvironmentVariables.map((key) => [key, process.env[key]])
)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
})

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "crispen-vite-"))
  temporaryDirectories.push(root)
  await Bun.write(
    join(root, "index.html"),
    '<!doctype html><html><head><title>Fixture</title></head><body><script type="module" src="/main.js"></script></body></html>'
  )
  await Bun.write(join(root, "main.js"), 'document.body.dataset.loaded = "true"')
  return root
}

async function buildFixture(
  options: Parameters<typeof crispen>[0]
): Promise<{ descriptor: string; html: string; root: string }> {
  const root = await createFixture()
  await build({
    logLevel: "silent",
    plugins: [crispen(options)],
    root,
  })

  return {
    descriptor: await readFile(join(root, "dist/_crispen/deployment.json"), "utf8"),
    html: await readFile(join(root, "dist/index.html"), "utf8"),
    root,
  }
}

describe("Vite adapter", () => {
  it("embeds the running deployment and emits its descriptor", async () => {
    const { descriptor, html } = await buildFixture({ deploymentId: "A" })

    expect(html).toContain('<script>globalThis.__CRISPEN__={"v":1,"running":{"id":"A"')
    expect(parseDescriptor(descriptor).id).toBe("A")
  })

  it("prefers an explicit id, then the documented CI environment order", async () => {
    process.env.GIT_SHA = "git"
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel"
    process.env.CF_PAGES_COMMIT_SHA = "cloudflare"
    process.env.GITHUB_SHA = "github"

    const explicit = await buildFixture({ deploymentId: "explicit" })
    expect(parseDescriptor(explicit.descriptor).id).toBe("explicit")

    const git = await buildFixture({})
    expect(parseDescriptor(git.descriptor).id).toBe("git")

    delete process.env.GIT_SHA
    const vercel = await buildFixture({})
    expect(parseDescriptor(vercel.descriptor).id).toBe("vercel")

    delete process.env.VERCEL_GIT_COMMIT_SHA
    const cloudflare = await buildFixture({})
    expect(parseDescriptor(cloudflare.descriptor).id).toBe("cloudflare")

    delete process.env.CF_PAGES_COMMIT_SHA
    const github = await buildFixture({})
    expect(parseDescriptor(github.descriptor).id).toBe("github")

    delete process.env.GITHUB_SHA
    const random = await buildFixture({})
    expect(parseDescriptor(random.descriptor).id).toMatch(/^[\da-f-]{36}$/u)
  })

  it("escapes the embed for an HTML script context", async () => {
    const { html } = await buildFixture({
      deploymentId: "</script>\u2028\u2029",
    })

    expect(html).toContain('"id":"\\u003c/script>\\u2028\\u2029"')
    expect(html).not.toContain('"id":"</script>')
  })

  it("points to an external endpoint without emitting a local descriptor", async () => {
    const root = await createFixture()
    await build({
      logLevel: "silent",
      plugins: [
        crispen({
          deploymentId: "A",
          endpoint: "https://control.example/deployment.json",
        }),
      ],
      root,
    })
    const html = await readFile(join(root, "dist/index.html"), "utf8")

    expect(html).toContain("https://control.example/deployment.json")
    let descriptorExists = true
    try {
      await access(join(root, "dist/_crispen/deployment.json"))
    } catch {
      descriptorExists = false
    }
    expect(descriptorExists).toBe(false)
  })

  it("does not inject an embed during Vite development", async () => {
    const root = await createFixture()
    const server = await createServer({
      logLevel: "silent",
      plugins: [crispen({ deploymentId: "A" })],
      root,
      server: { middlewareMode: true },
    })
    const source = await readFile(join(root, "index.html"), "utf8")

    const html = await server.transformIndexHtml("/", source)
    await server.close()

    expect(html).not.toContain("__CRISPEN__")
  })
})
