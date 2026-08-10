import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, spyOn } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { renderToString } from "react-dom/server"
import type { DeploymentSource, DeploymentStatus, DeploymentStatusOptions } from "../index"
import { getMonitor, resetRegistry } from "../../../lib/runtime/registry"
import { deploymentStatusOptions, useDeploymentStatus } from "../index"

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
  return <output>{deployment.status}</output>
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
  it("returns the same options object with its literal types", () => {
    const input = { checkInterval: 20_000 as const }
    const options = deploymentStatusOptions(input)

    expect(options).toBe(input)
    expectTypeOf(options.checkInterval).toEqualTypeOf<20_000>()
  })

  it("renders unknown without an embed in the browser and during SSR", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => false)

    const view = render(<Status />)

    expect(view.getByText("unknown")).toBeDefined()
    expect(renderToString(<Status />)).toContain("unknown")
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

  it("uses the policy supplied to the hook", async () => {
    const states = new Map<string, DeploymentStatus>()
    const options = deploymentStatusOptions({
      checkInterval: 20_000,
      policy: () => "stale" as const,
      source: {
        resolveTarget: () => Promise.resolve({ id: "running" }),
        running: { id: "running" },
      },
    })

    const view = render(<SourceStatus id="policy" options={options} states={states} />)

    await waitFor(() => {
      expect(view.getByText("stale")).toBeDefined()
    })

    const state = states.get("policy")
    if (state?.status !== "stale") {
      throw new Error("Expected the hook state to narrow to stale")
    }
    expectTypeOf(state.status).toEqualTypeOf<"stale">()
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
    let pendingCheck: Promise<void> | undefined
    act(() => {
      pendingCheck = monitor.check()
    })

    expect(view.getByText("stale")).toBeDefined()
    expect(states.get("notice")?.isChecking).toBe(true)

    finish({ id: "target" })
    await act(async () => {
      await pendingCheck
    })

    expect(view.getByText("stale")).toBeDefined()
  })
})
