# Draft PR CI gating

## Context

Draft PRs get many small pushes while iterating. Running full CI on every push
burns Blacksmith minutes on Postgres, Bazel, tests, and Next builds before the
PR is ready for review. Feature-branch PRs already gate merges, so re-running
the same jobs on `main` pushes duplicates work.

## Design

Run `web.yml` and `ci.yml` only on `pull_request` events (no `push` to
`main`). On draft PRs, run only cheap checks for fast feedback. Skip expensive
jobs until the PR is non-draft.

Trigger `pull_request` with `opened`, `synchronize`, `reopened`, and
`ready_for_review` so converting a draft to ready re-runs the full suite.
Gate expensive jobs with:

```yaml
if: github.event.pull_request.draft == false
```

Cheap jobs have no draft gate and always run when the workflow triggers.

| Workflow | Cheap (draft + non-draft PR) | Expensive (non-draft PR only) |
|---|---|---|
| `web.yml` | install, migration checks, `vp check` | Postgres, migrate, `vp test`, `vp run build` |
| `ci.yml` | `make fmt`, `make lint` | Bazel, workspace tests, check-build, action self-test, sync smoke |

Keep existing path filters and concurrency groups. Do not require a `run-ci`
label; that remains an optional escape hatch later if drafts need forced
expensive runs.

## Verification

- Push to a draft PR: cheap jobs run; expensive jobs skip.
- Mark the PR ready for review: cheap and expensive jobs run.
- Further non-draft pushes: both job groups run again.
- Push to `main`: neither workflow runs (subject to path filters).
