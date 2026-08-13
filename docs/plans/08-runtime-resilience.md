# Plan 08 — Shared monitor policy and check timeout

Make two shared-monitor behaviors explicit: which `isCurrent` predicate controls
a shared status, and how a check recovers when target resolution does not settle.

Depends on the current runtime and its deterministic environment seam.

## 1. Multi-subscriber policy

One monitor holds one `DeploymentStatus` for one `DeploymentSource`. Subscribers
can request different schedules, but they cannot hold different status verdicts.
The predicate policy must therefore be deterministic.

### Contract

Keep the current low-disruption policy and state it precisely:

1. The earliest currently active subscriber with an explicit `isCurrent`
   predicate has priority.
2. A subscriber that does not supply `isCurrent` does not take predicate
   priority.
3. Adding a later explicit predicate does not replace the active predicate.
4. When the active predicate's subscriber leaves, the next earliest active
   explicit predicate becomes effective.
5. When no active subscriber supplies a predicate, the monitor default applies.
6. Schedule policy remains independent: shortest interval and union of enabled
   triggers.

Use subscription insertion order. Do not depend on component render order beyond
the order in which subscriptions attach.

### Documentation

Replace phrases such as “first supplied predicate” with “earliest currently
active subscriber with an explicit predicate.” Document that all subscribers see
the same verdict.

Do not add per-subscriber status in this work. That would conflict with one shared
monitor per source and requires a separate API design.

### Tests

Add direct monitor table tests for:

- two active predicates that return opposite results
- an option-free subscriber followed by an explicit predicate
- a later explicit predicate joining without taking priority
- the active predicate leaving and the next predicate taking effect
- all explicit predicates leaving and the monitor default returning
- schedule reconciliation remaining unchanged while predicate priority changes

Each test must run a successful check and assert the resulting status. Do not test
private fields.

## 2. Check timeout

### Failure today

A source can return a promise that never settles. While a subscriber remains:

- `isChecking` stays true
- `check()` keeps returning the same pending promise
- interval and browser-triggered checks cannot recover

An abort signal alone does not solve this when the source ignores the signal.

### Configuration

Add a finite default check timeout. Expose an override only on
`DeploymentMonitorOptions`, not on subscriber options. This keeps timeout
ownership with the monitor and avoids another reconciliation policy.

Choose and document the default before implementation. The value must allow an
ordinary descriptor request to complete on a slow connection while still
recovering within a useful period. Export the default constant if consumers need
it to explain behavior or align telemetry.

Registered monitors use the default. Independent monitors can override it for
special sources and deterministic tests.

### Runtime behavior

When the timeout expires:

1. abort the current resolution
2. finish the check even if the source ignores the signal
3. set `isChecking` to false
4. place a descriptive `Error` in state
5. preserve durable status, target, and `checkedAt`
6. clear the in-flight check so a later check can run
7. ignore any late resolution or rejection from the timed-out operation

A timeout is a failed check, so `check()` still resolves and never rejects.

Keep other cancellation behavior distinct:

- last-subscriber cancellation does not set an error
- destruction is terminal and does not set an error
- Strict Mode unsubscribe/subscribe churn still preserves the initial check

### Environment seam

Extend `RuntimeEnvironment` and its fake with deterministic one-shot timer
operations. Do not use real sleeps in runtime tests. The fake must be able to:

- inspect active timeout delays
- advance or fire timeout callbacks
- prove that completed checks clear their timeout
- prove that timeout and interval handles do not leak after destruction

Use the environment clock for timeout behavior. Do not call browser timers
directly from the monitor.

### Tests

Add direct monitor tests for:

- a never-settling source times out and `check()` resolves
- a source that ignores abort still cannot keep the monitor in flight
- known `current` and `stale` status survives a timeout
- a later successful check clears the timeout error and updates state
- a late result from a timed-out check cannot overwrite newer state
- a successful check clears its timeout handle
- last unsubscribe and destruction clear timeout work
- concurrent callers receive the same result for the timed-out check

## Sequencing

1. Add and document the exact predicate contract.
2. Add predicate-policy tests before changing timeout behavior.
3. Extend the environment seam and fake.
4. Add timeout tests that initially fail.
5. Implement timeout behavior.
6. Run runtime, React, and full checks.

## Acceptance

- conflicting subscribers produce a deterministic, documented shared verdict
- no target resolution can keep a monitor permanently in flight
- timeout failure preserves durable status
- a monitor can recover on the next check
- all time-based tests use the fake environment and do not sleep
