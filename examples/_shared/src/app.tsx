"use client"

import type { DeploymentMonitor } from "crispen"
import { getDefaultMonitor } from "crispen"
import { deploymentStatusOptions, useDeploymentStatus } from "crispen/react"
import { useEffect, useMemo, useState } from "react"

declare global {
  interface Window {
    __crispenLab?: DeploymentMonitor
  }
}

const DEFAULT_INTERVAL = 10_000

export function CrispenLab({ adapter }: { readonly adapter: "Next.js" | "Vite" }) {
  const interval = readInterval()
  const options = useMemo(
    () =>
      deploymentStatusOptions({
        checkInterval: interval,
        checkOnReconnect: true,
        checkOnVisible: true,
      }),
    [interval]
  )
  const deployment = useDeploymentStatus(options)
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    const target = deployment.target?.id ?? "—"
    setEvents((current) =>
      [`${formatTime(new Date())} · ${deployment.status} · target ${target}`, ...current].slice(
        0,
        12
      )
    )
  }, [deployment.checkedAt, deployment.error, deployment.status, deployment.target])

  useEffect(() => {
    if (new URLSearchParams(globalThis.location.search).get("seam") === "1") {
      globalThis.window.__crispenLab = getDefaultMonitor()
      return () => {
        delete globalThis.window.__crispenLab
      }
    }
  }, [])

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div>
          <p className="eyebrow">Crispen / {adapter} test surface</p>
          <h1>Deployment calibration bench</h1>
        </div>
        <output
          className={`status-chip status-${deployment.status}`}
          aria-live="polite"
          data-testid="status"
        >
          {deployment.status}
        </output>
      </header>

      <section className="identity-rail" aria-label="Deployment identities">
        <Identity
          label="Running deployment"
          testId="running-id"
          value={deployment.running.id || "not embedded"}
        />
        <div className="rail-connector" aria-hidden="true">
          <span>target check</span>
          <b>→</b>
        </div>
        <Identity
          label="Target deployment"
          testId="target-id"
          value={deployment.target?.id ?? "not resolved"}
        />
      </section>

      <section className="bench-grid" aria-label="Monitor state">
        <article className="state-panel">
          <h2>State axes</h2>
          <dl className="state-list">
            <Reading label="Checking" value={deployment.isChecking ? "yes" : "no"} />
            <Reading
              label="Reload blocked"
              testId="reload-blocked"
              value={deployment.reloadBlocked ? "yes" : "no"}
            />
            <Reading
              label="Checked at"
              value={deployment.checkedAt ? formatTime(deployment.checkedAt) : "never"}
            />
            <Reading label="Interval" value={`${interval} ms`} />
          </dl>
          <div className="controls">
            <button
              type="button"
              onClick={() => void deployment.check()}
              disabled={deployment.isChecking}
            >
              {deployment.isChecking ? "Checking…" : "Check now"}
            </button>
            <button type="button" className="secondary" onClick={deployment.reload}>
              Reload deployment
            </button>
          </div>
          {deployment.error ? (
            <p className="error-reading" role="alert">
              {deployment.error.message}
            </p>
          ) : (
            <p className="quiet-reading">No resolution error.</p>
          )}
        </article>

        <article className="event-panel">
          <h2>Event ledger</h2>
          {events.length > 0 ? (
            <ol aria-live="polite">
              {events.map((event, index) => (
                <li key={`${event}-${index}`}>{event}</li>
              ))}
            </ol>
          ) : (
            <p className="quiet-reading">Waiting for the first monitor event.</p>
          )}
        </article>
      </section>
    </main>
  )
}

function Identity({
  label,
  testId,
  value,
}: {
  readonly label: string
  readonly testId: string
  readonly value: string
}) {
  return (
    <article className="identity-card">
      <span>{label}</span>
      <strong title={value} data-testid={testId}>
        {value}
      </strong>
    </article>
  )
}

function Reading({
  label,
  testId,
  value,
}: {
  readonly label: string
  readonly testId?: string
  readonly value: string
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function readInterval(): number {
  if (!("window" in globalThis)) {
    return DEFAULT_INTERVAL
  }
  const value = Number(new URLSearchParams(globalThis.location.search).get("interval"))
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL
}
