# Plan 03 — React integration (`crispen/react`)

Delivers `useDeploymentStatus`. Thin by design: the runtime (plan 02) already
owns sharing, scheduling, and state; the hook is a subscription. If this plan
grows logic, that logic probably belongs in plan 02.

Reference: `react-query/src/queryOptions.ts` (typed options helper) and
`useBaseQuery.ts` (subscription shape) in the vendored source.

## Deliverables

1. `src/integrations/react/index.ts` — `useDeploymentStatus` and re-exported
   types
2. Tests
3. Peer dependency wiring (`react >= 18`, optional)

## 1. `useDeploymentStatus(options?)`

```tsx
const deployment = useDeploymentStatus({
  policy: exactMatch(),
  checkInterval: 5 * 60_000,
  checkOnVisible: true,
  checkOnReconnect: true,
})
// deployment: DeploymentStatus
```

Implementation:

- Resolve the monitor: `options.source` → `getMonitor(source)`, else
  `getDefaultMonitor()`.
- `useSyncExternalStore(subscribeWithOptions, monitor.getState, getServerSnapshot)`
  - `getServerSnapshot` returns the monitor's inert `unknown` state so SSR
    and hydration render identically (no hydration mismatch).
  - The subscribe callback passes the hook's subscriber options to
    `monitor.subscribe`; unsubscribe on cleanup. React 18 Strict Mode
    double-invokes effects — the runtime's refcounting must tolerate
    subscribe/unsubscribe/subscribe churn without restarting in-flight
    checks (add a runtime test for this in plan 02 if missing).
- Options identity: changing options re-subscribes. Internally, compare by
  shallow equality to avoid churn from inline object literals.
- `check` and `reload` on the returned state are monitor-bound and
  reference-stable across renders.

No provider, no context, no `CrispenProvider` export — ever (decision 3 in
plan 00). Multiple components calling the hook share one monitor and one
schedule via the registry.

## 2. Package wiring

- `exports["./react"]` already scaffolded in plan 01; replace placeholder
- peer: `react >= 18` (needs `useSyncExternalStore`), optional via
  `peerDependenciesMeta` — decide during implementation whether to support
  React 17 via the shim package (`use-sync-external-store`); default: no,
  keep zero dependencies

## Tests

React component tests under `bun test` (happy-dom + @testing-library/react,
dev-only). If bun's test environment fights this, fall back to testing the
hook via `react-test-renderer`-free manual harness — but try the standard
stack first.

- Renders `unknown` with no embed (inert monitor), no crash in SSR-style
  render (`renderToString`)
- Two components, same options object → one `resolveTarget` call (sharing
  works through the hook, not just the runtime)
- State change in monitor → both components re-render with the same
  reference
- Strict Mode mount/unmount/mount → no duplicate checks, no lost
  subscription
- Inline options literal on every render → no re-subscribe storm (shallow
  equality)
- `status === "stale"` narrows correctly in TypeScript consumer code
  (type-level test with `expectTypeOf` or a compile-only fixture)

## Acceptance

- The spec's motivating example works verbatim against a fake source:

```tsx
if (deployment.status === "stale") {
  return <UpdateNotice onReload={deployment.reload} />
}
```

- A stale → checking → still-stale cycle never unmounts the banner
  (the original `FreshnessResult` union bug stays fixed at the UI level)
