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
      <p>A new version is available.</p>
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

The adapter is inert during `vite dev`.
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
`basePath`, the adapter adds it to the default descriptor endpoint. An explicit
`endpoint` stays unchanged. `next dev` is inert.

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
import { deploymentStatusOptions } from "crispen/react"

export const deploymentChecks = deploymentStatusOptions({
  checkInterval: 5 * 60_000,
  checkOnReconnect: true,
  checkOnSubscribe: true,
  checkOnVisible: true,
})
```

`deploymentStatusOptions(options)` returns the same object with its inferred
type. Define shared options at module scope when practical. Inline option
objects are also shallow-stabilized.

The options are:

| Option             | Default         | Purpose                                                      |
| ------------------ | --------------- | ------------------------------------------------------------ |
| `checkInterval`    | `300000`        | Check interval in milliseconds. The minimum is 10000.        |
| `checkOnReconnect` | `true`          | Check when the browser returns online.                       |
| `checkOnSubscribe` | `true`          | Check when the first subscriber attaches.                    |
| `checkOnVisible`   | `true`          | Check when the page becomes visible or returns from bfcache. |
| `policy`           | `exactMatch()`  | Classify the running and target deployments.                 |
| `source`           | embedded source | Use a custom `DeploymentSource`.                             |

`DeploymentStatus` has these fields:

| Field           | Type                                | Meaning                                                                                                            |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `status`        | `"unknown" \| "current" \| "stale"` | Last successful policy result.                                                                                     |
| `isChecking`    | `boolean`                           | A target check is active.                                                                                          |
| `error`         | `Error \| null`                     | The last resolution error. A failed check does not erase durable status.                                           |
| `running`       | `Deployment`                        | Identity embedded in the current page.                                                                             |
| `target`        | `Deployment \| null`                | Last successfully resolved target.                                                                                 |
| `checkedAt`     | `Date \| null`                      | Time of the last successful check.                                                                                 |
| `reloadBlocked` | `boolean`                           | The reload guard stopped a repeated mixed-version loop. The guard is inactive when session storage is unavailable. |
| `check()`       | `Promise<void>`                     | Check now. It never rejects.                                                                                       |
| `reload()`      | `void`                              | Request a guarded page reload.                                                                                     |

## Headless API

The root `crispen` export has no React or adapter dependency.

```ts
import { createDeploymentMonitor, createHttpSource } from "crispen"

const source = createHttpSource(
  { id: "running-release" },
  "https://deployments.example.com/current.json"
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
  and `options.policy` changes the default policy.
- `getDefaultMonitor()` returns the lazy monitor from the build embed.
- `getMonitor(source)` returns one shared monitor for each source object.
- `exactMatch()` returns the v1 identity policy.
- `createHttpSource(running, endpoint)` creates a no-cache HTTP source.
- `createEmbeddedSource()` creates a source from `globalThis.__CRISPEN__`, or
  returns `undefined` when no valid embed exists.
- `createBrowserEnvironment()` is not public. Implement `RuntimeEnvironment`
  only for tests or a non-browser runtime and pass it to the monitor.

`DeploymentMonitor` provides `getState`, `subscribe`, `check`, `reload`, and
`destroy`. Subscriber options use the same schedule fields as the React hook.
When several subscribers differ, Crispen uses the shortest interval and the
union of enabled triggers. The first supplied subscriber policy has priority.

The root also exports these types: `Deployment`, `DeploymentSource`,
`DeploymentPolicy`, `DeploymentStatus`, `DeploymentMonitor`,
`DeploymentMonitorOptions`, `DeploymentSubscriberOptions`,
`RuntimeEnvironment`, `RuntimeEvent`, `RuntimeEventType`, and
`RuntimeStorage`.

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
bun run test:exports
bun run build
bun run analyze
```

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry).
