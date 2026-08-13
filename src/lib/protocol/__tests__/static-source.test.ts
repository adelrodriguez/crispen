import { describe, expect, it } from "bun:test"
import { createStaticSource } from "../static-source"

const controller = new AbortController()

describe("static deployment source", () => {
  it("always resolves the configured target", async () => {
    const running = { id: "running" }
    const target = { id: "target" }
    const source = createStaticSource(running, target)

    expect(source.running).toBe(running)
    expect(await source.resolveTarget(controller.signal)).toBe(target)
    expect(await source.resolveTarget(controller.signal)).toBe(target)
  })
})
