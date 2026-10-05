# Issue tracker

Issues, PRDs, and implementation plans live in GitHub Issues at `adelrodriguez/crispen`. Use the `gh` CLI.

## Plans

Write a plan in the body of the issue that it serves. Put the decisions, the steps, and a task list there. When the plan changes, edit the body with `gh issue edit <number> --body-file <file>`, and add a comment that says why it changed. If the work has no issue, create one first.

Split large work into sub-issues of one tracking issue. Use GitHub's native issue dependencies for order.

## Skill operations

- "Publish to the issue tracker" means create a GitHub issue.
- "Fetch a ticket" means read the issue with `gh issue view <number> --comments`.
- Requests for work arrive as issues. A pull request is never a request for triage.
