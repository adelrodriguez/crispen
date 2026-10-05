# Contributing to Crispen

Crispen uses Bun 1.3 and Node.js 24 or later.

## Set up

```sh
bun install
bunx playwright install chromium
```

The second command installs the browser for the end-to-end tests.

## Run the checks

Run these commands before you open a pull request. CI runs the same commands.

| Command                | What it does                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `bun run check`        | Lint and type check.                                             |
| `bun run format`       | Format all files.                                                |
| `bun run test`         | Unit tests in `src/`.                                            |
| `bun run build`        | Build the package into `dist/`.                                  |
| `bun run test:exports` | Check that the built package exports match `package.json`.       |
| `bun run test:e2e`     | Build both examples and run the Playwright deployment scenarios. |
| `bun run analyze`      | Find unused files, exports, and dependencies.                    |

## Simulate a deployment in the skew lab

The lab serves an example app, then replaces its build with a new deployment while the tab stays open. The examples load the adapters from the built `dist/` and load `crispen` and `crispen/react` from `src/`.

1. Build the package and the Vite example, start the server on port 4173, and open the browser:

   ```sh
   bun run lab
   ```

2. In a second terminal, build and activate a new deployment:

   ```sh
   bun scripts/simulate-deploy.ts vite-react
   ```

   The script prints `Activated vite-react deployment <id>.` The open tab shows the update notice after its next check. To check now, switch to another tab and back.

To use the Next.js example, activate a deployment and start its server on port 4174:

```sh
bun scripts/simulate-deploy.ts nextjs
bun scripts/static-server.ts --root examples/nextjs/serve --port 4174
```

Run `bun scripts/simulate-deploy.ts nextjs` again in another terminal to simulate the next deployment.

The examples read two query parameters. `?interval=10000` sets the check interval in milliseconds. `?seam=1` exposes the monitor as `globalThis.__crispenLab`. Only the examples read these parameters. The package does not.

## Add a changeset

Add a changeset when your change affects package users. See [`docs/agents/changesets.md`](docs/agents/changesets.md) for the rules.
