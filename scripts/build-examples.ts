import { buildExample, buildPackage, EXAMPLES } from "./example-build"

await buildPackage()
await buildAllExamples([...EXAMPLES])

async function buildAllExamples(examples: typeof EXAMPLES): Promise<void> {
  const [example, ...remaining] = examples
  if (!example) {
    return
  }
  await buildExample(example, "A")
  await buildExample(example, "B")
  await buildAllExamples(remaining)
}
