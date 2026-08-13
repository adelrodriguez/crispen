# Crispen — Ubiquitous language

Crispen detects and manages skew between a running frontend client and the
currently deployed application.

## Vocabulary registers

One term per register. Do not mix them.

- **"skew"** — prose only. Problem statements, docs, README. Never in code.
- **"current" / "stale"** — code only. API status values and identifiers.
- **"fresh"** — brand only. Tagline and marketing copy. Never in code or specs.

## Roles

- **Adapter** — a build-tool or framework package (`crispen/vite`,
  `crispen/next`, `crispen/astro`). An adapter embeds the running deployment
  identity into the built application and serves the deployment descriptor.
  Adapters were called "producer integrations" in early drafts.
- **Integration** — a UI library package (`crispen/react`, `crispen/svelte`).
  An integration exposes monitor state through the library's native primitives
  (hooks, stores). Integrations were called "consumer adapters" in early
  drafts.
- **Core** — the `crispen` root export: the protocol plus the headless runtime.

Governing rule: adapters may use framework-specific mechanisms, but they must
produce identical runtime semantics. Integrations must never depend on a
particular adapter.

## Domain terms

- **Deployment** — an identified build of the application. Shape:
  `{ id: string, builtAt?: Date }`.
- **Running deployment** — the deployment that produced the JavaScript
  currently executing in this client. Immutable for the life of the page.
- **Target deployment** — the deployment this client should currently be
  using. Deliberately not "latest": during canaries, tenant pinning, or staged
  rollouts the newest global deployment may not be this client's target.
- **`DeploymentSource`** — the protocol object connecting adapters to the
  runtime: `{ running: Deployment, resolveTarget(signal): Promise<Deployment> }`.
  `resolveTarget` must resolve independently of the running deployment.
- **Descriptor** — the wire representation of the target deployment, served as
  JSON at `/_crispen/deployment.json`. Versioned (`v: 1`). The descriptor is
  the one surface that must never break: long-lived old clients read
  descriptors emitted by future adapters.
- **Embed** — the build-time injected global (`globalThis.__CRISPEN__`) that
  carries the running deployment identity and adapter config (such as a custom
  endpoint) into the browser. The embed is how the core learns the running
  identity without knowing which adapter produced it.
- **Monitor** (`DeploymentMonitor`) — the headless runtime. It schedules and
  deduplicates checks, evaluates whether the running deployment is current,
  holds state, and exposes `check()` and `reload()`. One shared monitor exists
  per `DeploymentSource`; consumers subscribe to it, they do not own it. No
  provider component exists.
- **Check** — one resolution of the target plus one `isCurrent` evaluation. A
  check never rejects; failures land in state as `error`.
- **`isCurrent`** — an optional pure predicate `(running, target) => boolean`.
  Exact deployment ID equality is the default.
- **`DeploymentStatus`** — the state object consumers receive:
  `status` (`"unknown" | "current" | "stale"`), `checkStatus` (`"checking" |
"idle"`), `reloadStatus` (`"ready" | "blocked" | "unprotected"`), `error`,
  `running`, `target`, `checkedAt`, `check()`, `reload()`. `status` is durable
  knowledge; `checkStatus`, `reloadStatus`, and `error` are orthogonal axes and
  never erase it.
  When `status` is `"current"` or `"stale"`, `target` and `checkedAt` are
  non-null.
- **Reload guard** — sessionStorage-based protection inside `reload()` that
  detects reloads which land back on the same running deployment and blocks
  reload loops. `reloadStatus` is `"unprotected"` when session storage is
  unavailable or a storage operation fails.
