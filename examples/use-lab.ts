import type { DeploymentMonitor, DeploymentStatus } from "crispen"
import { getDefaultMonitor } from "crispen"
import { useEffect, useState, useSyncExternalStore } from "react"

declare global {
  interface Window {
    __crispenLab?: DeploymentMonitor
  }
}

const LEDGER_SIZE = 12

export interface LedgerEvent {
  readonly id: number
  readonly text: string
}

interface Snapshot {
  readonly checkedAt: DeploymentStatus["checkedAt"]
  readonly error: DeploymentStatus["error"]
  readonly status: DeploymentStatus["status"]
  readonly target: DeploymentStatus["target"]
}

interface Ledger {
  readonly events: readonly LedgerEvent[]
  readonly nextId: number
  readonly snapshot: Snapshot | undefined
}

const EMPTY_LEDGER: Ledger = { events: [], nextId: 0, snapshot: undefined }

/**
 * Record one ledger event each time the deployment state changes. The server render and the
 * hydration render show no events, because the event text contains the local time.
 */
export function useEventLedger(deployment: DeploymentStatus): readonly LedgerEvent[] {
  const isHydrated = useSyncExternalStore(subscribeToNothing, getClientSnapshot, getServerSnapshot)
  const [ledger, setLedger] = useState(EMPTY_LEDGER)

  if (
    !isHydrated
    || (ledger.snapshot !== undefined && isSameSnapshot(ledger.snapshot, deployment))
  ) {
    return ledger.events
  }

  const next = recordEvent(ledger, deployment)
  setLedger(next)
  return next.events
}

/**
 * Expose the default monitor to end-to-end tests when the URL has `seam=1`.
 */
export function useLabSeam(): void {
  useEffect(() => {
    if (new URLSearchParams(globalThis.location.search).get("seam") === "1") {
      globalThis.window.__crispenLab = getDefaultMonitor()
    }
    return () => {
      delete globalThis.window.__crispenLab
    }
  }, [])
}

function recordEvent(previous: Ledger, deployment: DeploymentStatus): Ledger {
  const id = previous.nextId
  const text = `${formatTime(new Date())} · ${deployment.status} · target ${deployment.target?.id ?? "—"}`

  return {
    events: [{ id, text }, ...previous.events].slice(0, LEDGER_SIZE),
    nextId: id + 1,
    snapshot: {
      checkedAt: deployment.checkedAt,
      error: deployment.error,
      status: deployment.status,
      target: deployment.target,
    },
  }
}

function isSameSnapshot(snapshot: Snapshot, deployment: DeploymentStatus): boolean {
  return (
    snapshot.checkedAt === deployment.checkedAt
    && snapshot.error === deployment.error
    && snapshot.status === deployment.status
    && snapshot.target === deployment.target
  )
}

function subscribeToNothing(): () => void {
  return noop
}

function noop(): void {
  // Hydration state never changes after the first client render.
}

function getClientSnapshot(): boolean {
  return true
}

function getServerSnapshot(): boolean {
  return false
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
