# Plan 10 — React subscription and action coverage

Complete focused React coverage for option changes and `reload()` while keeping
all scheduling and state logic in the headless runtime.

Depends on the shared monitor policy in plan 08.

## Scope

Add component tests for two public hook behaviors:

1. a meaningful option change causes React to use a new subscription policy
2. `reload()` returned by the hook reaches the monitor and browser environment

Do not move runtime policy into the hook. Do not expose new production APIs only
to make these tests possible.

## 1. Options change and resubscription

Use Testing Library `rerender` with one stable `DeploymentSource`.

Recommended behavioral test:

1. render with `checkOnSubscribe: false` and an `isCurrent` predicate that
   returns true
2. run a check and observe `current`
3. rerender with a different predicate that returns false
4. run another check
5. observe `stale`
6. verify that later state updates reach the component only once

This proves that a meaningful option change reaches the shared monitor. It does
not couple the test to `useCallback`, listener counts, or React implementation
details.

Keep the existing shallow-equal inline-options and Strict Mode tests. Together,
the three cases define the lifecycle contract:

- shallow-equal options do not cause needless churn
- changed options become effective
- Strict Mode churn does not duplicate a check or lose the subscription

If the test uses two components, follow the predicate priority contract from
plan 08 explicitly. Do not rely on an unspecified render order.

## 2. `reload()` through the hook

Render a component that calls the `reload` function returned by
`useDeploymentStatus` from a user action.

Drive the monitor to `stale` first so that running and target deployments are
known. Then invoke the action and assert observable runtime effects:

- the reload marker is written to session storage
- the browser reload operation is requested once
- the component receives `reloadBlocked` if the guard blocks a later attempt

Prefer observable effects over spying on a bound function reference. Restore all
browser globals and storage after the test.

The Playwright deployment test remains the authority for a real navigation and
recovery on a new running deployment. This component test provides fast fault
isolation for hook wiring only.

## Test support

Reuse existing test support for sources, pending promises, storage, and the
runtime environment. If browser `location.reload` cannot be replaced safely in
the DOM implementation, inject an existing fake environment through test
support below the registry. Do not add a public hook option for the environment.

Any new test-only registry seam must:

- stay internal
- reset after every test
- not change production monitor identity rules

## Sequencing

1. Complete the predicate contract and tests from plan 08.
2. Add the options-change component test.
3. Add the hook reload action test.
4. Run the focused React tests.
5. Run the runtime tests and Playwright deployment test to check both sides of
   the integration boundary.

## Acceptance

- a shallow-equal rerender stays subscribed without needless work
- a meaningful option change becomes effective after rerender
- Strict Mode still causes one initial target resolution
- calling `reload()` through the hook reaches the reload guard
- the existing Playwright test still proves real reload recovery
