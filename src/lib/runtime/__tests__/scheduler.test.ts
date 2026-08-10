import { describe, expect, it, spyOn } from "bun:test"
import { createDeploymentMonitor } from "../monitor"
import { FakeEnvironment } from "./fake-environment"

function noop(): boolean {
  return false
}

describe("deployment scheduler", () => {
  it("attaches on the first subscriber and detaches on the last", () => {
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { environment }
    )

    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 20_000,
      checkOnSubscribe: false,
    })

    expect(environment.intervalDelays).toEqual([20_000])
    expect(environment.listenerCount("visibilitychange")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)
    expect(environment.listenerCount("online")).toBe(1)

    unsubscribe()

    expect(environment.intervalDelays).toEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)
    expect(environment.listenerCount("pageshow")).toBe(0)
    expect(environment.listenerCount("online")).toBe(0)
  })

  it("uses the shortest interval and trigger union across subscribers", () => {
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { environment }
    )
    const unsubscribeSlow = monitor.subscribe(noop, {
      checkInterval: 30_000,
      checkOnReconnect: false,
      checkOnSubscribe: false,
      checkOnVisible: false,
    })
    const unsubscribeFast = monitor.subscribe(noop, {
      checkInterval: 20_000,
      checkOnReconnect: true,
      checkOnSubscribe: false,
      checkOnVisible: true,
    })

    expect(environment.intervalDelays).toEqual([20_000])
    expect(environment.listenerCount("pageshow")).toBe(1)
    expect(environment.listenerCount("online")).toBe(1)

    unsubscribeFast()

    expect(environment.intervalDelays).toEqual([30_000])
    expect(environment.listenerCount("pageshow")).toBe(0)
    expect(environment.listenerCount("online")).toBe(0)

    unsubscribeSlow()
  })

  it("checks on visible, persisted page restore, reconnect, and visible intervals", async () => {
    let checks = 0
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => {
          checks += 1
          return Promise.resolve({ id: "running" })
        },
        running: { id: "running" },
      },
      { environment }
    )
    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 20_000,
      checkOnSubscribe: false,
    })

    environment.fireIntervals()
    await monitor.check()
    expect(checks).toBe(1)

    environment.setVisible(false)
    environment.fire("visibilitychange")
    expect(environment.intervalDelays).toEqual([])

    environment.setVisible(true)
    environment.fire("visibilitychange")
    await monitor.check()
    expect(checks).toBe(2)
    expect(environment.intervalDelays).toEqual([20_000])

    environment.fire("pageshow", { persisted: false })
    expect(checks).toBe(2)
    environment.fire("pageshow", { persisted: true })
    await monitor.check()
    expect(checks).toBe(3)

    environment.fire("online")
    await monitor.check()
    expect(checks).toBe(4)

    unsubscribe()
  })

  it("raises an excessive polling interval to the ten-second floor", () => {
    let warned = false
    const warning = spyOn(console, "warn").mockImplementation(() => {
      warned = true
    })
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { environment }
    )

    const unsubscribe = monitor.subscribe(noop, {
      checkInterval: 500,
      checkOnSubscribe: false,
    })

    expect(environment.intervalDelays).toEqual([10_000])
    expect(warned).toBe(true)

    unsubscribe()
    warning.mockRestore()
  })
})
