# Changesets

Changesets writes the version and the changelog.

Add a changeset when package consumers see the change: the public API, runtime behavior, a bug fix, or a runtime dependency. Changes to tests, CI, docs, the examples, and release tooling need no changeset, because the package ships only `dist/`.

Create one with `bunx changeset`, and commit the `.changeset/*.md` file it writes. Write the summary for package consumers: what they can now do, or what changed for them.

Choose `patch` or `minor`. Use `major` only when the user asks for it. Before 1.0.0, release a breaking change as `minor`, and tell the user that it breaks.
