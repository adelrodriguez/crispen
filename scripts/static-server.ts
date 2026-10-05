import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { createServer } from "node:http"
import { extname, resolve, sep } from "node:path"

const root = resolve(readArgument("--root") ?? "examples/vite-react/serve")
const port = Number(readArgument("--port") ?? "4173")
const spaFallback = process.argv.includes("--spa-fallback")

const CONTENT_TYPES = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain"],
  [".woff2", "font/woff2"],
])

const server = createServer((request, response) => {
  void handleRequest(request, response)
})

server.listen(port, "127.0.0.1", () => {
  console.info(`Serving ${root} at http://127.0.0.1:${port}/`)
})

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    await serve(request, response)
  } catch (error) {
    response.writeHead(500).end(String(error))
  }
}

async function serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1")
  if (url.pathname === "/__health") {
    response.end("ok")
    return
  }
  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1)
  const path = resolve(root, requestedPath)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    response.writeHead(404).end("Not found")
    return
  }

  if (await isFile(path)) {
    sendFile(
      response,
      path,
      url.pathname === "/_crispen/deployment.json"
        ? { "Cache-Control": "no-store", "Content-Type": "application/json" }
        : {}
    )
    return
  }

  if (spaFallback) {
    sendFile(response, resolve(root, "index.html"), { "Content-Type": "text/html" })
    return
  }

  response.writeHead(404).end("Not found")
}

function sendFile(response: ServerResponse, path: string, headers: Record<string, string>): void {
  const contentType = CONTENT_TYPES.get(extname(path))
  response.writeHead(
    200,
    contentType === undefined ? headers : { "Content-Type": contentType, ...headers }
  )
  createReadStream(path).pipe(response)
}

async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isFile()
  } catch {
    return false
  }
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
