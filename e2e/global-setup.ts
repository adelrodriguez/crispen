import { resolve } from "node:path"
import { activateBuild } from "../scripts/deployment-files"
import { buildExample, buildPackage, EXAMPLES } from "../scripts/example-build"

export default async function globalSetup(): Promise<void> {
  await buildPackage()
  await prepareExamples([...EXAMPLES])
}

async function prepareExamples(examples: typeof EXAMPLES): Promise<void> {
  const [example, ...remaining] = examples
  if (!example) {
    return
  }
  const first = await buildExample(example, "A")
  await buildExample(example, "B")
  await activateBuild(resolve("examples", example), first)
  await prepareExamples(remaining)
}
