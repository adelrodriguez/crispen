---
"crispen": patch
---

Type the timer handles of `RuntimeEnvironment` as the new exported `TimerHandle` type instead of `unknown`. `parseDescriptor` now rejects a JSON `null` descriptor with an `unsupported-version` error instead of a `TypeError`.
