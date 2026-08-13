import { resolve, sep } from "node:path"

const root = resolve(readArgument("--root") ?? "examples/vite-react/serve")
const port = Number(readArgument("--port") ?? "4173")
const spaFallback = process.argv.includes("--spa-fallback")

const server = Bun.serve({
  fetch: serve,
  hostname: "127.0.0.1",
  port,
})

console.info(`Serving ${root} at ${String(server.url)}`)

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === "/__health") {
    return new Response("ok")
  }
  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1)
  const path = resolve(root, requestedPath)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    return new Response("Not found", { status: 404 })
  }

  const file = Bun.file(path)
  if (await file.exists()) {
    return new Response(file, {
      headers:
        url.pathname === "/_crispen/deployment.json"
          ? { "Cache-Control": "no-store", "Content-Type": "application/json" }
          : undefined,
    })
  }

  if (spaFallback) {
    return new Response(Bun.file(resolve(root, "index.html")), {
      headers: { "Content-Type": "text/html" },
    })
  }

  return new Response("Not found", { status: 404 })
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
