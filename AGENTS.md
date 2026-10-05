# AGENTS.md

Use ASD-STE100 Simplified Technical English for all communication.

Before you explore or change code, read `GLOSSARY.md` and `docs/agents/domain.md`. Use the glossary terms.

## Agent skills

### Source references

When a skill needs the source of a dependency, use Packref. See the Packref section below.

### Issue tracker

Issues, PRDs, and plans are GitHub issues at `adelrodriguez/crispen`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain-doc layout. See `docs/agents/domain.md`.

### Changesets

Before you commit a change that package consumers see, read `docs/agents/changesets.md`.

### Implementation plans

Write a plan in the body of the GitHub issue that it serves. Keep plan files out of the repository. See `docs/agents/issue-tracker.md`.

## Documentation

User docs live in `docs/`, one mode per folder: `how-to/` for tasks, `reference/` for the API, and `explanation/` for design. `README.md` is the landing page and links to every page. `CONTRIBUTING.md` covers local setup and the skew lab.

- When you change public behavior, update the matching page in `docs/reference/` in the same commit.
- When you change a design decision, update `docs/explanation/how-crispen-detects-a-stale-client.md`.
- Check every fact in a doc against `src/`.

## Repository rules

- Use Bun for package management and scripts.
- After edits, run `bun run test`, `bun run build`, `bun run check`, and `bun run format`.
- After dependency, import, or export changes, run `bun run analyze` and `bun run test:exports`.
- After runtime, integration, or adapter changes, run `bun run test:e2e`.
- Keep tests in a `__tests__/` folder next to the code under test. Only `e2e/` and `tests/package-contract/` live outside `src/`.
- Keep the protocol in `src/lib/protocol/`, the headless runtime in `src/lib/runtime/`, integrations in `src/integrations/<library>/`, and adapters in `src/adapters/<tool>/`.
- Import in one direction only: `src/lib/protocol/`, then `src/lib/runtime/`, then `src/integrations/`. Adapters import only from `src/lib/protocol/` and `src/adapters/shared.ts`. An integration never imports an adapter.
- Keep the core and the integrations free of runtime dependencies. Framework packages are optional peer dependencies.
- `crispen`, `crispen/react`, `crispen/vite`, and `crispen/next` are the public entry points. Before you change their runtime behavior or types, consider package consumers.
- Add or update tests for each behavior change.

<!-- ADAMANTITE:START -->

## Adamantite

This project uses Adamantite for its managed formatting, linting, type checking, and dependency-analysis setup.

- Prefer the package scripts Adamantite added for this workspace.
- Run `bun run format` after editing files. Direct command: `adamantite format`.
- Run `bun run check` to catch lint and type issues. Direct command: `adamantite check`.
- Run `bun run fix` to apply safe lint fixes. Direct command: `adamantite fix`.
- Run `bun run analyze` after changing dependencies, imports, or exports. Direct command: `adamantite analyze`.
- Use `adamantite doctor` to inspect managed setup and `adamantite doctor --fix` for safe local fixes.

<!-- ADAMANTITE:END -->

<!-- PACKREF:START -->

## Packref

Packref provides local copies of dependency source code so you can inspect the exact implementation used by this project.

- Source references are stored in `.packref/packages/<registry>/<package>/<version>/` for unscoped packages and `.packref/packages/<registry>/<scope>/<package>/<version>/` for scoped packages — browse these directories to read dependency internals
- `.packref/packref-lock.json` is shared and should be committed; `.packref/packages/` is developer-local and git-ignored
- Run `packref install` after cloning when locked references are missing; install restores locked references exactly and does not install runtime dependencies
- Available commands:
  - `packref add [package]` — select manifest dependencies or fetch a named package (e.g. `packref add react`, `packref add hono@4.2.0`, `packref add @effect/cli`)
  - `packref remove [package]` — select or name package references to remove
  - `packref install` — materialize every reference already recorded in the committed lockfile
  - `packref sync` — update dependency-tracked lock entries to match current `package.json` dependency versions
  - `packref list` — show all referenced packages
  - `packref prune` — remove unused entries from the global store
  - `packref clean` — remove all project-local references
  - `packref clean --global` — wipe all global store entries
- Use Packref when you need to understand how a dependency works internally — read the source in `.packref/` instead of guessing or searching the web
- Multiple versions of the same package can coexist; check `.packref/packref-lock.json` for the full list

<!-- PACKREF:END -->
