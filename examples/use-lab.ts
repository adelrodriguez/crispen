import type { DeploymentMonitor, DeploymentStatus } from "crispen"
import { getDefaultMonitor } from "crispen"
import { useEffect, useState } from "react"

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

interface Ledger {
  readonly checkedAt: DeploymentStatus["checkedAt"]
  readonly error: DeploymentStatus["error"]
  readonly events: readonly LedgerEvent[]
  readonly nextId: number
  readonly status: DeploymentStatus["status"]
  readonly target: DeploymentStatus["target"]
}

/**
 * Record one ledger event each time the deployment state changes.
 */
export function useEventLedger(deployment: DeploymentStatus): readonly LedgerEvent[] {
  const [ledger, setLedger] = useState(() => recordEvent(undefined, deployment))

  if (
    ledger.checkedAt === deployment.checkedAt
    && ledger.error === deployment.error
    && ledger.status === deployment.status
    && ledger.target === deployment.target
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

function recordEvent(previous: Ledger | undefined, deployment: DeploymentStatus): Ledger {
  const id = previous?.nextId ?? 0
  const text = `${formatTime(new Date())} · ${deployment.status} · target ${deployment.target?.id ?? "—"}`

  return {
    checkedAt: deployment.checkedAt,
    error: deployment.error,
    events: [{ id, text }, ...(previous?.events ?? [])].slice(0, LEDGER_SIZE),
    nextId: id + 1,
    status: deployment.status,
    target: deployment.target,
  }
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
