import { describe, expect, it } from "bun:test"
import type { DeploymentSource } from "../../../index"
import {
  createDeploymentMonitor,
  createHttpSource,
  exactMatch,
  getDefaultMonitor,
  parseDescriptor,
  serializeDescriptor,
} from "../../../index"

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

  it("exports the descriptor and HTTP source functions", () => {
    expect(typeof createDeploymentMonitor).toBe("function")
    expect(typeof createHttpSource).toBe("function")
    expect(typeof exactMatch).toBe("function")
    expect(typeof getDefaultMonitor).toBe("function")
    expect(typeof parseDescriptor).toBe("function")
    expect(typeof serializeDescriptor).toBe("function")
  })
})
