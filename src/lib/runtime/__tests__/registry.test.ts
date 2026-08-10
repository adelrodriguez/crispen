import { afterEach, describe, expect, it, spyOn } from "bun:test"
import type { DeploymentSource } from "../../protocol"
import { getDefaultMonitor, getMonitor, resetRegistry } from "../registry"

afterEach(() => {
  globalThis.__CRISPEN__ = undefined
  resetRegistry()
})

describe("deployment monitor registry", () => {
  it("shares one monitor per source object identity", () => {
    const firstSource: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "first" }),
      running: { id: "first" },
    }
    const secondSource: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "second" }),
      running: { id: "second" },
    }

    expect(getMonitor(firstSource)).toBe(getMonitor(firstSource))
    expect(getMonitor(firstSource)).not.toBe(getMonitor(secondSource))
  })

  it("starts a new weak registry when reset", () => {
    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "first" }),
      running: { id: "first" },
    }
    const monitor = getMonitor(source)

    resetRegistry()

    expect(getMonitor(source)).not.toBe(monitor)
  })

  it("destroys a live per-source monitor when reset", () => {
    const clearInterval = spyOn(globalThis, "clearInterval")
    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "first" }),
      running: { id: "first" },
    }
    const monitor = getMonitor(source)
    monitor.subscribe(() => false, { checkInterval: 20_000, checkOnSubscribe: false })

    resetRegistry()

    expect(clearInterval).toHaveBeenCalled()
    clearInterval.mockRestore()
  })

  it("lazily creates one default monitor from the embed", () => {
    globalThis.__CRISPEN__ = {
      running: { id: "running" },
      v: 1,
    }

    const monitor = getDefaultMonitor()

    expect(getDefaultMonitor()).toBe(monitor)
    expect(monitor.getState().running).toEqual({ id: "running" })
  })
})
