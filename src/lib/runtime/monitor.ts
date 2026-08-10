import type { Deployment, DeploymentPolicy, DeploymentSource } from "../protocol"
import type { RuntimeEnvironment } from "./environment"
import type { DeploymentSchedule } from "./scheduler"
import { createBrowserEnvironment } from "./environment"
import { exactMatch } from "./policies"
import { clearSuccessfulReload, requestReload } from "./reload-guard"
import {
  DEFAULT_DEPLOYMENT_SCHEDULE,
  DeploymentScheduler,
  MINIMUM_CHECK_INTERVAL,
} from "./scheduler"
import { Subscribable } from "./subscribable"

export interface DeploymentStatus {
  readonly checkedAt: Date | null
  readonly check: () => Promise<void>
  readonly error: Error | null
  readonly isChecking: boolean
  readonly reload: () => void
  readonly reloadBlocked: boolean
  readonly running: Deployment
  readonly status: "unknown" | "current" | "stale"
  readonly target: Deployment | null
}

export interface DeploymentMonitorOptions {
  readonly environment?: RuntimeEnvironment
  readonly policy?: DeploymentPolicy
}

export interface DeploymentSubscriberOptions {
  readonly checkInterval?: number
  readonly checkOnReconnect?: boolean
  readonly checkOnSubscribe?: boolean
  readonly checkOnVisible?: boolean
  readonly policy?: DeploymentPolicy
}

export interface DeploymentMonitor {
  check(): Promise<void>
  destroy(): void
  getState(): DeploymentStatus
  reload(): void
  subscribe(listener: () => void, options?: DeploymentSubscriberOptions): () => void
}

class DeploymentMonitorImplementation
  extends Subscribable<() => void, DeploymentSubscriberOptions>
  implements DeploymentMonitor
{
  readonly #defaultPolicy: DeploymentPolicy
  #policy: DeploymentPolicy
  readonly #source: DeploymentSource | undefined
  readonly #environment: RuntimeEnvironment
  #abortController: AbortController | undefined
  #inFlight: Promise<void> | undefined
  readonly #scheduler: DeploymentScheduler
  #state: DeploymentStatus

  constructor(source: DeploymentSource | undefined, options: DeploymentMonitorOptions) {
    super()
    this.#environment = options.environment ?? createBrowserEnvironment()
    this.#defaultPolicy = options.policy ?? exactMatch()
    this.#policy = this.#defaultPolicy
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

  check(): Promise<void> {
    const source = this.#source
    if (source === undefined) {
      return Promise.resolve()
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

  async #performCheck(source: DeploymentSource, signal: AbortSignal): Promise<void> {
    this.#updateState({ isChecking: true })
    try {
      const target = await source.resolveTarget(signal)
      this.#updateState({
        checkedAt: new Date(this.#environment.now()),
        error: null,
        isChecking: false,
        status: this.#policy(source.running, target),
        target,
      })
    } catch (error) {
      if (signal.aborted) {
        this.#updateState({ isChecking: false })
        return
      }

      this.#updateState({
        error: error instanceof Error ? error : new Error(String(error)),
        isChecking: false,
      })
    }
  }

  destroy(): void {
    this.#abortController?.abort()
    this.#scheduler.stop()
    this.listeners.clear()
  }

  getState(): DeploymentStatus {
    return this.#state
  }

  reload(): void {
    const reloadBlocked = requestReload(this.#state.running, this.#state.target, this.#environment)
    if (reloadBlocked !== this.#state.reloadBlocked) {
      this.#updateState({ reloadBlocked })
    }
  }

  override subscribe(listener: () => void, options: DeploymentSubscriberOptions = {}): () => void {
    return super.subscribe(listener, options)
  }

  protected override onSubscribe(): void {
    if (this.#source === undefined) {
      return
    }

    const schedule = this.#reconcileSchedule()
    this.#reconcilePolicy()
    this.#scheduler.update(schedule)

    if (this.listeners.size === 1 && this.#shouldCheckOnSubscribe()) {
      void this.check()
    }
  }

  protected override onUnsubscribe(): void {
    if (this.listeners.size === 0) {
      this.#policy = this.#defaultPolicy
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

    this.#reconcilePolicy()
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

  #reconcilePolicy(): void {
    this.#policy =
      [...this.listeners]
        .map(({ options }) => options.policy)
        .find((policy) => policy !== undefined) ?? this.#defaultPolicy
  }

  #shouldCheckOnSubscribe(): boolean {
    return [...this.listeners].some(
      ({ options: { checkOnSubscribe } }) =>
        checkOnSubscribe ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnSubscribe
    )
  }

  #updateState(changes: Partial<DeploymentStatus>): void {
    this.#state = { ...this.#state, ...changes }
    for (const { listener } of this.listeners) {
      listener()
    }
  }
}

export function createDeploymentMonitor(
  source?: DeploymentSource,
  options: DeploymentMonitorOptions = {}
): DeploymentMonitor {
  return new DeploymentMonitorImplementation(source, options)
}
