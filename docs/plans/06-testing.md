# Plan 06 — Testing strategy and examples

Cross-cutting plan: read before implementing plan 02, because the unit-test
approach imposes a design requirement on the runtime (injectable
environment, §1). Delivered incrementally alongside plans 01–05.

## The testing problem

Crispen's interesting behavior spans three timescales that never meet in a
normal test:

1. **Build time** — an adapter embeds an identity and emits a descriptor.
2. **Deploy time** — the served files change while clients keep running.
3. **Session time** — a tab lives for hours: timers fire, visibility
   changes, the page reloads, sessionStorage persists.

No single test layer covers all three. The strategy is four layers, each
owning what it is actually good at, plus an `examples/` folder that doubles
as the e2e fixture and the manual playground.

The core trick that makes e2e feasible: **a deployment is nothing but a
change in what the server serves.** Build the example twice with different
ids and swap the served directory. No real host, CDN, or CI deploy needed.

## Layer 1 — Unit (bun test, deterministic)

Covers: descriptor/embed parsing, state transitions, policy, option
reconciliation, reload guard, scheduler logic. Already itemized in plans
01–02; this section adds the _how_.

**Design requirement on the runtime (binding for plan 02):** the monitor and
scheduler must take an injectable environment instead of touching globals
directly:

```ts
interface RuntimeEnvironment {
  now(): number
  setInterval / clearInterval
  addEventListener / removeEventListener   // visibilitychange, pageshow, online
  isVisible(): boolean
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null
  reload(): void
}
```

Production code passes a thin browser-backed default; tests pass a fake with
virtual time and fireable events. This buys deterministic tests for exactly
the behaviors that are otherwise untestable (interval pause while hidden,
bfcache `pageshow`, reload-guard sequences across simulated reloads —
"reload" in tests = new monitor against the same fake storage). Without
this seam, the scheduler tests degrade to sleeps and flakes.

Time-based logic uses `env.now()` only — never `Date.now()` directly.

## Layer 2 — Component (bun test + happy-dom)

Covers: the React hook wiring (plan 03 lists the cases). Runs against fake
sources; no network, no real timers.

## Layer 3 — Adapter build tests (bun test, real builds)

Covers: does `vite build` / `next build` on a fixture produce the right
artifacts? Programmatic build into a temp dir, assert on output bytes
(embed script present and escaped, descriptor parses with the protocol's
own `parseDescriptor`). Plans 04–05 list the cases. Slowish; keep fixture
apps minimal (one component).

## Layer 4 — e2e (Playwright against `examples/`)

Covers what only a real browser can: real fetches, a real `location.reload()`,
sessionStorage surviving reload, and the full deploy-swap flow.

### Deploy simulation recipe

```text
1. bun run build:example -- --id A   → examples/vite-react/builds/A/
2. bun run build:example -- --id B   → examples/vite-react/builds/B/
3. Static server serves  serve/ → symlink to builds/A
4. Playwright opens the page        → banner "current", running id A
5. Flip symlink to builds/B         → "the deployment"
6. Click "check now" (test seam)    → banner "stale", target id B
7. Click reload                     → running id B, banner "current"
```

Symlink flip is atomic and instant; copying works where symlinks don't.

### Scenario list (each one maps to a real production failure)

- **Happy skew**: recipe above. The end-to-end milestone from plan 00.
- **Reload recovery**: after step 7, sessionStorage marker is cleared.
- **Mixed-version loop (the reload-guard test)**: serve build A's HTML but
  build B's descriptor — the "CDN edge still has old HTML" condition.
  Click reload twice → guard blocks the third, `reloadBlocked` shown.
  Manufacture it by composing a serve dir: A's files + B's
  `_crispen/deployment.json`.
- **SPA fallback misconfig**: serve with history-fallback catching the
  descriptor path (returns index.html, 200) → status stays `unknown`/last
  known, error surfaced — never a false "current" and never a false "stale".
- **Reconnect**: Playwright `context.setOffline(true/false)` around a swap →
  `online` trigger fires a check.

### What e2e deliberately does not cover

- Visibility/bfcache triggers: real tab-switching and back/forward-cache in
  Playwright are flaky-by-construction. The logic is proven in Layer 1 with
  the fake environment; e2e proves only the coarse wiring via the "check
  now" seam.
- Real CDN cache behavior: not reproducible locally. Covered by per-host
  docs recipes (plan 04 §5) plus a "verify your descriptor headers"
  checklist in docs.

## The `examples/` folder

```text
examples/
  vite-react/        # plan 04 — first example
  nextjs/            # plan 05 (no framework suffix: Next is React-only)
scripts/
  simulate-deploy.ts # rebuild active example with a fresh random id
```

Design rules:

- **Bun workspaces.** Root `package.json` gains
  `"workspaces": ["examples/*"]`; examples are `"private": true`, depend on
  `"crispen": "workspace:*"`, and are excluded from knip/publish. Examples
  must import from the built `dist` (run `bun run build` first; CI enforces
  order) so they test what ships, not `src` re-exports.
- **Every example is a "skew lab", not a demo page.** One screen showing:
  running id, target id, status, `isChecking`, `error`, `reloadBlocked`,
  `checkedAt`, an event log, and buttons for check/reload. This is what
  makes manual testing _possible_ — you can see every state axis at once.
- **Test seams, explicitly marked.** The example (not the library) reads
  query params: `?interval=500` (short check interval), `?seam=1` (exposes
  the monitor as `window.__crispenLab` for Playwright). Seams live in
  example code only; the library gets no test-mode flags.
- **One-command manual deploy.** `bun scripts/simulate-deploy.ts` rebuilds
  the running example with a fresh random id into the served directory.
  Manual loop: `bun run lab` (build + serve + open), click around, run the
  simulate script in a second terminal, watch the banner flip. This is the
  answer to "how do I even try this locally".

## CI wiring

- Layers 1–2 run in the existing `test.yml` on every push (fast).
- Layer 3 joins `test.yml` once plan 04 lands (still minutes, keep it in).
- Layer 4 is a separate workflow job (`e2e.yml`): install Playwright
  browsers, `bun run build`, `bun run test:e2e`. Run on PRs to `main`;
  allow manual dispatch. Keep scenarios few and meaningful — five sharp
  scenarios beat thirty flaky ones.

## Sequencing

| When           | Testing work                                                |
| -------------- | ----------------------------------------------------------- |
| With plan 01   | Layer 1 for protocol                                        |
| Before plan 02 | `RuntimeEnvironment` seam agreed (this plan, §1)            |
| With plan 02   | Layer 1 for runtime (fake env, virtual time)                |
| With plan 03   | Layer 2                                                     |
| With plan 04   | Layer 3 (Vite), `examples/vite-react` skew lab, first three |
|                | e2e scenarios, `simulate-deploy.ts`                         |
| After plan 04  | Remaining e2e scenarios, `e2e.yml`                          |
| With plan 05   | Layer 3 (Next), `examples/nextjs` reusing the same          |
|                | Playwright scenarios (they must pass unchanged — adapter    |
|                | independence, tested)                                       |

## Acceptance

- A contributor with no context can run `bun run lab`, run
  `bun scripts/simulate-deploy.ts` in a second terminal, and watch the
  stale banner appear within seconds
- The mixed-version loop scenario fails if the reload guard is deleted
  (the guard is load-bearing in a test, not just implemented)
- The same Playwright scenario files pass against both the Vite and Next
  examples
