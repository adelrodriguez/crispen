# Plan 09 — Adapter endpoint and Next routing coverage

Protect shared endpoint behavior with direct tables and verify the documented
Next Pages Router route with a real production server.

## 1. Shared endpoint behavior

Endpoint classification and public-path resolution are shared adapter policy.
Keep this logic in a small shared module. The final file can remain
`src/adapters/shared.ts` or become a focused endpoint module, but Vite and Next
must call the same implementation.

### Endpoint contract table

Add direct table tests for external endpoint classification and local endpoint
resolution. Cover at least:

| Base          | Endpoint                         | Expected public endpoint        |
| ------------- | -------------------------------- | ------------------------------- |
| `/app`        | `/_crispen/deployment.json`      | `/app/_crispen/deployment.json` |
| `/app/`       | `descriptor.json`                | `/app/descriptor.json`          |
| `/`           | `/descriptor.json`               | `/descriptor.json`              |
| `./`          | `/_crispen/deployment.json`      | `/_crispen/deployment.json`     |
| full URL base | `/_crispen/deployment.json`      | `/_crispen/deployment.json`     |
| `/app`        | `https://control.example/d.json` | unchanged                       |
| `/app`        | `//control.example/d.json`       | unchanged                       |

Also cover repeated leading or trailing slashes and schemes with valid `+`, `-`,
or `.` characters.

### Query strings and fragments

A local endpoint has two forms:

- the public endpoint embedded for `fetch()`
- the output path used when an adapter emits a local descriptor file

Keep a local query string in the public endpoint, but remove its query and
fragment when deriving the output filename. A request for
`/descriptor.json?tenant=a` must map to the emitted file `descriptor.json`, not
a file whose name contains `?tenant=a`.

A fragment is not sent in an HTTP request. Preserve or reject it consistently in
the public configuration, but it must never become part of an emitted filename.
Record the chosen public-fragment rule in the adapter API documentation.

Add table tests directly against both public endpoint resolution and descriptor
filename derivation. Then retain one Vite build assertion to prove that the
shared result reaches emitted output.

Do not add separate copies of the same edge-case table to each adapter.

## 2. Next Pages Router production check

The documented Pages Router setup uses:

```ts
// pages/_crispen/deployment.json.ts
export { crispenPagesHandler as default } from "crispen/next"
```

A direct handler unit test cannot prove that Next accepts and serves a route with
a leading underscore. Add a minimal real-build fixture for this path.

### Fixture requirements

- use the Pages Router for the descriptor route
- include the required Pages Router document integration for `CrispenScript`
- run the package build before the fixture build
- run `next build`, then `next start`
- request the application HTML and `/_crispen/deployment.json`
- assert the running identity is embedded
- parse the descriptor with Crispen's protocol parser
- assert `Cache-Control: no-store`
- use an allocated local port and always terminate the child server

Keep the existing App Router production check. The Pages Router check is
additional coverage, not a replacement for the encoded `%5Fcrispen` App Router
route.

If sharing fixture setup reduces duplication, extract only process, port, and
temporary-directory helpers. Keep router-specific files visible in each test.

### Build cost

A second Next production build is acceptable because it protects a documented
public setup. Keep both fixtures minimal. Do not add Pages Router to the full
Playwright deployment matrix unless the build test finds behavior that requires
browser coverage.

## Sequencing

1. State query-string and fragment behavior.
2. Add shared endpoint tables.
3. Fix endpoint or output-path behavior exposed by those tables.
4. Add the Pages Router production fixture.
5. Run adapter tests, the package export check, and the full check.

## Acceptance

- shared endpoint edge cases have one direct, readable table
- protocol-relative endpoints are treated as external
- relative bases do not turn descriptor paths into document-relative URLs
- local queries do not become output filename characters
- both documented Next router setups pass a real `next build` and `next start`
