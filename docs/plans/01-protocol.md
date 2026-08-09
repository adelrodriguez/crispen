# Plan 01 — Protocol and repo foundations

Delivers the shared protocol layer everything else builds on, plus the
package restructuring for subpath exports. No scheduling, no React, no Vite.

## Deliverables

1. `src/protocol/` with types, descriptor codec, embed reader, HTTP source
2. Package restructuring: exports map, bunup entries, placeholder subpath
   modules
3. Unit tests for every parse/validate path

## 1. Types (`src/protocol/types.ts`)

```ts
export interface Deployment {
  id: string
  builtAt?: Date
}

export interface DeploymentSource {
  running: Deployment
  resolveTarget(signal: AbortSignal): Promise<Deployment>
}

export type DeploymentPolicy = (running: Deployment, target: Deployment) => "current" | "stale"
```

Notes:

- `supportedUntil` is deliberately absent (decision 6 in plan 00).
- `resolveTarget` must not consult the running deployment. Document this on
  the type: a source pinned to the old deployment would report its own id and
  always look current.

## 2. Descriptor wire format (`src/protocol/descriptor.ts`)

The descriptor is the JSON served at the endpoint. It is versioned and
append-only: fields may be added, never changed or removed. Old clients run
for days and will parse descriptors emitted by future adapter versions.

```json
{ "v": 1, "id": "abc123", "builtAt": "2026-08-09T12:00:00Z" }
```

Implement:

- `DescriptorV1` type (wire shape: strings, not `Date`)
- `serializeDescriptor(deployment): string` — used by adapters
- `parseDescriptor(text: string): Deployment` — used by the runtime; throws
  `DescriptorError` with a reason code:
  - `invalid-json` — not JSON. This is the SPA-fallback case: history
    fallback serves `index.html` with a 200 for unknown paths. Must surface
    as an error, never as current or stale.
  - `unsupported-version` — `v` missing or not a known version. Parse
    leniently: if `v` is a _higher_ number but `id` is present and a string,
    still return the deployment (forward compatibility); only reject when
    `id` is unusable.
  - `invalid-shape` — `id` missing/empty.
- `builtAt` parses from ISO 8601; an invalid date drops the field rather
  than failing the parse (it is optional metadata).

## 3. Embed convention (`src/protocol/embed.ts`)

The embed is how an adapter hands the running identity and config to the
core without the core knowing the adapter exists. Adapters write it by any
mechanism (inline script, virtual module, define); the shape is fixed:

```ts
interface CrispenEmbed {
  v: 1
  running: { id: string; builtAt?: string }
  endpoint?: string // default "/_crispen/deployment.json"
}

declare global {
  var __CRISPEN__: CrispenEmbed | undefined
}
```

Implement `readEmbed(): CrispenEmbed | undefined` with shape validation
(malformed embed → `undefined` plus one `console.warn` in dev). A missing
embed is not an error — it is the dev-mode/inert signal (plan 02).

The embed must be written before app code runs. Classic inline `<script>` in
`<head>` satisfies this because module scripts are deferred; adapters that
inject a module instead must ensure import order. This constraint is
documented here and tested per adapter.

## 4. HTTP source (`src/protocol/http-source.ts`)

`createHttpSource(running: Deployment, endpoint: string): DeploymentSource`

`resolveTarget` does:

```ts
fetch(endpoint, { cache: "no-store", signal })
```

Validation order, each failure a typed `TargetResolutionError`:

1. network failure → `network`
2. `!response.ok` → `http-status`
3. content-type does not include `json` → `not-json` (SPA fallback often
   returns 200 + `text/html`; catch it before parsing)
4. `parseDescriptor` failures pass through

Also export `createEmbeddedSource(): DeploymentSource | undefined` — builds
the default source from `readEmbed()` (running from embed, HTTP source at
embed endpoint or default path). This is what the registry (plan 02) uses.

## 5. Repo restructuring

- `src/index.ts` re-exports protocol (runtime joins in plan 02). Delete the
  template `main()` and its test.
- `package.json`:
  - `exports` map for `.`, `./react`, `./vite`, `./next` (types + import per
    entry), `main`/`module` removed in favor of `exports`
  - remove template keywords; add real ones (`deployment`, `version-skew`,
    `stale-client`, `vite-plugin`, `react-hook`)
  - `peerDependencies` + `peerDependenciesMeta` (all optional): `react`,
    `vite`, `next`
- `bunup.config.ts`: entries for all four subpaths (placeholder modules for
  react/vite/next so builds pass before plans 03–05 land)
- Keep knip/adamantite green: `bun run check`, `bun run analyze`

## Tests (`bun test`)

- descriptor: round-trip; each error reason; HTML body; higher `v` with
  valid id parses; invalid `builtAt` drops field
- embed: valid, missing, malformed shapes
- http source: mock `fetch` for each validation step; abort propagates
- exports: `bun run build` then import each subpath from `dist`

## Acceptance

- `bun run check`, `bun test`, `bun run build` all pass
- A hand-written `DeploymentSource` (no adapter) satisfies the same types —
  proves the custom-integration path from the spec still works
