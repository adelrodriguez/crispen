import { describe, expect, it, spyOn } from "bun:test"
import type { DeploymentSource } from "../../protocol/types"
import { FakeEnvironment, MemoryStorage } from "../../../../tests/helpers"
import { DEFAULT_CHECK_TIMEOUT, createDeploymentMonitor } from "../monitor"

const TEST_TIME = 10 ** 3

function missingResolver(): never {
  throw new Error("The test resolver was not initialized")
}

function noop(): boolean {
  return false
}

function neverSettles(): Promise<never> {
  return new Promise(() => {
    noop()
  })
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
      checkStatus: "idle",
      checkedAt: null,
      error: null,
      reloadStatus: "unprotected",
      running: { id: "running" },
      status: "unknown",
      target: null,
    })
    expect(monitor.getState()).toBe(state)
  })

  it("uses the configured isCurrent predicate", async () => {
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { isCurrent: () => false }
    )

    await monitor.check()

    expect(monitor.getState().status).toBe("stale")
  })

  it("uses the earliest active explicit subscriber predicate for one shared verdict", async () => {
    const monitor = createDeploymentMonitor({
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    })
    const unsubscribeFirst = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => true,
    })
    const unsubscribeSecond = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => false,
    })

    await monitor.check()
    expect(monitor.getState().status).toBe("current")

    unsubscribeFirst()
    await monitor.check()
    expect(monitor.getState().status).toBe("stale")

    unsubscribeSecond()
  })

  it("skips option-free subscribers when it selects the active predicate", async () => {
    const monitor = createDeploymentMonitor({
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    })
    const unsubscribeWithoutPredicate = monitor.subscribe(noop, { checkOnSubscribe: false })
    const unsubscribeExplicit = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => false,
    })

    await monitor.check()

    expect(monitor.getState().status).toBe("stale")
    unsubscribeExplicit()
    unsubscribeWithoutPredicate()
  })

  it("returns to the monitor default after all explicit predicates leave", async () => {
    const monitor = createDeploymentMonitor({
      resolveTarget: () => Promise.resolve({ id: "running" }),
      running: { id: "running" },
    })
    const unsubscribeDefault = monitor.subscribe(noop, { checkOnSubscribe: false })
    const unsubscribeExplicit = monitor.subscribe(noop, {
      checkOnSubscribe: false,
      isCurrent: () => false,
    })

    await monitor.check()
    expect(monitor.getState().status).toBe("stale")

    unsubscribeExplicit()
    await monitor.check()
    expect(monitor.getState().status).toBe("current")

    unsubscribeDefault()
  })

  it("keeps schedule reconciliation independent from predicate priority", async () => {
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
      { environment }
    )
    const unsubscribePriority = monitor.subscribe(noop, {
      checkInterval: 30_000,
      checkOnReconnect: false,
      checkOnSubscribe: false,
      checkOnVisible: false,
      isCurrent: () => true,
    })
    const unsubscribeSchedule = monitor.subscribe(noop, {
      checkInterval: 20_000,
      checkOnReconnect: true,
      checkOnSubscribe: false,
      checkOnVisible: true,
      isCurrent: () => false,
    })

    await monitor.check()
    expect(monitor.getState().status).toBe("current")
    expect(environment.intervalDelays).toEqual([20_000])
    expect(environment.listenerCount("online")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)

    unsubscribePriority()
    await monitor.check()
    expect(monitor.getState().status).toBe("stale")
    expect(environment.intervalDelays).toEqual([20_000])
    expect(environment.listenerCount("online")).toBe(1)
    expect(environment.listenerCount("pageshow")).toBe(1)

    unsubscribeSchedule()
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
    const monitor = createDeploymentMonitor(source, { checkTimeout: 50, environment })

    const check = monitor.check()

    expect(environment.timeoutDelays).toEqual([50])
    expect(monitor.getState()).toMatchObject({
      checkStatus: "checking",
      status: "unknown",
    })

    resolveTarget({ id: "running" })
    const result = await check

    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      checkedAt: new Date(TEST_TIME),
      error: null,
      status: "current",
      target: { id: "running" },
    })
    expect(environment.timeoutDelays).toEqual([])
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
      checkStatus: "checking",
      status: "stale",
    })

    const result = await failedCheck

    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      error: failure,
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
      (state) => {
        states.push(state)
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
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult).toBe(monitor.getState())
    expect(secondResult).toBe(firstResult)
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

    const result = await check
    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      error: null,
    })
  })

  it("finishes a never-settling check when its timeout expires", async () => {
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: neverSettles,
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    const check = monitor.check()
    environment.fireTimeouts()
    const result = await check

    expect(result).toBe(monitor.getState())
    expect(result).toMatchObject({
      checkStatus: "idle",
      error: new Error("Crispen deployment check timed out after 50ms."),
      status: "unknown",
    })
    expect(environment.timeoutDelays).toEqual([])
  })

  it("recovers after a timed-out source ignores abort", async () => {
    let calls = 0
    let signal: AbortSignal | undefined
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: (checkSignal) => {
          calls += 1
          signal = checkSignal
          return calls === 1 ? neverSettles() : Promise.resolve({ id: "running" })
        },
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    const timedOut = monitor.check()
    environment.fireTimeouts()
    await timedOut

    expect(signal?.aborted).toBe(true)
    const recovered = await monitor.check()
    expect(recovered).toMatchObject({ error: null, status: "current" })
    expect(calls).toBe(2)
  })

  it("preserves current and stale knowledge through later timeouts", async () => {
    let shouldSettle = true
    let targetId = "running"
    const environment = new FakeEnvironment()
    environment.setNow(TEST_TIME)
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => (shouldSettle ? Promise.resolve({ id: targetId }) : neverSettles()),
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    await monitor.check()
    const currentState = monitor.getState()
    shouldSettle = false
    const currentTimeout = monitor.check()
    environment.fireTimeouts()
    await currentTimeout
    expect(monitor.getState()).toMatchObject({
      checkedAt: currentState.checkedAt,
      status: "current",
      target: { id: "running" },
    })

    shouldSettle = true
    targetId = "target"
    environment.setNow(TEST_TIME + 1)
    await monitor.check()
    expect(monitor.getState()).toMatchObject({ error: null, status: "stale" })

    const staleState = monitor.getState()
    shouldSettle = false
    const staleTimeout = monitor.check()
    environment.fireTimeouts()
    await staleTimeout
    expect(monitor.getState()).toMatchObject({
      checkedAt: staleState.checkedAt,
      status: "stale",
      target: { id: "target" },
    })
  })

  it("ignores a late result from a timed-out check", async () => {
    let calls = 0
    let finishFirst: (deployment: { id: string }) => void = missingResolver
    const firstTarget = new Promise<{ id: string }>((resolve) => {
      finishFirst = resolve
    })
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: () => {
          calls += 1
          return calls === 1 ? firstTarget : Promise.resolve({ id: "newer" })
        },
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    const firstCheck = monitor.check()
    environment.fireTimeouts()
    await firstCheck
    await monitor.check()

    finishFirst({ id: "running" })
    await Promise.resolve()

    expect(monitor.getState()).toMatchObject({ status: "stale", target: { id: "newer" } })
  })

  it("clears timeout work after last unsubscribe and destruction", async () => {
    const environment = new FakeEnvironment()
    const source: DeploymentSource = {
      resolveTarget: neverSettles,
      running: { id: "running" },
    }
    const monitor = createDeploymentMonitor(source, { environment })
    const unsubscribe = monitor.subscribe(noop, { checkOnSubscribe: false })
    const cancelledCheck = monitor.check()

    expect(environment.timeoutDelays).toEqual([DEFAULT_CHECK_TIMEOUT])
    unsubscribe()
    await Promise.resolve()
    expect(environment.intervalDelays).toEqual([])
    expect(environment.timeoutDelays).toEqual([])
    await cancelledCheck
    expect(monitor.getState().error).toBeNull()

    const destroyedMonitor = createDeploymentMonitor(source, { environment })
    destroyedMonitor.subscribe(noop, { checkOnSubscribe: false })
    const destroyedCheck = destroyedMonitor.check()
    destroyedMonitor.destroy()

    expect(environment.intervalDelays).toEqual([])
    expect(environment.timeoutDelays).toEqual([])
    await destroyedCheck
    expect(destroyedMonitor.getState().error).toBeNull()
  })

  it("shares the result of a timed-out check across concurrent callers", async () => {
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(
      {
        resolveTarget: neverSettles,
        running: { id: "running" },
      },
      { checkTimeout: 50, environment }
    )

    const first = monitor.check()
    const second = monitor.check()
    expect(second).toBe(first)

    environment.fireTimeouts()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(secondResult).toBe(firstResult)
    expect(firstResult.error?.message).toBe("Crispen deployment check timed out after 50ms.")
  })

  it("stays inert without an embedded deployment source", async () => {
    let warned = false
    const warning = spyOn(console, "warn").mockImplementation(() => {
      warned = true
    })
    const environment = new FakeEnvironment()
    const monitor = createDeploymentMonitor(undefined, { environment })
    const unsubscribe = monitor.subscribe(noop)

    const result = await monitor.check()

    expect(warned).toBe(false)
    expect(result).toBe(monitor.getState())
    expect(result.status).toBe("unknown")
    expect(environment.intervalDelays).toEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)

    unsubscribe()
    warning.mockRestore()
  })

  it("stays terminal after destruction", async () => {
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
    const unsubscribe = monitor.subscribe(noop, { checkOnSubscribe: false })

    monitor.destroy()
    monitor.destroy()
    const state = monitor.getState()
    const unsubscribeAfterDestroy = monitor.subscribe(noop)
    const result = await monitor.check()
    monitor.reload()

    expect(result).toBe(state)
    expect(checks).toBe(0)
    expect(environment.intervalDelays).toEqual([])
    expect(environment.listenerCount("visibilitychange")).toBe(0)
    expect(environment.reloadCalls).toBe(0)

    unsubscribe()
    unsubscribeAfterDestroy()
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

  it("starts a fresh check when Strict Mode resubscribes after cancellation", async () => {
    let calls = 0
    const monitor = createDeploymentMonitor({
      resolveTarget: () => {
        calls += 1
        return calls === 1 ? neverSettles() : Promise.resolve({ id: "running" })
      },
      running: { id: "running" },
    })

    const unsubscribeFirst = monitor.subscribe(noop)
    const cancelledCheck = monitor.check()
    unsubscribeFirst()
    await Promise.resolve()

    const unsubscribeSecond = monitor.subscribe(noop)
    const result = await monitor.check()

    expect(await cancelledCheck).toMatchObject({ checkStatus: "idle", status: "unknown" })
    expect(result).toMatchObject({ error: null, status: "current" })
    expect(calls).toBe(2)

    unsubscribeSecond()
  })

  describe("reload", () => {
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

        expect(monitor.getState().reloadStatus).toBe(attempt === 3 ? "blocked" : "ready")
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

      createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "B" },
        },
        { environment }
      )

      for (let attempt = 1; attempt <= 2; attempt += 1) {
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

        expect(monitor.getState().reloadStatus).toBe("ready")
      }

      expect(environment.reloadCalls).toBe(3)
    })

    it("starts unprotected when session storage cannot be read", async () => {
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

      expect(monitor.getState().reloadStatus).toBe("unprotected")
      await monitor.check()
      monitor.reload()

      expect(environment.reloadCalls).toBe(1)
      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("becomes unprotected when session storage cannot be written", async () => {
      const environment = new FakeEnvironment({
        getItem: () => null,
        removeItem: () => {
          // There is no marker to remove.
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

      expect(monitor.getState().reloadStatus).toBe("ready")
      await monitor.check()
      monitor.reload()

      expect(environment.reloadCalls).toBe(1)
      expect(monitor.getState().reloadStatus).toBe("unprotected")

      await monitor.check()
      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("starts unprotected when a successful reload marker cannot be cleared", () => {
      const environment = new FakeEnvironment({
        getItem: () => JSON.stringify({ at: 0, attempts: 0, from: "A", to: "B" }),
        removeItem: () => {
          throw new Error("storage unavailable")
        },
        setItem: () => {
          // An unprotected monitor does not write another marker.
        },
      })
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "B" },
        },
        { environment }
      )

      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("ignores a malformed reload marker without disabling protection", () => {
      const environment = new FakeEnvironment({
        getItem: () => "not-json",
        removeItem: () => {
          // A malformed marker is ignored.
        },
        setItem: () => {
          // This test does not request a reload.
        },
      })
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: "B" }),
          running: { id: "A" },
        },
        { environment }
      )

      expect(monitor.getState().reloadStatus).toBe("ready")
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
      expect(monitor.getState().reloadStatus).toBe("unprotected")
    })

    it("starts a new reload sequence after the cooldown", async () => {
      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
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
      }

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

      expect(environment.reloadCalls).toBe(3)
      expect(monitor.getState().reloadStatus).toBe("ready")
    })

    it("clears a blocked reload when the target deployment changes", async () => {
      const storage = new MemoryStorage()
      const environment = new FakeEnvironment(storage)
      let target = "B"
      const monitor = createDeploymentMonitor(
        {
          resolveTarget: () => Promise.resolve({ id: target }),
          running: { id: "A" },
        },
        { environment }
      )
      await monitor.check()
      monitor.reload()
      monitor.reload()
      monitor.reload()
      expect(monitor.getState().reloadStatus).toBe("blocked")

      target = "C"
      await monitor.check()

      expect(monitor.getState().reloadStatus).toBe("ready")
    })
  })
})
