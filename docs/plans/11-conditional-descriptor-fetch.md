# Plan 11 — Conditional descriptor fetch (ETag / 304)

Make the common "nothing changed" poll cheap. `createHttpSource` remembers the
descriptor's `ETag` and sends `If-None-Match` on the next check; a `304 Not
Modified` returns the cached target without a body or a parse. Static hosts
and CDNs emit ETags automatically, so most deployments get this for free with
no server changes.

Depends on the current protocol layer. No runtime, integration, or adapter
changes.

## Motivation

Every check today downloads and parses the full descriptor even though the
answer is almost always "unchanged." The payload is small, so this is not
about bytes; it is about making the steady-state poll a header-only exchange
and keeping the door open for aggressive polling intervals.

`cache: "no-store"` stays. It exists to bypass the browser HTTP cache, whose
heuristics we do not control. Conditional revalidation is handled manually so
the source — not the browser — owns freshness.

## Contract

State per source instance (closure in `createHttpSource`): at most one cached
pair `{ etag, target }`. The cache is written only when a `200` response with
an `ETag` header parses successfully, so the etag and the target always
correspond.

Request:

1. When a cached pair exists, send `If-None-Match` with the cached etag.
2. The source owns `If-None-Match`. Merge caller headers from `init` first,
   then set the conditional header, overwriting any caller-supplied value.
   Build the merge with `new Headers(requestInit.headers)` so records,
   arrays, and `Headers` instances all work.
3. Echo the etag verbatim, including weak validators (`W/"..."`).
   `If-None-Match` uses weak comparison per spec; do not normalize.

Response, in order:

1. `304` with a cached pair → resolve with the cached target. Skip the
   content-type check; a `304` has no body.
2. `304` without a cached pair → `TargetResolutionError("http-status",
response)`. We never send `If-None-Match` without a cache, so this is a
   server or intermediary bug. No new error reason: `response.ok` is already
   false for `304`, so this is the current behavior made explicit.
3. Any other non-ok status → `http-status`, unchanged.
4. `200` → existing content-type and parse pipeline, unchanged. On success,
   read the response `ETag`: present → replace the cached pair; absent →
   clear the cache (stop sending a stale validator).
5. Parse or content-type failure → throw as today and keep the existing
   cache. A `304` still proves the cached representation is unchanged, so the
   pair remains valid; a later good deploy produces a different etag and a
   fresh `200`.

Degradation: a server that never sends `ETag` or ignores `If-None-Match`
produces exactly today's behavior. CDNs that strip or rewrite validators
degrade the same way. No configuration option is needed.

Sharing: one monitor holds one source instance, so the cache has the same
lifetime and scope as the monitor. Nothing new to reconcile.

## Non-goals

- `Last-Modified` / `If-Modified-Since` fallback. ETag covers the hosts we
  target; add the fallback only if a real host turns up without ETags.
- HEAD-only polling and push transports (SSE, WebSocket). Rejected in the
  protocol discussion: they lose the descriptor body or require a server.
- Cache persistence across page loads. A fresh page load fetches the
  descriptor once anyway.

## Tests

Extend `src/lib/protocol/http-source.test.ts` with an injected fetch:

- first check sends no `If-None-Match`
- a `200` with an `ETag` caches; the next request carries `If-None-Match`
  with that exact value
- `304` resolves with the cached target and performs no parse
- a `200` with a new etag and body replaces the cached pair; the next request
  sends the new etag
- a `200` without an `ETag` clears the cache; the next request sends no
  `If-None-Match`
- a weak etag (`W/"..."`) round-trips verbatim
- `304` without a prior cache throws `http-status`
- caller headers from `init` survive the merge; a caller-supplied
  `If-None-Match` is overwritten when a cache exists
- a parse failure after a cached `200` keeps the cache; the next request
  still sends the old etag
- network errors and aborts leave the cache untouched

Keep the existing tests green; none of their fixtures send `ETag`, which
itself proves the degradation path.

## Sequencing

1. Add the conditional-fetch tests above; they fail against the current
   source.
2. Implement the cache and request/response handling in `createHttpSource`.
3. Document the conditional behavior on `createHttpSource` and note in the
   adapter docs that static hosts provide ETags automatically.
4. Run protocol tests, then the full check.

## Acceptance

- steady-state polls against an ETag-emitting host are header-only exchanges
- a changed descriptor is still detected on the first check after a deploy
- servers without ETag support see byte-for-byte today's requests
- no public API change: same `HttpSourceInit`, same error reasons, same
  `DeploymentSource` shape
