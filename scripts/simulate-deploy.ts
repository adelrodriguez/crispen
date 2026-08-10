import { resolve } from "node:path"
import type { ExampleName } from "./example-build"
import { activateBuild } from "./deployment-files"
import { buildExample, buildPackage } from "./example-build"

const example = readExample(process.argv[2])
const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12)

await buildPackage()
const output = await buildExample(example, id)
await activateBuild(resolve("examples", example), output)

console.info(`Activated ${example} deployment ${id}.`)

function readExample(value: string | undefined): ExampleName {
  if (value === undefined || value === "vite-react") {
    return "vite-react"
  }
  if (value === "nextjs") {
    return value
  }
  throw new Error('Example must be "vite-react" or "nextjs".')
}
