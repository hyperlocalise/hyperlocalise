# Lambda deploy job-level concurrency

## Status

Accepted.

## Context

The **Lambda Deploy** workflow (`.github/workflows/lambda-deploy.yml`) uses path filters so each merge to `main` deploys only the Go Lambdas affected by that commit.

The workflow previously used a single concurrency group at workflow scope with `cancel-in-progress: true`. When two merges landed close together, a later run could cancel an in-progress run entirely. If the later run did not match a worker’s path filter, that worker’s deploy job was skipped. The cancelled run’s deploy never finished, and the later run did not redeploy that worker.

This left production out of sync with `main` (for example glossary-interchange after a glossary change was cancelled by an unrelated memory-interchange merge).

## Decision

- Remove workflow-level concurrency from **Lambda Deploy**.
- Add job-level concurrency on each `*_deploy` job with a unique group per worker (`lambda-deploy-<worker>-${{ github.ref }}`), keeping `cancel-in-progress: true` within that worker only.
- After checkout, push-triggered deploy jobs run `ensure-deploy-main-tip` with the same path rules as that worker’s deploy filter. An older run skips only when newer commits on `main` would deploy that worker; unrelated merges that do not touch those paths do not block the deploy.

## Consequences

- Unrelated merges no longer cancel another worker’s deploy mid-flight.
- Two consecutive merges touching the same worker still supersede the older deploy for that worker only.
- Superseded push deploy jobs exit before build or AWS steps when a newer worker-relevant commit is on `main`; `workflow_dispatch` runs skip the check.
- Adding a new Lambda requires a new deploy job concurrency group; all deploy jobs use `role-session-name: github-actions-lambda-deploy` on `main`. Document the invariant in `AGENTS.md`, `docs/contributing/lambda-deploy.mdx`, and the create-sqs-lambda-worker skill.

## References

- [Lambda deployment (contributing)](../contributing/lambda-deploy.mdx)
- [Activity-log SQS and Go Lambda infrastructure](./2026-09-25-activity-log-sqs-lambda-infrastructure.md)
