import type { Deployment, DeploymentSource, IsDeploymentCurrent } from "../protocol/types"
import type { RuntimeEnvironment } from "./environment"
import type { DeploymentSchedule } from "./scheduler"
import { createBrowserEnvironment } from "./environment"
import { clearSuccessfulReload, requestReload } from "./reload-guard"
import {
  DEFAULT_DEPLOYMENT_SCHEDULE,
  DeploymentScheduler,
  MINIMUM_CHECK_INTERVAL,
} from "./scheduler"
import { Subscribable } from "./subscribable"

interface DeploymentStatusBase {
  readonly check: () => Promise<DeploymentStatus>
  readonly error: Error | null
  readonly isChecking: boolean
  readonly reload: () => void
  readonly reloadBlocked: boolean
  readonly running: Deployment
}

export type DeploymentStatus = DeploymentStatusBase &
  (
    | {
        readonly checkedAt: null
        readonly status: "unknown"
        readonly target: null
      }
    | {
        readonly checkedAt: Date
        readonly status: "current" | "stale"
        readonly target: Deployment
      }
  )

type DeploymentStatusChanges = Partial<
  Pick<DeploymentStatusBase, "error" | "isChecking" | "reloadBlocked">
>

export interface DeploymentMonitorOptions {
  readonly environment?: RuntimeEnvironment
  readonly isCurrent?: IsDeploymentCurrent
}

export interface DeploymentSubscriberOptions {
  readonly checkInterval?: number
  readonly checkOnReconnect?: boolean
  readonly checkOnSubscribe?: boolean
  readonly checkOnVisible?: boolean
  readonly isCurrent?: IsDeploymentCurrent
}

export interface DeploymentMonitor {
  check(): Promise<DeploymentStatus>
  destroy(): void
  getState(): DeploymentStatus
  reload(): void
  subscribe(
    listener: (state: DeploymentStatus) => void,
    options?: DeploymentSubscriberOptions
  ): () => void
}

class DeploymentMonitorImplementation
  extends Subscribable<(state: DeploymentStatus) => void, DeploymentSubscriberOptions>
  implements DeploymentMonitor
{
  readonly #defaultIsCurrent: IsDeploymentCurrent
  #isCurrent: IsDeploymentCurrent
  readonly #source: DeploymentSource | undefined
  readonly #environment: RuntimeEnvironment
  #abortController: AbortController | undefined
  #destroyed = false
  readonly #onDestroy: (() => void) | undefined
  #inFlight: Promise<DeploymentStatus> | undefined
  readonly #scheduler: DeploymentScheduler
  #state: DeploymentStatus

  constructor(
    source: DeploymentSource | undefined,
    options: DeploymentMonitorOptions,
    onDestroy?: () => void
  ) {
    super()
    this.#environment = options.environment ?? createBrowserEnvironment()
    this.#defaultIsCurrent = options.isCurrent ?? isExactDeployment
    this.#isCurrent = this.#defaultIsCurrent
    this.#onDestroy = onDestroy
    this.#source = source
    if (source === undefined && process.env.NODE_ENV !== "production" && "document" in globalThis) {
      // eslint-disable-next-line no-console -- Missing adapter data must be visible in development.
      console.warn("Crispen is inert because no adapter registered a deployment embed.")
    }
    this.#scheduler = new DeploymentScheduler(this.#environment, () => {
      void this.check()
    })
    this.#state = {
      check: this.check.bind(this),
      checkedAt: null,
      error: null,
      isChecking: false,
      reload: this.reload.bind(this),
      reloadBlocked: false,
      running: source?.running ?? { id: "" },
      status: "unknown",
      target: null,
    }
    clearSuccessfulReload(this.#state.running, this.#environment)
  }

  check(): Promise<DeploymentStatus> {
    const source = this.#source
    if (this.#destroyed || source === undefined) {
      return Promise.resolve(this.#state)
    }

    if (this.#inFlight !== undefined) {
      return this.#inFlight
    }

    const abortController = new AbortController()
    this.#abortController = abortController
    this.#inFlight = this.#performCheck(source, abortController.signal).finally(() => {
      const shouldRestart = abortController.signal.aborted && this.#shouldCheckOnSubscribe()
      if (this.#abortController === abortController) {
        this.#abortController = undefined
      }
      this.#inFlight = undefined
      if (shouldRestart) {
        void this.check()
      }
    })

    return this.#inFlight
  }

  async #performCheck(source: DeploymentSource, signal: AbortSignal): Promise<DeploymentStatus> {
    this.#updateState({ isChecking: true })
    try {
      const target = await source.resolveTarget(signal)
      this.#setState({
        ...this.#state,
        checkedAt: new Date(this.#environment.now()),
        error: null,
        isChecking: false,
        reloadBlocked: this.#state.reloadBlocked && this.#state.target?.id === target.id,
        status: this.#isCurrent(source.running, target) ? "current" : "stale",
        target,
      })
    } catch (error) {
      if (signal.aborted) {
        this.#updateState({ isChecking: false })
        return this.#state
      }

      this.#updateState({
        error: error instanceof Error ? error : new Error(String(error)),
        isChecking: false,
      })
    }
    return this.#state
  }

  destroy(): void {
    if (this.#destroyed) {
      return
    }

    this.#destroyed = true
    this.#abortController?.abort()
    this.#scheduler.stop()
    this.listeners.clear()
    this.#onDestroy?.()
  }

  getState(): DeploymentStatus {
    return this.#state
  }

  reload(): void {
    if (this.#destroyed) {
      return
    }

    const reloadBlocked = requestReload(this.#state.running, this.#state.target, this.#environment)
    if (reloadBlocked !== this.#state.reloadBlocked) {
      this.#updateState({ reloadBlocked })
    }
  }

  override subscribe(
    listener: (state: DeploymentStatus) => void,
    options: DeploymentSubscriberOptions = {}
  ): () => void {
    if (this.#destroyed) {
      return noopUnsubscribe
    }

    return super.subscribe(listener, options)
  }

  protected override onSubscribe(): void {
    if (this.#source === undefined) {
      return
    }

    const schedule = this.#reconcileSchedule()
    this.#reconcileIsCurrent()
    this.#scheduler.update(schedule)

    if (this.listeners.size === 1 && this.#shouldCheckOnSubscribe()) {
      void this.check()
    }
  }

  protected override onUnsubscribe(): void {
    if (this.listeners.size === 0) {
      this.#isCurrent = this.#defaultIsCurrent
      const abortController = this.#abortController
      void Promise.resolve().then(() => {
        if (this.listeners.size === 0 && this.#abortController === abortController) {
          abortController?.abort()
        }
        return false
      })
      this.#scheduler.stop()
      return
    }

    this.#reconcileIsCurrent()
    this.#scheduler.update(this.#reconcileSchedule())
  }

  #reconcileSchedule(): DeploymentSchedule {
    const options = [...this.listeners].map(({ options: subscriberOptions }) => subscriberOptions)
    const requestedInterval = Math.min(
      ...options.map(
        ({ checkInterval }) => checkInterval ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkInterval
      )
    )

    if (requestedInterval < MINIMUM_CHECK_INTERVAL) {
      // eslint-disable-next-line no-console -- Excessive polling is a deployment configuration error.
      console.warn(`Crispen increased checkInterval to ${MINIMUM_CHECK_INTERVAL}ms.`)
    }

    return {
      checkInterval: Math.max(requestedInterval, MINIMUM_CHECK_INTERVAL),
      checkOnReconnect: options.some(
        ({ checkOnReconnect }) => checkOnReconnect ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnReconnect
      ),
      checkOnSubscribe: options.some(
        ({ checkOnSubscribe }) => checkOnSubscribe ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnSubscribe
      ),
      checkOnVisible: options.some(
        ({ checkOnVisible }) => checkOnVisible ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnVisible
      ),
    }
  }

  #reconcileIsCurrent(): void {
    this.#isCurrent =
      [...this.listeners]
        .map(({ options }) => options.isCurrent)
        .find((isCurrent) => isCurrent !== undefined) ?? this.#defaultIsCurrent
  }

  #shouldCheckOnSubscribe(): boolean {
    return [...this.listeners].some(
      ({ options: { checkOnSubscribe } }) =>
        checkOnSubscribe ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnSubscribe
    )
  }

  #updateState(changes: DeploymentStatusChanges): void {
    this.#setState({ ...this.#state, ...changes })
  }

  #setState(state: DeploymentStatus): void {
    this.#state = state
    for (const { listener } of this.listeners) {
      listener(state)
    }
  }
}

function noopUnsubscribe(): void {
  return undefined
}

function isExactDeployment(running: Deployment, target: Deployment): boolean {
  return running.id === target.id
}

export function createDeploymentMonitor(
  source?: DeploymentSource,
  options: DeploymentMonitorOptions = {}
): DeploymentMonitor {
  return new DeploymentMonitorImplementation(source, options)
}

export function createRegisteredDeploymentMonitor(
  source: DeploymentSource | undefined,
  onDestroy: () => void
): DeploymentMonitor {
  return new DeploymentMonitorImplementation(source, {}, onDestroy)
}
