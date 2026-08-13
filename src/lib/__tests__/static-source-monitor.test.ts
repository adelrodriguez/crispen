import { describe, expect, it } from "bun:test"
import { createStaticSource } from "../protocol/static-source"
import { createDeploymentMonitor } from "../runtime/monitor"

describe("static deployment source with a deployment monitor", () => {
  it("can simulate a stale deployment", async () => {
    const target = { id: "target" }
    const source = createStaticSource({ id: "running" }, target)
    const monitor = createDeploymentMonitor(source)

    const status = await monitor.check()

    expect(status.status).toBe("stale")
    expect(status.target).toBe(target)
  })
})
