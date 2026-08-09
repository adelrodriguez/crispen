# Plan 04 — Vite adapter (`crispen/vite`)

Delivers the first adapter: a Vite plugin that embeds the running identity
and emits/serves the descriptor. Proves the zero-config story end to end.
Depends on plan 01 (protocol); the e2e milestone additionally needs 02 + 03.

## Deliverables

1. `src/vite/index.ts` — `crispen(options?)` Vite plugin
2. e2e example app under `examples/vite-react/` (workspace, not published)
3. Docs recipe for descriptor cache headers per host

## 1. Plugin API

```ts
// vite.config.ts
import { crispen } from "crispen/vite"

export default defineConfig({
  plugins: [crispen()],
})
```

Options:

```ts
interface CrispenViteOptions {
  deploymentId?: string // default: resolved per §2
  endpoint?: string // default: "/_crispen/deployment.json"
}
```

No other options in v1. Every option added here is adapter API forever.

## 2. Deployment id resolution

Resolved once per build, in order:

1. `options.deploymentId`
2. CI env vars: `GIT_SHA`, `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`,
   `GITHUB_SHA` (extend list as hosts are confirmed — open question 4 in
   plan 00)
3. Random id generated at config-resolution time (stable for the whole
   build; distinct per build — which is all correctness requires)

`builtAt` is always stamped at build time.

## 3. Build mode behavior

- **Embed**: `transformIndexHtml` injects a classic inline `<script>` into
  `<head>` writing `globalThis.__CRISPEN__ = {...}` (serialized
  `CrispenEmbed` from plan 01). Classic inline scripts execute before
  deferred module scripts, satisfying the embed-before-app-code constraint.
  Escape the serialized JSON for HTML script context (`</script>`, U+2028/29).
- **Descriptor**: `generateBundle` → `this.emitFile` an asset at
  `_crispen/deployment.json` (respecting a custom `endpoint` only when it is
  a relative path under the site root; an absolute-URL endpoint means an
  external control plane — emit nothing, only point the embed at it).
- Non-HTML entries (lib mode, MPA edge cases): v1 supports the standard
  index.html SPA/MPA flow; document that lib-mode builds get the descriptor
  but no embed injection (no HTML to inject into) and need a custom
  integration.

## 4. Dev mode behavior

Two acceptable designs — decide during implementation, document the choice:

- **A (preferred): no embed in dev.** The core finds no embed and runs
  inert (plan 02 §2). Zero moving parts; dev never flags stale.
- B: dev embed + `configureServer` middleware serving a descriptor with a
  per-dev-session id. Only worth it if we want to demo the stale flow
  without a real build.

Preferred A unless e2e work shows a real need for B.

## 5. Caching

The runtime fetches with `cache: "no-store"`, which defeats the browser
cache — but not CDNs that ignore request cache semantics. A static-host
descriptor cannot set its own response headers. Therefore:

- Docs must ship per-host recipes (`_headers` for Cloudflare/Netlify,
  `vercel.json` headers, nginx snippet) setting
  `Cache-Control: no-store` on `/_crispen/deployment.json`.
- The plugin cannot verify host config; add a docs section "verifying your
  descriptor is not cached" (deploy, check response headers).
- Consider (v1.x, not v1): optional cache-busting query param on the fetch
  as a belt-and-braces fallback.

## 6. e2e example (`examples/vite-react/`)

Vite + React app using `crispen()` + `useDeploymentStatus()` with a visible
status banner. Script `examples/vite-react/e2e.sh` (or bun script):

1. Build with id `A`, serve `dist` with a static server
2. Open page (or fetch + assert via a headless check) → status current
3. Rebuild with id `B` over the same serve dir
4. Within one (shortened) check interval → status stale
5. Reload → current again

This is the plan-00 end-to-end milestone. Manual verification is acceptable
for the first pass; scripted assertion is the goal. The full example/e2e
design (skew lab UI, deploy simulator, Playwright scenarios) lives in
[plan 06](./06-testing.md); this section only defines what the Vite example
must prove.

## Tests

- Unit: id resolution order; embed script injection (HTML snapshot,
  escaping); descriptor asset emitted with correct shape; absolute endpoint
  emits no asset
- `parseDescriptor(serializeDescriptor(...))` round-trip against the actual
  emitted asset bytes
- Vite integration test: run `vite build` programmatically against a fixture
  app in a temp dir; assert on `dist` output

## Acceptance

- The spec's zero-config example works verbatim: `crispen()` in
  `vite.config.ts`, `useDeploymentStatus(...)` in a component, no endpoint
  configuration anywhere in app code
- `crispen/react` code contains zero references to Vite (governing rule
  holds); verify with a grep in CI or a knip rule if cheap
