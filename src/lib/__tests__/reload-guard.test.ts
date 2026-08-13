import { describe, expect, it } from "bun:test"
import { createDeploymentMonitor } from "../runtime/monitor"
import { RELOAD_MARKER_KEY } from "../runtime/reload-guard"
import { FakeEnvironment, MemoryStorage } from "../test-support/fake-environment"

describe("deployment reload guard", () => {
  it("blocks a third reload that repeatedly lands on the same deployment", async () => {
    const storage = new MemoryStorage()
    const environment = new FakeEnvironment(storage)

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "A" },
        },
        { environment }
      )
      // eslint-disable-next-line no-await-in-loop -- Each iteration models the next page load.
      await monitor.check()
      monitor.reload()

      expect(monitor.getState().reloadBlocked).toBe(attempt === 3)
    }

    expect(environment.reloadCalls).toBe(2)
  })

  it("clears the marker after reload advances to the target deployment", async () => {
    const storage = new MemoryStorage()
    const environment = new FakeEnvironment(storage)
    const staleMonitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "B" }),
        running: { id: "A" },
      },
      { environment }
    )
    await staleMonitor.check()
    staleMonitor.reload()
    expect(storage.getItem(RELOAD_MARKER_KEY)).not.toBeNull()

    createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "B" }),
        running: { id: "B" },
      },
      { environment }
    )

    expect(storage.getItem(RELOAD_MARKER_KEY)).toBeNull()
  })

  it("reloads without protection when session storage throws", async () => {
    const environment = new FakeEnvironment({
      getItem: () => {
        throw new Error("storage unavailable")
      },
      removeItem: () => {
        throw new Error("storage unavailable")
      },
      setItem: () => {
        throw new Error("storage unavailable")
      },
    })
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "B" }),
        running: { id: "A" },
      },
      { environment }
    )
    await monitor.check()

    monitor.reload()

    expect(environment.reloadCalls).toBe(1)
    expect(monitor.getState().reloadBlocked).toBe(false)
  })

  it("reloads without protection when session storage is unavailable", async () => {
    const environment = new FakeEnvironment(null)
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "B" }),
        running: { id: "A" },
      },
      { environment }
    )
    await monitor.check()

    monitor.reload()

    expect(environment.reloadCalls).toBe(1)
    expect(monitor.getState().reloadBlocked).toBe(false)
  })

  it("starts a new reload sequence after the cooldown", async () => {
    const storage = new MemoryStorage()
    const environment = new FakeEnvironment(storage)
    storage.setItem(RELOAD_MARKER_KEY, JSON.stringify({ at: 0, attempts: 2, from: "A", to: "B" }))
    environment.setNow(10 * 60_000)
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "B" }),
        running: { id: "A" },
      },
      { environment }
    )
    await monitor.check()

    monitor.reload()

    expect(environment.reloadCalls).toBe(1)
    expect(monitor.getState().reloadBlocked).toBe(false)
  })

  it("clears a blocked reload when the target deployment changes", async () => {
    const storage = new MemoryStorage()
    const environment = new FakeEnvironment(storage)
    let target = "B"
    storage.setItem(RELOAD_MARKER_KEY, JSON.stringify({ at: 0, attempts: 2, from: "A", to: "B" }))
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: target }),
        running: { id: "A" },
      },
      { environment }
    )
    await monitor.check()
    monitor.reload()
    expect(monitor.getState().reloadBlocked).toBe(true)

    target = "C"
    await monitor.check()

    expect(monitor.getState().reloadBlocked).toBe(false)
  })
})
