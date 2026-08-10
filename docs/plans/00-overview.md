# Plan 00 — Overview and roadmap

This directory holds the remaining implementation plans for Crispen. Read
`CONTEXT.md` at the repo root first; the plans use its ubiquitous language
strictly (adapter = build/framework side, integration = UI library side).

## Goal

Finish the v1 hardening work for the implemented core, React integration, and
Vite and Next.js adapters.

## Plan index and order

| Plan                                                                    | Delivers                                          | Depends on             |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| [08-runtime-resilience](./08-runtime-resilience.md)                     | Subscriber predicate policy and check timeout     | Current runtime        |
| [09-adapter-edge-coverage](./09-adapter-edge-coverage.md)               | Endpoint tables and Pages Router production check | Current adapters       |
| [10-react-lifecycle-coverage](./10-react-lifecycle-coverage.md)         | Option-change and hook reload coverage            | 08                     |
| [11-conditional-descriptor-fetch](./11-conditional-descriptor-fetch.md) | Conditional descriptor requests with ETags        | Current protocol layer |

Plans 08, 09, and 11 can run in parallel. In plan 08, settle subscriber predicate
policy before adding the check timeout. Plan 10 starts after plan 08 because its
option-change test depends on the shared predicate contract.

## Decisions already made

These were settled in design discussion. Plans reference them; do not
re-litigate them inside a plan.

1. **State axes are split.** `status` (`"unknown" | "current" | "stale"`) is
   durable knowledge. `isChecking` and `error` are orthogonal fields. A
   re-check or a failed check never erases known staleness.
2. **Two protocol conventions.** The descriptor
   (`/_crispen/deployment.json`, versioned wire format) carries the target.
   The embed (`globalThis.__CRISPEN__`) carries the running identity and
   adapter config into the browser. Both are internal conventions; app code
   references neither.
3. **Shared monitor, no provider.** One `DeploymentMonitor` per
   `DeploymentSource`, held in a module-level registry. Hooks/stores
   subscribe; first subscriber starts scheduling, last stops it. Subscriber
   options reconcile as: shortest interval wins, triggers union. An explicit
   `source` option bypasses the registry (tests, second surface).
4. **`check()` never rejects.** Failures land in state as `error`.
5. **Reload is client-initiated; the runtime guards it.** Crispen never
   reloads on its own. `reload()` records intent in sessionStorage and blocks
   itself after repeated reloads that land back on the same running id.
6. **Current deployment is customizable.** The optional pure `isCurrent`
   predicate has the shape `(running, target) => boolean`. Exact deployment ID
   equality is the default. `supportedUntil` is cut from v1 — no dead wire fields.
7. **Triggers**: `visibilitychange` (not `focus`), `pageshow` with
   `persisted`, `online`, and an interval that pauses while the tab is
   hidden.
8. **Dev mode is inert.** Without a real deployment (dev server, tests, no
   embed), the monitor reports `unknown`/`current` and never flags stale.
9. **Terminology** per `CONTEXT.md`: no "freshness" or "producer/consumer" in
   code or plans.

## Package layout (target state)

Single package, subpath exports, built with bunup. Examples are bun workspaces,
private, and consume the built `dist`:

```text
src/
  index.ts            # core entry: re-exports lib
  lib/                # core: protocol + runtime (headless)
    protocol/         # types, descriptor, embed, http source
    runtime/          # monitor, registry, scheduler, reload guard
  integrations/
    react/index.ts
  adapters/
    vite/index.ts
    next/index.ts
examples/
  vite-react/     # Vite + React skew lab and e2e fixture
  nextjs/         # Next.js skew lab and e2e fixture
scripts/
  simulate-deploy.ts
```

```text
crispen         → dist/index.js
crispen/react   → dist/integrations/react/index.js   (peer: react)
crispen/vite    → dist/adapters/vite/index.js        (peer: vite)
crispen/next    → dist/adapters/next/index.js        (peer: next)
```

Tests are colocated: each area keeps its tests in a `__tests__/` folder next
to the code under test (e.g. `src/lib/protocol/__tests__/descriptor.test.ts`).
There is no top-level test directory; only e2e scenarios live outside `src`.

Core and integrations must stay dependency-free at runtime. Peer dependencies
are optional (`peerDependenciesMeta`) so installing `crispen` in a Svelte app
does not warn about React.

## Reference material

TanStack Query source is vendored via packref at
`.packref/packages/npm/@tanstack/{query-core,react-query}/5.101.4/src/`.
Reference implementations for the current runtime and React integration:

- `query-core/src/subscribable.ts` — subscriber base class
- `query-core/src/focusManager.ts` — visibilitychange handling, done right
- `query-core/src/onlineManager.ts` — reconnect handling
- `query-core/src/queryObserver.ts` — how hooks subscribe to shared core state
- `react-query/src/queryOptions.ts` — the typed options-helper pattern

## Open questions

1. Is the `crispen` npm name owned/reserved?
2. Minimum supported versions: React ≥18 (for `useSyncExternalStore`) and
   Vite ≥5 are assumed. Confirm. For Next: App Router only, or Pages too?
3. Primary deployment hosts to test against (affects docs recipes for cache
   headers on the descriptor): Vercel? Cloudflare? Plain static CDN?
4. Default deployment-id resolution order for adapters when no option is
   passed — proposed: explicit option → common CI env vars (`GIT_SHA`,
   `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`) → random per-build id.
