"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"
import type { DeploymentSource } from "../../lib/protocol/types"
import type {
  DeploymentMonitor,
  DeploymentStatus,
  DeploymentSubscriberOptions,
} from "../../lib/runtime/monitor"
import { getDefaultMonitor, getMonitor } from "../../lib/runtime/registry"

export interface DeploymentStatusOptions extends DeploymentSubscriberOptions {
  readonly source?: DeploymentSource
}

export function useDeploymentStatus(options: DeploymentStatusOptions = {}): DeploymentStatus {
  const stableOptions = useShallowStableOptions(options)
  const monitor = stableOptions.source ? getMonitor(stableOptions.source) : getDefaultMonitor()
  const subscribe = useCallback(
    (listener: () => void) => monitor.subscribe(listener, stableOptions),
    [monitor, stableOptions]
  )

  return useSyncExternalStore(
    subscribe,
    () => monitor.getState(),
    () => getServerState(monitor)
  )
}

function useShallowStableOptions(options: DeploymentStatusOptions): DeploymentStatusOptions {
  const stable = useRef(options)
  if (!shallowEqual(stable.current, options)) {
    stable.current = options
  }
  return stable.current
}

function shallowEqual(first: DeploymentStatusOptions, second: DeploymentStatusOptions): boolean {
  const firstKeys = Object.keys(first) as Array<keyof DeploymentStatusOptions>
  const secondKeys = Object.keys(second) as Array<keyof DeploymentStatusOptions>

  return (
    firstKeys.length === secondKeys.length && firstKeys.every((key) => first[key] === second[key])
  )
}

const serverStates = new WeakMap<DeploymentMonitor, DeploymentStatus>()

function getServerState(monitor: DeploymentMonitor): DeploymentStatus {
  const existing = serverStates.get(monitor)
  if (existing !== undefined) {
    return existing
  }

  const state = monitor.getState()
  const serverState: DeploymentStatus = {
    ...state,
    checkedAt: null,
    error: null,
    isChecking: false,
    reloadBlocked: false,
    status: "unknown",
    target: null,
  }
  serverStates.set(monitor, serverState)
  return serverState
}

export type {
  DeploymentMonitor,
  DeploymentStatus,
  DeploymentSubscriberOptions,
} from "../../lib/runtime/monitor"
export type { Deployment, DeploymentSource, IsDeploymentCurrent } from "../../lib/protocol/types"
