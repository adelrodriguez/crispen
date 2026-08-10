import { describe, expect, it } from "bun:test"
import type { NextApiRequest, NextApiResponse, NextConfig } from "next"
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises"
import { createServer } from "node:net"
import { join } from "node:path"
import { isValidElement } from "react"
import { parseDescriptor } from "../../../lib/protocol"
import { CrispenScript, crispenPagesHandler, GET, withCrispen } from "../index"

function generateUserBuildId(): Promise<string> {
  return Promise.resolve("user-build")
}

describe("Next adapter", () => {
  it("adds Crispen config without replacing user config functions or values", async () => {
    const config: NextConfig = {
      env: { USER_VALUE: "preserved" },
      generateBuildId: generateUserBuildId,
      headers: () =>
        Promise.resolve([
          {
            headers: [{ key: "x-user", value: "preserved" }],
            source: "/user",
          },
        ]),
      reactStrictMode: true,
    }

    const wrapped = withCrispen(config, { deploymentId: "A" })
    const headers = await wrapped.headers?.()

    expect(wrapped.deploymentId).toBeUndefined()
    expect(wrapped.generateBuildId).toBe(generateUserBuildId)
    expect(wrapped.env?.USER_VALUE).toBe("preserved")
    expect(wrapped.reactStrictMode).toBe(true)
    expect(headers).toEqual([
      {
        headers: [{ key: "x-user", value: "preserved" }],
        source: "/user",
      },
      {
        headers: [{ key: "Cache-Control", value: "no-store" }],
        source: "/_crispen/deployment.json",
      },
    ])
  })

  it("does not override the Next deployment id used by Skew Protection", () => {
    const previousDeploymentId = process.env.NEXT_DEPLOYMENT_ID
    process.env.NEXT_DEPLOYMENT_ID = "vercel-deployment"

    try {
      const wrapped = withCrispen({}, { deploymentId: "crispen-deployment" })

      expect(wrapped.deploymentId).toBeUndefined()
    } finally {
      if (previousDeploymentId === undefined) {
        Reflect.deleteProperty(process.env, "NEXT_DEPLOYMENT_ID")
      } else {
        process.env.NEXT_DEPLOYMENT_ID = previousDeploymentId
      }
    }
  })

  it("prefixes the default endpoint with the Next base path", async () => {
    const wrapped = withCrispen({ basePath: "/app" }, { deploymentId: "A" })

    expect(JSON.parse(wrapped.env?.CRISPEN_NEXT_EMBED ?? "{}")).toMatchObject({
      endpoint: "/app/_crispen/deployment.json",
    })
    expect(await wrapped.headers?.()).toContainEqual({
      basePath: false,
      headers: [{ key: "Cache-Control", value: "no-store" }],
      source: "/app/_crispen/deployment.json",
    })
  })

  it("resolves an explicit local endpoint under the Next base path", async () => {
    const wrapped = withCrispen(
      { basePath: "/app" },
      { deploymentId: "A", endpoint: "/descriptor.json" }
    )

    expect(JSON.parse(wrapped.env?.CRISPEN_NEXT_EMBED ?? "{}")).toMatchObject({
      endpoint: "/app/descriptor.json",
    })
    expect(await wrapped.headers?.()).toContainEqual({
      basePath: false,
      headers: [{ key: "Cache-Control", value: "no-store" }],
      source: "/app/descriptor.json",
    })
  })

  it("does not add a base-path override for an empty base path", async () => {
    const wrapped = withCrispen({ basePath: "" }, { deploymentId: "A" })

    expect(await wrapped.headers?.()).toEqual([
      {
        headers: [{ key: "Cache-Control", value: "no-store" }],
        source: "/_crispen/deployment.json",
      },
    ])
  })

  it("keeps an external endpoint unchanged under a Next base path", async () => {
    const wrapped = withCrispen(
      { basePath: "/app" },
      { deploymentId: "A", endpoint: "https://control.example/descriptor.json" }
    )

    expect(JSON.parse(wrapped.env?.CRISPEN_NEXT_EMBED ?? "{}")).toMatchObject({
      endpoint: "https://control.example/descriptor.json",
    })
    expect(await wrapped.headers?.()).toBeUndefined()
  })

  it("renders the embed and serves the matching no-store descriptor", async () => {
    const config = withCrispen({}, { deploymentId: "A" })
    const previousEnvironment = new Map<string, string | undefined>()
    for (const [key, value] of Object.entries(config.env ?? {})) {
      previousEnvironment.set(key, process.env[key])
      process.env[key] = value
    }

    try {
      const script = CrispenScript()
      const response = GET()

      if (
        !isValidElement<{
          readonly dangerouslySetInnerHTML: { readonly __html: string }
        }>(script)
      ) {
        throw new Error("Expected CrispenScript to return a script element")
      }
      const html = script.props.dangerouslySetInnerHTML.__html
      expect(html).toContain("globalThis.__CRISPEN__")
      expect(html).toContain('"id":"A"')
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(await response.json()).toMatchObject({ id: "A", v: 1 })
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key)
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it("serves the descriptor through the Pages Router handler", () => {
    const config = withCrispen({}, { deploymentId: "A" })
    const previousEnvironment = new Map<string, string | undefined>()
    for (const [key, value] of Object.entries(config.env ?? {})) {
      previousEnvironment.set(key, process.env[key])
      process.env[key] = value
    }
    const headers = new Map<string, string>()
    let body = ""
    let status = 0
    const response = {
      end(value: string) {
        body = value
      },
      setHeader(key: string, value: string) {
        headers.set(key, value)
      },
      status(value: number) {
        status = value
        return this
      },
    } as unknown as NextApiResponse

    try {
      crispenPagesHandler({} as NextApiRequest, response)

      expect(status).toBe(200)
      expect(headers.get("Cache-Control")).toBe("no-store")
      expect(JSON.parse(body)).toMatchObject({ id: "A", v: 1 })
    } finally {
      restoreEnvironment(previousEnvironment)
    }
  })

  it("leaves the embed and descriptor inert for next dev", () => {
    process.argv.push("dev")
    try {
      const config = withCrispen({}, { deploymentId: "A" })
      expect(config.env).toMatchObject({
        CRISPEN_NEXT_DESCRIPTOR: "",
        CRISPEN_NEXT_EMBED: "",
      })
    } finally {
      process.argv.pop()
    }
  })

  it("embeds and serves a descriptor from a real Next build", async () => {
    await run(["bun", "run", "build"], process.cwd())
    const root = await mkdtemp(join(process.cwd(), ".next-adapter-test-"))

    try {
      await mkdir(join(root, "app/%5Fcrispen/deployment.json"), {
        recursive: true,
      })
      await mkdir(join(root, "node_modules"), { recursive: true })
      await Promise.all([
        Bun.write(
          join(root, "package.json"),
          '{"name":"next-adapter-fixture","private":true,"type":"module"}'
        ),
        Bun.write(
          join(root, "next.config.mjs"),
          'import { withCrispen } from "crispen/next"\nexport default withCrispen({ basePath: "/app" }, { deploymentId: "A" })\n'
        ),
        Bun.write(
          join(root, "app/layout.tsx"),
          'import { CrispenScript } from "crispen/next"\nexport default function Layout({ children }: { children: React.ReactNode }) { return <html><body><CrispenScript />{children}</body></html> }\n'
        ),
        Bun.write(
          join(root, "app/page.tsx"),
          "export default function Page() { return <main>Fixture</main> }\n"
        ),
        Bun.write(
          join(root, "app/%5Fcrispen/deployment.json/route.ts"),
          'export { GET } from "crispen/next"\nexport const dynamic = "force-static"\n'
        ),
        symlink(process.cwd(), join(root, "node_modules/crispen")),
        symlink(join(process.cwd(), "node_modules/next"), join(root, "node_modules/next")),
        symlink(join(process.cwd(), "node_modules/react"), join(root, "node_modules/react")),
        symlink(
          join(process.cwd(), "node_modules/react-dom"),
          join(root, "node_modules/react-dom")
        ),
      ])

      await run([join(process.cwd(), "node_modules/.bin/next"), "build", "--turbopack"], root)
      const port = await findAvailablePort()
      const server = Bun.spawn(
        [join(process.cwd(), "node_modules/.bin/next"), "start", "--port", String(port)],
        { cwd: root, stderr: "pipe", stdout: "pipe" }
      )

      try {
        await waitForServer(port)
        const [htmlResponse, descriptorResponse] = await Promise.all([
          fetch(`http://127.0.0.1:${port}/app/`),
          fetch(`http://127.0.0.1:${port}/app/_crispen/deployment.json`),
        ])
        const [html, descriptor] = await Promise.all([
          htmlResponse.text(),
          descriptorResponse.text(),
        ])

        expect(html).toContain("globalThis.__CRISPEN__")
        expect(html).toContain('\\"id\\":\\"A\\"')
        expect(html).toContain("/app/_crispen/deployment.json")
        expect(descriptorResponse.headers.get("Cache-Control")).toBe("no-store")
        expect(parseDescriptor(descriptor).id).toBe("A")
      } finally {
        server.kill()
        await server.exited
      }
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }, 60_000)
})

function restoreEnvironment(previousEnvironment: Map<string, string | undefined>): void {
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
}

async function findAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })

  if (typeof address === "string" || address === null) {
    throw new Error("Could not allocate a test port")
  }
  return address.port
}

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, { cwd, stderr: "pipe", stdout: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed\n${stdout}\n${stderr}`)
  }
}

async function waitForServer(port: number, attempts = 100): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/app/`)
    if (response.ok) {
      return
    }
  } catch {
    // The server is still starting.
  }

  if (attempts <= 1) {
    throw new Error("Next test server did not start")
  }

  await Bun.sleep(100)
  return waitForServer(port, attempts - 1)
}
