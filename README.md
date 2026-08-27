<div align="center">
  <h1 align="center">🥬 <code>crispen</code></h1>

  <p align="center">
    <strong>Detect when a long-lived web client runs an old deployment.</strong>
  </p>
</div>

Crispen embeds the running deployment identity in each page. It checks an
independent deployment descriptor and reports `current` or `stale`. It does
not force a reload. Your interface controls when and how the user reloads.

## Install

```sh
bun add crispen
```

Install the peer for your adapter and integration. Crispen supports React 18
or later, Vite 5 or later, and Next.js 15 or later.

## Vite and React

Add the adapter after the React plugin:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react"
import { crispen } from "crispen/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), crispen()],
})
```

Use the React hook in client code:

```tsx
import { useDeploymentStatus } from "crispen/react"

export function UpdateNotice() {
  const deployment = useDeploymentStatus()

  if (deployment.status !== "stale") {
    return null
  }

  return (
    <aside>
      <p>A new version is available: {deployment.target.id}</p>
      <button type="button" onClick={deployment.reload}>
        Reload
      </button>
    </aside>
  )
}
```

The Vite adapter does these operations during a production build:

- It embeds the running deployment before application scripts.
- It emits `/_crispen/deployment.json` with the same identity.
- It uses `deploymentId`, then `GIT_SHA`, `VERCEL_GIT_COMMIT_SHA`,
  `CF_PAGES_COMMIT_SHA`, or `GITHUB_SHA`. It uses a random UUID last.

The adapter is inert during `vite dev`. Use a static source to exercise your
`current` and `stale` interface states without a production build:

```tsx
import { createStaticSource } from "crispen"
import { useDeploymentStatus } from "crispen/react"

const developmentSource = import.meta.env.DEV
  ? createStaticSource({ id: "dev-running" }, { id: "dev-target" })
  : undefined

export function UpdateNotice() {
  const deployment = useDeploymentStatus({ source: developmentSource })

  if (deployment.status !== "stale") {
    return null
  }

  return <p>A new version is available.</p>
}
```

Keep the source at module scope so that renders use one shared monitor. Use the
same deployment ID for both arguments to simulate `current`. Use different IDs
to simulate `stale`.

When you set Vite `base`, the adapter adds it to the default descriptor endpoint.
A local explicit `endpoint` is relative to that base. An external endpoint stays
unchanged. For a relative or full-URL base, the local endpoint stays
root-absolute on the application origin.

```ts
crispen({
  deploymentId: process.env.RELEASE_ID,
  endpoint: "https://deployments.example.com/current.json",
})
```

When `endpoint` is an absolute or protocol-relative URL, the adapter does not
emit a local descriptor.

## Next.js and React

Wrap the Next.js config:

```ts
// next.config.ts
import { withCrispen } from "crispen/next"

export default withCrispen({}, { deploymentId: process.env.GIT_SHA })
```

Add the embed to the App Router root layout:

```tsx
// app/layout.tsx
import { CrispenScript } from "crispen/next"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CrispenScript />
        {children}
      </body>
    </html>
  )
}
```

Mount the App Router descriptor. The encoded folder name is required because
Next.js treats an app folder with a literal leading underscore as private.

```ts
// app/%5Fcrispen/deployment.json/route.ts
export { GET } from "crispen/next"

// Add this line only when you use `output: "export"`.
export const dynamic = "force-static"
```

For the Pages Router, render `CrispenScript` in the custom document and mount
the handler:

```ts
// pages/_crispen/deployment.json.ts
export { crispenPagesHandler as default } from "crispen/next"
```

`withCrispen` preserves user config values, `generateBuildId`, `deploymentId`,
`env`, and `headers()`. It does not set Next.js `deploymentId`, because that
value can conflict with host skew protection. It adds the Crispen environment
values and a `no-store` header rule for a local endpoint. When you set Next.js
`basePath`, the adapter adds it to local default and explicit descriptor
endpoints. An external endpoint stays unchanged. `next dev` is inert. To use
the static-source pattern in Next.js, select the source with
`process.env.NODE_ENV === "development"` instead of `import.meta.env.DEV`.

Next.js does not apply `headers()` rules to `output: "export"`. For a static
export, add the descriptor cache rule in your hosting platform. See
[Descriptor cache rules](#descriptor-cache-rules).

Vercel custom client fetches are not pinned by skew protection by default. If
your app sets the `__vdpl` cookie, it pins all requests. In that case, use an
unpinned control-plane origin as `endpoint`, or exclude the Crispen path from
that cookie behavior.

## React API

`useDeploymentStatus(options?)` returns `DeploymentStatus`. All components
with the same source share one monitor and one request. The hook uses an inert
`unknown` state during server rendering.

```ts
const deployment = useDeploymentStatus({
  checkInterval: 5 * 60_000,
  checkOnReconnect: true,
  checkOnSubscribe: true,
  checkOnVisible: true,
})
```

Inline option objects are shallow-stabilized, so they do not cause needless
subscriptions. `source` and `isCurrent` are compared by reference, so hoist or
memoize them when you pass your own.

The options are:

| Option             | Default         | Purpose                                                      |
| ------------------ | --------------- | ------------------------------------------------------------ |
| `checkInterval`    | `300000`        | Check interval in milliseconds. The minimum is 10000.        |
| `checkOnReconnect` | `true`          | Check when the browser returns online.                       |
| `checkOnSubscribe` | `true`          | Check when the first subscriber attaches.                    |
| `checkOnVisible`   | `true`          | Check when the page becomes visible or returns from bfcache. |
| `isCurrent`        | exact ID match  | Return whether the running deployment is current.            |
| `source`           | embedded source | Use a custom `DeploymentSource`.                             |

`DeploymentStatus` has these fields:

| Field          | Type                                         | Meaning                                                                                                 |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `status`       | `"unknown" \| "current" \| "stale"`          | Last successful deployment comparison.                                                                  |
| `checkStatus`  | `"checking" \| "idle"`                       | Whether a target check is active.                                                                       |
| `error`        | `Error \| null`                              | The last resolution error. A failed check does not erase durable status.                                |
| `running`      | `Deployment`                                 | Identity embedded in the current page.                                                                  |
| `target`       | `null` for `unknown`; otherwise `Deployment` | Last successfully resolved target. `status` narrows this field.                                         |
| `checkedAt`    | `null` for `unknown`; otherwise `Date`       | Time of the last successful check. `status` narrows this field.                                         |
| `reloadStatus` | `"ready" \| "blocked" \| "unprotected"`      | State of the reload guard. An unprotected reload remains available when session storage is unavailable. |
| `check()`      | `Promise<DeploymentStatus>`                  | Check now. It never rejects, and resolves with the resulting status.                                    |
| `reload()`     | `void`                                       | Request a guarded page reload.                                                                          |

During server rendering, `reloadStatus` is always `"unprotected"` because
session storage is not available.

## Headless API

The root `crispen` export has no React or adapter dependency.

```ts
import { createDeploymentMonitor, createHttpSource } from "crispen"

const source = createHttpSource(
  { id: "running-release" },
  "https://deployments.example.com/current.json",
  {
    credentials: "include",
    headers: { authorization: "Bearer token" },
  }
)
const monitor = createDeploymentMonitor(source)

const unsubscribe = monitor.subscribe(
  () => {
    const state = monitor.getState()
    console.info(state.status, state.target?.id)
  },
  { checkOnSubscribe: true }
)
```

The headless exports are:

- `createDeploymentMonitor(source?, options?)` creates an independent
  monitor. `options.environment` supplies the deterministic runtime seam,
  `options.isCurrent` changes how deployments are compared, and
  `options.checkTimeout` changes the target-resolution timeout.
- `getDefaultMonitor()` returns the lazy monitor from the build embed.
- `getMonitor(source)` returns one shared monitor for each source object.

- `createHttpSource(running, endpoint, init?)` creates a no-cache HTTP source.
  `init` accepts fetch request settings and an optional custom `fetch` function.
  Crispen always controls `cache` and `signal`.
- `createStaticSource(running, target)` creates a fixed source for development,
  previews, and tests.
- `createEmbeddedSource()` creates a source from `globalThis.__CRISPEN__`, or
  returns `undefined` when no valid embed exists.
- `createBrowserEnvironment()` is not public. Implement `RuntimeEnvironment`
  only for tests or a non-browser runtime and pass it to the monitor.
- `DEFAULT_CHECK_TIMEOUT` is the default target-resolution timeout.

`DeploymentMonitor` provides `getState`, `subscribe`, `check`, `reload`, and
`destroy`. Destruction is terminal: later subscriptions, checks, and reloads
are inert. A registry lookup after destruction returns a new monitor.
Subscriber options use the same schedule fields as the React hook.
When several subscribers differ, Crispen uses the shortest interval and the
union of enabled triggers. The earliest currently active subscriber with an
explicit `isCurrent` predicate has priority. Subscribers without a predicate do
not take priority. All subscribers see the same verdict.

A check times out after `DEFAULT_CHECK_TIMEOUT` (30 seconds) unless an
independent monitor sets `options.checkTimeout`. The timeout must be a finite
number of milliseconds and cannot be disabled. A timeout aborts target
resolution, records an error, and preserves the last known status, target, and
check time. A later check can recover.

The root also exports these types: `CheckStatus`, `Deployment`,
`DeploymentSource`, `ReloadStatus`, `HttpSourceInit`, `IsDeploymentCurrent`,
`DeploymentStatus`, `DeploymentMonitor`, `DeploymentMonitorOptions`,
`DeploymentSubscriberOptions`, `RuntimeEnvironment`, `RuntimeEvent`,
`RuntimeEventType`, and `RuntimeStorage`.

## Descriptor protocol

The v1 descriptor is small and forward-compatible:

```json
{ "v": 1, "id": "release-123", "builtAt": "2026-08-10T12:00:00.000Z" }
```

- `serializeDescriptor(deployment)` writes this wire format.
- `parseDescriptor(text)` validates it and returns a `Deployment`. It accepts
  a higher positive integer version when the `id` remains usable.
- `readEmbed()` validates `globalThis.__CRISPEN__`.
- `DEFAULT_DESCRIPTOR_ENDPOINT` is `/_crispen/deployment.json`.
- `DescriptorError` has reason `invalid-json`, `unsupported-version`, or
  `invalid-shape`.
- `TargetResolutionError` has reason `network`, `http-status`, or `not-json`.

The related public types are `DescriptorV1`, `DescriptorErrorReason`,
`TargetResolutionErrorReason`, and `CrispenEmbed`.

You can implement a custom source for a signed control plane or another
transport:

```ts
import type { DeploymentSource } from "crispen"

const source: DeploymentSource = {
  running: { id: "release-123" },
  async resolveTarget(signal) {
    const response = await fetch("https://example.com/release", { signal })
    const value = (await response.json()) as { id: string }
    return { id: value.id }
  },
}
```

The target request must stay independent of the running deployment. Do not
route it to a deployment-pinned origin.

## Descriptor cache rules

The descriptor must not use a browser, CDN, or reverse-proxy cache. Return
`Cache-Control: no-store` and `Content-Type: application/json`.

Cloudflare Pages and Netlify can use a `_headers` file:

```text
/_crispen/deployment.json
  Cache-Control: no-store
  Content-Type: application/json
```

Vercel can use `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/_crispen/deployment.json",
      "headers": [{ "key": "Cache-Control", "value": "no-store" }]
    }
  ]
}
```

Nginx can use:

```nginx
location = /_crispen/deployment.json {
  add_header Cache-Control "no-store" always;
  try_files $uri =404;
}
```

Verify production after each host-config change:

```sh
curl -i https://example.com/_crispen/deployment.json
```

Confirm a successful status, JSON content type, `Cache-Control: no-store`, and
the current target identity. An HTML response often means an SPA fallback
caught the descriptor path. Crispen reports `not-json` and keeps its last
durable status.

## Local skew lab

The Vite and Next.js examples use the built package and run the same browser
scenarios.

```sh
bun install
bun run lab
```

In a second terminal, activate a new Vite deployment:

```sh
bun scripts/simulate-deploy.ts vite-react
```

To run the Next.js lab, activate its first deployment and start its static
server:

```sh
bun scripts/simulate-deploy.ts nextjs
bun scripts/static-server.ts --root examples/nextjs/serve --port 4174
```

Run `bun scripts/simulate-deploy.ts nextjs` again from another terminal to
simulate the next deployment. The lab query seams are limited to example
code: `?interval=10000` changes the interval, and `?seam=1` exposes the
monitor as `globalThis.__crispenLab`.

Run all checks with:

```sh
bun run check
bun run test
bun run test:e2e
bun run build
bun run analyze
```

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry).
