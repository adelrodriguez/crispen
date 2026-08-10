import { describe, expect, it, spyOn } from "bun:test"
import type { DeploymentSource } from "../../protocol"
import { createDeploymentMonitor } from "../monitor"
import { FakeEnvironment } from "./fake-environment"

const TEST_TIME = 10 ** 3

function missingResolver(): never {
  throw new Error("The test resolver was not initialized")
}

function noop(): boolean {
  return false
}

describe("deployment monitor", () => {
  it("starts with stable unknown state for the running deployment", () => {
    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }
    const monitor = createDeploymentMonitor(source)
    const state = monitor.getState()

    expect(state).toMatchObject({
      checkedAt: null,
      error: null,
      isChecking: false,
      reloadBlocked: false,
      running: { id: "running" },
      status: "unknown",
      target: null,
    })
    expect(monitor.getState()).toBe(state)
  })

  it("keeps durable status while a successful check updates target knowledge", async () => {
    let resolveTarget: (deployment: { id: string }) => void = missingResolver
    const target = new Promise<{ id: string }>((resolve) => {
      resolveTarget = resolve
    })
    const source: DeploymentSource = {
      resolveTarget: () => target,
      running: { id: "running" },
    }
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = createDeploymentMonitor(source, { environment })

    const check = monitor.check()

    expect(monitor.getState()).toMatchObject({
      isChecking: true,
      status: "unknown",
    })

    resolveTarget({ id: "running" })
    await check

    expect(monitor.getState()).toMatchObject({
      checkedAt: new Date(TEST_TIME),
      error: null,
      isChecking: false,
      status: "current",
      target: { id: "running" },
    })
  })

  it("keeps stale knowledge when a later check fails", async () => {
    const failure = new Error("offline")
    let target = Promise.resolve({ id: "target" })
    const source: DeploymentSource = {
      resolveTarget: () => target,
      running: { id: "running" },
    }
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = createDeploymentMonitor(source, { environment })

    await monitor.check()
    target = Promise.reject(failure)
    const failedCheck = monitor.check()

    expect(monitor.getState()).toMatchObject({
      isChecking: true,
      status: "stale",
    })

    await failedCheck

    expect(monitor.getState()).toMatchObject({
      error: failure,
      isChecking: false,
      status: "stale",
      target: { id: "target" },
    })
  })

  it("notifies subscribers with a new immutable state for each change", async () => {
    const source: DeploymentSource = {
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    }
    const monitor = createDeploymentMonitor(source)
    const initial = monitor.getState()
    const states: unknown[] = []
    const unsubscribe = monitor.subscribe(
      () => {
        states.push(monitor.getState())
      },
      { checkOnSubscribe: false }
    )

    await monitor.check()
    unsubscribe()

    expect(states).toHaveLength(2)
    expect(states[0]).not.toBe(initial)
    expect(states[1]).not.toBe(states[0])
  })

  it("shares one target resolution across concurrent checks", async () => {
    let calls = 0
    let finish: (deployment: { id: string }) => void = missingResolver
    const target = new Promise<{ id: string }>((resolve) => {
      finish = resolve
    })
    const monitor = createDeploymentMonitor({
      resolveTarget: () => {
        calls += 1
        return target
      },
      running: { id: "running" },
    })

    const first = monitor.check()
    const second = monitor.check()

    expect(second).toBe(first)
    expect(calls).toBe(1)

    finish({ id: "running" })
    await first
  })

  it("aborts an in-flight check when the last subscriber leaves", async () => {
    let targetSignal: AbortSignal | undefined
    const monitor = createDeploymentMonitor({
      resolveTarget: (signal) => {
        targetSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      },
      running: { id: "running" },
    })
    const unsubscribe = monitor.subscribe(noop)
    const check = monitor.check()

    expect(targetSignal?.aborted).toBe(false)
    unsubscribe()
    await Promise.resolve()
    expect(targetSignal?.aborted).toBe(true)

    await check
    expect(monitor.getState()).toMatchObject({
      error: null,
      isChecking: false,
    })
  })

  it("stays inert without an embedded deployment source", async () => {
    let warned = false
    const warning = spyOn(console, "warn").mockImplementation(() => {
      warned = true
    })
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(undefined, { environment })
    const unsubscribe = monitor.subscribe(noop)

    await monitor.check()

    expect(warned).toBe(false)
    expect(monitor.getState().status).toBe("unknown")
    expect(environment.intervalDelays).toEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)

    unsubscribe()
    warning.mockRestore()
  })

  it("keeps the initial check through Strict Mode subscription churn", async () => {
    let calls = 0
    let finish: (deployment: { id: string }) => void = missingResolver
    let targetSignal: AbortSignal | undefined
    const target = new Promise<{ id: string }>((resolve) => {
      finish = resolve
    })
    const monitor = createDeploymentMonitor({
      resolveTarget: (signal) => {
        calls += 1
        targetSignal = signal
        return target
      },
      running: { id: "running" },
    })

    const unsubscribeFirst = monitor.subscribe(noop)
    const firstCheck = monitor.check()
    unsubscribeFirst()
    const unsubscribeSecond = monitor.subscribe(noop)

    await Promise.resolve()

    expect(calls).toBe(1)
    expect(targetSignal?.aborted).toBe(false)

    finish({ id: "running" })
    await firstCheck

    expect(monitor.getState().status).toBe("current")

    unsubscribeSecond()
  })
})
