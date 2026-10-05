"use client"

import { useCallback, useState, useSyncExternalStore } from "react"
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
  const [stable, setStable] = useState(options)
  if (shallowEqual(stable, options)) {
    return stable
  }

  // Keep the new options from this render. React renders again with the new state.
  setStable(options)
  return options
}

function shallowEqual(first: DeploymentStatusOptions, second: DeploymentStatusOptions): boolean {
  const firstEntries = Object.entries(first)
  const secondValues = new Map(Object.entries(second))

  return (
    firstEntries.length === secondValues.size
    && firstEntries.every(([key, value]) => value === secondValues.get(key))
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
    checkStatus: "idle",
    checkedAt: null,
    error: null,
    reloadStatus: "unprotected",
    status: "unknown",
    target: null,
  }
  serverStates.set(monitor, serverState)
  return serverState
}

export type {
  CheckStatus,
  DeploymentMonitor,
  DeploymentStatus,
  DeploymentSubscriberOptions,
  ReloadStatus,
} from "../../lib/runtime/monitor"
export type { Deployment, DeploymentSource, IsDeploymentCurrent } from "../../lib/protocol/types"
