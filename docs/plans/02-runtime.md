# Plan 02 — Runtime (`DeploymentMonitor`)

Delivers the headless runtime: the shared monitor, its registry, scheduling,
policies, and the reload guard. Framework-free; must run (inertly) in Node
and fully in browsers. Depends on plan 01.

Reference before starting: `subscribable.ts`, `focusManager.ts`,
`onlineManager.ts`, `queryObserver.ts` in the vendored query-core source
(paths in plan 00).

## Deliverables

1. `src/runtime/subscribable.ts` — minimal subscriber base
2. `src/runtime/monitor.ts` — `DeploymentMonitor`
3. `src/runtime/registry.ts` — shared-monitor registry
4. `src/runtime/scheduler.ts` — interval + browser triggers
5. `src/runtime/policies.ts` — `exactMatch()`
6. `src/runtime/reload-guard.ts`
7. Public API from `crispen`: `createDeploymentMonitor`, `getDefaultMonitor`,
   `exactMatch`, plus all types

## 1. State model

```ts
export interface DeploymentStatus {
  status: "unknown" | "current" | "stale"
  isChecking: boolean
  error: Error | null
  running: Deployment
  target: Deployment | null
  checkedAt: Date | null
  reloadBlocked: boolean
  check(): Promise<void>
  reload(): void
}
```

Transition rules (the point of the split axes — see decision 1 in plan 00):

- `status` only changes on a _successful_ check, per the policy verdict.
- Once `stale`, only a successful check that verdicts `current` (target
  rolled back) can change it back.
- A check starting sets `isChecking: true`; it never touches `status`.
- A check failing sets `error`; it never touches `status`. A later success
  clears `error`.
- State object is immutable per notification (new object each change) so
  React can use reference equality.

## 2. Monitor (`monitor.ts`)

`createDeploymentMonitor(source: DeploymentSource, options?)` →

- `getState(): DeploymentStatus` (stable reference between changes —
  `useSyncExternalStore` requirement)
- `subscribe(listener, subscriberOptions): () => void`
- `check(): Promise<void>` — never rejects (decision 4). Concurrent calls
  share one in-flight promise (dedupe). Uses `AbortController`; aborts when
  the last subscriber leaves mid-flight.
- `reload(): void` — see §5
- `destroy()` — for tests

**Inert mode**: when constructed with no source (no embed found), the
monitor stays `status: "unknown"`, `check()` resolves immediately, and no
listeners/timers attach. One dev-mode `console.warn` explaining that no
adapter registered an embed. This is what dev servers and unit tests get by
default (decision 8).

**Subscriber option reconciliation** (decision 3): each subscriber passes
its options; the effective schedule is shortest `checkInterval` and the
union of enabled triggers. Recomputed when subscribers come and go.

## 3. Registry (`registry.ts`)

- `getDefaultMonitor(): DeploymentMonitor` — lazily builds from
  `createEmbeddedSource()`; returns the inert monitor when there is no
  embed. Module-level singleton.
- `getMonitor(source): DeploymentMonitor` — `Map<DeploymentSource, Monitor>`
  keyed by object identity. Explicit sources are the escape hatch for tests
  and multi-surface apps; no provider exists (decision 3).
- Test helper `resetRegistry()` (exported under an internal subpath or
  guarded name).

## 4. Scheduler (`scheduler.ts`)

Owns the timer and DOM listeners. All listener setup is guarded so the
module is importable in Node/SSR without touching `window`.

- Interval runs only while the document is visible; on `visibilitychange` to
  visible: check immediately (if trigger enabled), restart interval
  (decision 7 — background timers are throttled anyway and results only
  matter when the user returns).
- `pageshow` with `event.persisted === true` → check. This is the bfcache
  restore: page revived from a memory snapshot, possibly days old, timers
  frozen the whole time.
- `online` → check when `checkOnReconnect`.
- Initial check on first subscriber (`checkOnSubscribe`, default true).
- Listeners attach on first subscriber, detach on last (refcount).

Default options: `checkInterval: 5 * 60_000`, `checkOnVisible: true`,
`checkOnReconnect: true`, `checkOnSubscribe: true`,
`policy: exactMatch()`. Enforce a floor (10s) on `checkInterval` with a dev
warning — sub-10s polling of a deployment descriptor is always a mistake.

## 5. Reload guard (`reload-guard.ts`)

`reload()` (decision 5):

1. Read marker `crispen:reload` from `sessionStorage`
   (`{ from, to, attempts, at }`).
2. If the current running id equals the marker's `from` and the marker's
   `to` equals the current target id, the previous reload failed to advance
   (CDN still serving the old build). Increment `attempts`.
3. If `attempts >= 2` and the marker is younger than a cooldown (10 min):
   do not reload; set `reloadBlocked: true` in state so the app can show
   "update available — please reopen" instead of looping.
4. Otherwise write the marker and call `location.reload()`.
5. On monitor construction: if a marker exists and the running id differs
   from its `from`, the reload succeeded — clear the marker.

sessionStorage is per-tab and dies with the tab — exactly the scope reload
attempts need. Guard all storage access (private-mode quota errors → guard
disabled, reload still works, just unprotected).

## 6. Policies (`policies.ts`)

```ts
export const exactMatch = (): DeploymentPolicy => (running, target) =>
  running.id === target.id ? "current" : "stale"
```

That is the entire v1 policy surface. Semver/canary/`supportedUntil`
policies are future work and must not leak into this plan.

## Tests

- State transitions: table-driven — every rule in §1, especially
  stale + failed check keeps `stale`, and stale + `isChecking` keeps `stale`
- Dedupe: two concurrent `check()` → one `resolveTarget` call
- Reconciliation: two subscribers with different intervals → shortest wins;
  one leaves → recomputed
- Refcount: listeners/timers attach on first subscribe, detach on last
  (assert via injected fake scheduler hooks)
- Reload guard: full loop scenario (reload lands on same id twice → blocked),
  success scenario clears marker, storage-throwing environment
- Inert mode: no embed → `unknown`, no timers, `check()` resolves
- Scheduler DOM triggers: happy-dom/jsdom via `bun test` if workable;
  otherwise abstract the event surface behind an injectable interface and
  test through fakes (decide during implementation, note the choice in the
  PR)

## Acceptance

- Core (`crispen` root export) imports cleanly in Node with no DOM and no
  side effects
- A headless consumer (plain `subscribe` + `getState`) can drive the full
  check/stale/reload flow with a hand-written source — no React, no Vite
