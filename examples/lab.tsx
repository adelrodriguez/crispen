"use client"

import type { DeploymentMonitor } from "crispen"
import { getDefaultMonitor } from "crispen"
import { useDeploymentStatus } from "crispen/react"
import { useEffect, useState } from "react"

declare global {
  interface Window {
    __crispenLab?: DeploymentMonitor
  }
}

const DEFAULT_INTERVAL = 10_000
const BUTTON_CLASS =
  "min-h-11 touch-manipulation cursor-pointer rounded-sm bg-[#14232b] px-4 py-2.5 font-semibold text-white active:scale-[0.97] enabled:hover:bg-[#287c78] disabled:cursor-wait disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#14232b]"
const LABEL_CLASS = "mb-2 font-mono text-[0.72rem] tracking-[0.08em] text-[#4f626c] uppercase"
const PANEL_CLASS = "bg-[#f8fbfceb] ring-1 ring-[#14232b2e]"
const STATUS_CLASS = {
  current: "bg-[#287c78]",
  stale: "bg-[#c44b3f]",
  unknown: "bg-[#61727a]",
} as const

export function CrispenLab({ adapter }: { readonly adapter: "Next.js" | "Vite" }) {
  const interval = readInterval()
  const deployment = useDeploymentStatus({
    checkInterval: interval,
    checkOnReconnect: true,
    checkOnVisible: true,
  })
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
    }
    return () => {
      delete globalThis.window.__crispenLab
    }
  }, [])

  return (
    <main className="min-h-dvh min-w-80 bg-[#edf3f7] [background-image:linear-gradient(#14232b0a_1px,transparent_1px),linear-gradient(90deg,#14232b0a_1px,transparent_1px)] bg-[size:24px_24px] text-[#14232b] antialiased">
      <div className="mx-auto w-full max-w-7xl px-4 [padding-top:max(2rem,env(safe-area-inset-top))] [padding-bottom:max(3rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        <header className="flex flex-col items-start gap-4 border-b border-[#c8d4da] pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <p className={LABEL_CLASS}>Crispen / {adapter} test surface</p>
            <h1 className="m-0 [font-family:'Avenir_Next_Condensed','Arial_Narrow',sans-serif] text-[clamp(2.2rem,6vw,4.8rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">
              Deployment calibration bench
            </h1>
          </div>
          <output
            className={`min-w-28 rounded-full px-3 py-2 text-center font-mono text-[0.82rem] font-bold tracking-[0.08em] text-white uppercase sm:min-w-32 ${STATUS_CLASS[deployment.status]}`}
            aria-live="polite"
            data-testid="status"
          >
            {deployment.status}
          </output>
        </header>

        <section
          className="my-6 grid grid-cols-1 items-stretch gap-4 min-[701px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          aria-label="Deployment identities"
        >
          <Identity
            label="Running deployment"
            testId="running-id"
            value={deployment.running.id === "" ? "not embedded" : deployment.running.id}
          />
          <div
            className="grid min-h-16 rotate-90 content-center justify-items-center font-mono text-[0.68rem] tracking-[0.06em] text-[#a2762c] uppercase min-[701px]:min-h-0 min-[701px]:min-w-28 min-[701px]:rotate-0"
            aria-hidden="true"
          >
            <span>target check</span>
            <b className="text-3xl font-normal">→</b>
          </div>
          <Identity
            label="Target deployment"
            testId="target-id"
            value={deployment.target?.id ?? "not resolved"}
          />
        </section>

        <section
          className="grid grid-cols-1 gap-4 min-[701px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          aria-label="Monitor state"
        >
          <article className={`${PANEL_CLASS} min-h-84 p-5`}>
            <h2 className="mb-3 text-[0.85rem] tracking-[0.08em] uppercase">State axes</h2>
            <dl className="mb-5 grid grid-cols-2">
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
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() => void deployment.check()}
                disabled={deployment.isChecking}
              >
                {deployment.isChecking ? "Checking…" : "Check now"}
              </button>
              <button
                type="button"
                className={`${BUTTON_CLASS} bg-transparent text-[#14232b] ring-1 ring-[#14232b] ring-inset enabled:hover:text-white`}
                onClick={deployment.reload}
              >
                Reload deployment
              </button>
            </div>
            {deployment.error ? (
              <p className="mt-4 text-[0.85rem] text-[#c44b3f]" role="alert">
                {deployment.error.message}
              </p>
            ) : (
              <p className="mt-4 text-[0.85rem] text-[#60717a]">No resolution error.</p>
            )}
          </article>

          <article className={`${PANEL_CLASS} min-h-84 p-5`}>
            <h2 className="mb-3 text-[0.85rem] tracking-[0.08em] uppercase">Event ledger</h2>
            {events.length > 0 ? (
              <ol
                className="m-0 max-h-64 list-none overflow-auto p-0 font-mono text-[0.78rem] tabular-nums"
                aria-live="polite"
              >
                {events.map((event, index) => (
                  <li className="border-b border-[#c8d4da] py-2.5" key={`${event}-${index}`}>
                    {event}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-[0.85rem] text-[#60717a]">
                Waiting for the first monitor event.
              </p>
            )}
          </article>
        </section>
      </div>
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
    <article className={`${PANEL_CLASS} min-w-0 p-5`}>
      <span className={`block ${LABEL_CLASS}`}>{label}</span>
      <strong
        className="block overflow-hidden font-mono text-[clamp(1.1rem,3vw,1.8rem)] text-ellipsis whitespace-nowrap tabular-nums"
        title={value}
        data-testid={testId}
      >
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
    <div className="border-b border-[#c8d4da] py-3.5">
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className="m-0 font-mono tabular-nums" data-testid={testId}>
        {value}
      </dd>
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
