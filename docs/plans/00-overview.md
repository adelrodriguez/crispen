# Plan 00 — Overview and roadmap

This directory holds the implementation plans for Crispen. Read `CONTEXT.md`
at the repo root first; the plans use its ubiquitous language strictly
(adapter = build/framework side, integration = UI library side).

## Goal

Ship a v1 of the `crispen` package with:

- the protocol (types, descriptor wire format, embed convention)
- the headless runtime (`DeploymentMonitor`)
- one integration: React (`crispen/react`)
- one adapter: Vite (`crispen/vite`)

followed by a Next.js adapter. Svelte and Astro come later and are not
planned in detail yet.

## Plan index and order

| Plan                                              | Delivers                                                         | Depends on       |
| ------------------------------------------------- | ---------------------------------------------------------------- | ---------------- |
| [01-protocol](./01-protocol.md)                   | Types, wire format, embed, HTTP source, repo restructuring       | —                |
| [02-runtime](./02-runtime.md)                     | `DeploymentMonitor`, registry, scheduler, policies, reload guard | 01               |
| [03-react-integration](./03-react-integration.md) | `useDeploymentStatus`, `deploymentStatusOptions`                 | 02               |
| [04-vite-adapter](./04-vite-adapter.md)           | `crispen/vite` plugin                                            | 01 (02 for e2e)  |
| [05-next-adapter](./05-next-adapter.md)           | `crispen/next`                                                   | 01, 04 learnings |
| [06-testing](./06-testing.md)                     | Test layers, `examples/` skew labs, deploy simulation, e2e       | cross-cutting    |

01 → 02 → 03 is strictly sequential. 04 can start in parallel once 01 lands.
05 starts after 04 because it reuses the descriptor-emission logic and its
investigation items depend on what 04 settles. 06 is cross-cutting and
delivered incrementally alongside the others — read it before implementing
02, because it imposes the injectable-environment seam on the runtime.

The end-to-end milestone after 04: a Vite + React example app where deploying
a new build flips a visible banner to stale within one check interval, and
`reload()` recovers — with no endpoint configuration in app code.

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
6. **Policy is a pure function** `(running, target) => "current" | "stale"`.
   Built-in `exactMatch()`. `supportedUntil` is cut from v1 — no dead wire
   fields.
7. **Triggers**: `visibilitychange` (not `focus`), `pageshow` with
   `persisted`, `online`, and an interval that pauses while the tab is
   hidden.
8. **Dev mode is inert.** Without a real deployment (dev server, tests, no
   embed), the monitor reports `unknown`/`current` and never flags stale.
9. **Terminology** per `CONTEXT.md`: no "freshness" or "producer/consumer" in
   code or plans.

## Package layout (target state)

Single package, subpath exports, built with bunup. Examples are bun
workspaces, private, and consume the built `dist` (plan 06):

```text
src/
  index.ts            # core entry: re-exports lib
  lib/                # core: protocol + runtime (headless)
    protocol/         # types, descriptor, embed, http source
    runtime/          # monitor, registry, scheduler, policies, reload guard
  integrations/
    react/index.ts
  adapters/
    vite/index.ts
    next/index.ts
examples/
  vite-react/     # skew lab + e2e fixture (plans 04, 06)
  nextjs/         # skew lab + e2e fixture (plans 05, 06)
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
Study before implementing plan 02/03:

- `query-core/src/subscribable.ts` — subscriber base class
- `query-core/src/focusManager.ts` — visibilitychange handling, done right
- `query-core/src/onlineManager.ts` — reconnect handling
- `query-core/src/queryObserver.ts` — how hooks subscribe to shared core state
- `react-query/src/queryOptions.ts` — the typed options-helper pattern

## Open questions (need input, do not block plans 01–03)

1. Is the `crispen` npm name owned/reserved?
2. Minimum supported versions: React ≥18 (for `useSyncExternalStore`) and
   Vite ≥5 are assumed. Confirm. For Next: App Router only, or Pages too?
3. Primary deployment hosts to test against (affects docs recipes for cache
   headers on the descriptor): Vercel? Cloudflare? Plain static CDN?
4. Default deployment-id resolution order for adapters when no option is
   passed — proposed: explicit option → common CI env vars (`GIT_SHA`,
   `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`) → random per-build id.
