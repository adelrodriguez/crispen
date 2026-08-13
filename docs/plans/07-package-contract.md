# Plan 07 — Published package contract

Protect the package that consumers install. The examples continue to prove built
runtime behavior, while this plan verifies the exact root export map and generated
declarations.

## Problem

The Vite and Next examples map public `crispen` application imports directly to
source files, while their configuration files import built adapters by file path.
This tests adapter integration, but it does not verify the published package
contract:

- the example aliases bypass the root `package.json` export map
- the examples do not consume generated declarations in `dist`
- bundlers can accept module shapes that a direct Node consumer rejects
- unused exports can be broken without affecting an example

This plan complements the examples. It does not replace their build or Playwright
coverage.

## Deliverables

1. A small temporary consumer fixture or verification script that imports every
   public entry point through the root package export map.
2. A compile-only TypeScript consumer that resolves generated declarations from
   `dist`.
3. A `test:exports` package script.
4. CI wiring that runs the export check after a clean package build.

## Runtime export check

Verify these entry points with the minimum supported Node version:

- `crispen`
- `crispen/react`
- `crispen/vite`
- `crispen/next`

For each entry point:

- import it by package name, not by a `dist` path
- assert a small set of representative runtime exports exists
- do not duplicate behavior tests from the source suite

The check must use Node. Bun can remain the script runner, but it must spawn Node
for the consumer imports.

Before the check, remove `dist` and run `bun run build`. A clean build prevents a
removed source entry from passing because of a stale output file.

## Declaration check

Compile a small TypeScript consumer that imports representative values and types
from all four entry points. It must resolve the root package's generated
`dist/**/*.d.ts` files.

The fixture must not use:

- relative imports into `src`
- path aliases that bypass `package.json#exports`
- the source aliases used by the examples
- `skipLibCheck` as a way to hide broken generated declarations

The check only needs `tsc --noEmit`. It does not need to run the compiled fixture.

## Packaging strength

Start with root self-reference imports because they are fast and use the export
map. If that does not verify `files` or packed contents, strengthen the check by
packing Crispen into a temporary directory and installing that artifact into the
consumer fixture.

Do not begin with a package-manager matrix. One Node consumer against the packed
or self-referenced package is sufficient for v1.

## Script and CI contract

`bun run test:exports` owns the clean build and both consumer checks. It must be
safe to run from a clean clone.

Run it in the build workflow after dependency installation. Keep source unit
tests separate because this check validates generated artifacts.

## Tests

The verifier must fail when any of these mutations is made locally:

- one root export points at a missing JavaScript file
- one root export points at a missing declaration file
- a representative named export is removed from a built entry point
- `dist` contains stale output but the current build no longer emits it

These are mutation checks for implementing the verifier. They do not need to
become permanent test cases.

## Acceptance

- all public entry points import through the root export map under Node
- generated declarations compile in a consumer with no source aliases
- the check starts from a clean `dist`
- the examples remain the authority for built application and browser behavior
