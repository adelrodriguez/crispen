# Plan 05 — Next.js adapter (`crispen/next`)

Delivers `crispen/next`. Starts after plan 04: it reuses the descriptor
logic and its open questions depend on what 04 settles. This plan contains
investigation items — Next's build pipeline (webpack vs Turbopack, App vs
Pages Router) constrains the mechanism more than Vite does, and the plan
must not pretend otherwise.

## Target API

```ts
// next.config.ts
import { withCrispen } from "crispen/next"

export default withCrispen(nextConfig, {
  deploymentId: process.env.GIT_SHA, // optional, same resolution as Vite
})
```

Same options surface as the Vite adapter (`deploymentId`, `endpoint`).

## Responsibilities and candidate mechanisms

### 1. Running identity (embed)

The embed must reach the browser before app code. Candidates, in preference
order — the investigation decides:

- **A: Layout/Document injection helper.** Export a `<CrispenScript />`
  component (renders the inline embed script) that the user adds to the root
  layout. One line of user code; works identically in App and Pages Router
  and under Turbopack. Costs the pure zero-config story — acceptable if the
  alternatives are fragile.
- **B: Build-time define.** Inject via webpack `DefinePlugin` /
  Turbopack `env`-style replacement so the core reads an inlined constant.
  Investigate: do replacements apply inside `node_modules` (the crispen
  package itself) under both bundlers? Historically unreliable — verify, do
  not assume.
- **C: Next build id.** `withCrispen` sets `generateBuildId` and reuses
  Next's own build id as the deployment id. Composes with A or B (it sets
  the _value_, not the _channel_).

### 2. Descriptor

Candidates:

- **A: Static file + headers config.** Build hook writes
  `public/_crispen/deployment.json`; `withCrispen` appends a `headers()`
  entry for `Cache-Control: no-store` on that path. Investigate: `public/`
  mutation timing during `next build`, and whether writing into the user's
  `public/` (a tracked directory) is acceptable — likely needs a
  `.gitignore` note or an out-of-tree emit.
- **B: Route handler.** Ship a ready-made handler the user mounts at
  `app/_crispen/deployment.json/route.ts` (re-export one line from
  `crispen/next`). Explicit, header-controlled, works on serverless hosts
  where `public/` is immutable-cached. Pages Router equivalent: API route +
  rewrite.

Likely outcome: B as the documented default (one file, one line), A as the
static-export path. The investigation confirms.

### 3. Vercel skew interaction

Vercel's own skew protection pins clients to their deployment — which pins
the descriptor fetch too, exactly the trap the spec warns about
(`resolveTarget` must be independent of the running deployment). Investigate
how the descriptor route behaves under skew protection and document the
finding, even if the answer is "disable skew protection or point `endpoint`
at a control-plane origin."

## Investigation phase (timeboxed, before implementation)

Spike in a scratch Next app (latest stable, App Router, Turbopack default):

1. Does DefinePlugin-style replacement reach `node_modules` code under
   webpack and Turbopack builds? (embed candidate B)
2. `public/` write timing during build; behavior on `next dev` (descriptor
   candidate A)
3. Route-handler re-export ergonomics and static export (`output:
"export"`) behavior (descriptor candidate B)
4. Vercel skew protection vs the descriptor route (§3)

Output: a short decision record appended to this plan (mechanism chosen per
responsibility, per router, with the spike evidence).

## Implementation (after decisions)

1. `src/next/index.ts` — `withCrispen`, plus whichever of
   `<CrispenScript />` / route-handler export the decisions require
2. Dev mode: same rule as all adapters — `next dev` produces no stale
   verdicts (inert embed or dev descriptor, matching plan 04's choice)
3. e2e example `examples/nextjs/` mirroring the Vite e2e flow (no `-react`
   suffix — Next only supports React, so the pair is unambiguous)
4. Docs: App Router setup, Pages Router setup (if supported — open question
   2 in plan 00), Vercel notes from §3

## Tests

- Unit: `withCrispen` config merging (preserves user `headers()`,
  `generateBuildId`, etc. — config wrappers that clobber user config are
  the classic Next-plugin bug)
- Integration: programmatic `next build` on a fixture; assert embed present
  in served HTML and descriptor served with `no-store`
- e2e: same build-A/serve/build-B/stale/reload flow as plan 04

## Acceptance

- `crispen/react` works against `crispen/next` with zero changes — the
  adapter/integration independence rule holds across a second adapter,
  which is the architecture's first real test
