import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, spyOn } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { renderToString } from "react-dom/server"
import type { DeploymentSource, DeploymentStatus, DeploymentStatusOptions } from "../index"
import { getMonitor, resetRegistry } from "../../../lib/runtime/registry"
import { useDeploymentStatus } from "../index"

beforeAll(() => {
  GlobalRegistrator.register()
})

afterEach(() => {
  cleanup()
  resetRegistry()
})

afterAll(async () => {
  await GlobalRegistrator.unregister()
})

function Status(): React.ReactNode {
  const deployment = useDeploymentStatus({ checkOnSubscribe: false })
  return <output>{`${deployment.status}:${deployment.reloadStatus}`}</output>
}

function SourceStatus({
  id,
  options,
  states,
}: {
  readonly id: string
  readonly options: DeploymentStatusOptions
  readonly states: Map<string, DeploymentStatus>
}): React.ReactNode {
  const deployment = useDeploymentStatus(options)
  states.set(id, deployment)
  return <output>{deployment.status}</output>
}

function InlineStatus({ source }: { readonly source: DeploymentSource }) {
  const deployment = useDeploymentStatus({ checkInterval: 20_000, source })
  return <output>{deployment.status}</output>
}

function missingResolver(): never {
  throw new Error("The test resolver was not initialized")
}

describe("React deployment integration", () => {
  it("renders unknown with the browser and server reload status", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => false)

    const view = render(<Status />)

    expect(view.getByText("unknown:ready")).toBeDefined()
    expect(renderToString(<Status />)).toContain("unknown:unprotected")
    expect(warning).toHaveBeenCalled()
    warning.mockRestore()
  })

  it("shares one target resolution and state reference between components", async () => {
    let calls = 0
    const states = new Map<string, DeploymentStatus>()
    const options = {
      checkInterval: 20_000,
      source: {
        resolveTarget: () => {
          calls += 1
          return Promise.resolve({ id: "running" })
        },
        running: { id: "running" },
      },
    } satisfies DeploymentStatusOptions

    const view = render(
      <>
        <SourceStatus id="first" options={options} states={states} />
        <SourceStatus id="second" options={options} states={states} />
      </>
    )

    await waitFor(() => {
      expect(view.getAllByText("current")).toHaveLength(2)
    })

    expect(calls).toBe(1)
    expect(states.get("first")).toBe(states.get("second"))
  })

  it("does not resubscribe when an inline options literal is shallow-equal", async () => {
    let calls = 0
    const source: DeploymentSource = {
      resolveTarget: () => {
        calls += 1
        return Promise.resolve({ id: "running" })
      },
      running: { id: "running" },
    }

    const view = render(<InlineStatus source={source} />)

    await waitFor(() => {
      expect(view.getByText("current")).toBeDefined()
    })
    await Promise.resolve()

    expect(calls).toBe(1)
  })

  it("keeps one initial check through Strict Mode mount churn", async () => {
    let calls = 0
    const source: DeploymentSource = {
      resolveTarget: () => {
        calls += 1
        return Promise.resolve({ id: "running" })
      },
      running: { id: "running" },
    }

    const view = render(
      <StrictMode>
        <InlineStatus source={source} />
      </StrictMode>
    )

    await waitFor(() => {
      expect(view.getByText("current")).toBeDefined()
    })

    expect(calls).toBe(1)
  })

  it("uses the isCurrent predicate supplied to the hook", async () => {
    const states = new Map<string, DeploymentStatus>()
    const options = {
      checkInterval: 20_000,
      isCurrent: () => false,
      source: {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
    } satisfies DeploymentStatusOptions

    const view = render(<SourceStatus id="is-current" options={options} states={states} />)

    await waitFor(() => {
      expect(view.getByText("stale")).toBeDefined()
    })

    const state = states.get("is-current")
    if (state?.status !== "stale") {
      throw new Error("Expected the hook state to narrow to stale")
    }
    expectTypeOf(state.status).toEqualTypeOf<"stale">()
    expectTypeOf(state.target).toEqualTypeOf<{ readonly builtAt?: Date; readonly id: string }>()
    expectTypeOf(state.checkedAt).toEqualTypeOf<Date>()
  })

  it("keeps a stale notice mounted throughout a later check", async () => {
    let nextTarget = Promise.resolve({ id: "target" })
    let finish: (deployment: { id: string }) => void = missingResolver
    const source: DeploymentSource = {
      resolveTarget: () => nextTarget,
      running: { id: "running" },
    }
    const states = new Map<string, DeploymentStatus>()
    const view = render(
      <SourceStatus id="notice" options={{ checkOnSubscribe: false, source }} states={states} />
    )
    const monitor = getMonitor(source)

    await act(async () => {
      await monitor.check()
    })
    expect(view.getByText("stale")).toBeDefined()

    nextTarget = new Promise((resolve) => {
      finish = resolve
    })
    let pendingCheck: Promise<DeploymentStatus> | undefined
    act(() => {
      pendingCheck = monitor.check()
    })

    expect(view.getByText("stale")).toBeDefined()
    expect(states.get("notice")?.checkStatus).toBe("checking")

    finish({ id: "target" })
    await act(async () => {
      await pendingCheck
    })

    expect(view.getByText("stale")).toBeDefined()
  })
})
