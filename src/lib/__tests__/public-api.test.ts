import { describe, expect, it } from "bun:test"
import type { DeploymentSource } from "../../index"
import {
  createDeploymentMonitor,
  createHttpSource,
  createStaticSource,
  getDefaultMonitor,
  parseDescriptor,
  serializeDescriptor,
  TargetResolutionError,
} from "../../index"

describe("protocol public API", () => {
  it("supports a hand-written deployment source", async () => {
    const source: DeploymentSource = {
      resolveTarget() {
        return Promise.resolve({ id: "target" })
      },
      running: { id: "running" },
    }

    const target = await source.resolveTarget(new AbortController().signal)

    expect(target).toEqual({ id: "target" })
  })

  it("uses one public error class for descriptor and target resolution failures", () => {
    expect(() => parseDescriptor("not JSON")).toThrow(TargetResolutionError)
  })

  it("exports the descriptor and source functions", () => {
    expect(typeof createDeploymentMonitor).toBe("function")
    expect(typeof createHttpSource).toBe("function")
    expect(typeof createStaticSource).toBe("function")
    expect(typeof getDefaultMonitor).toBe("function")
    expect(typeof parseDescriptor).toBe("function")
    expect(typeof serializeDescriptor).toBe("function")
  })
})
