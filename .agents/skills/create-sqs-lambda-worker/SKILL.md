---
name: create-sqs-lambda-worker
description: Scaffold a Go-first SQS-triggered Lambda worker in Hyperlocalise, including its message contract, shared-secret configuration, tests, build metadata, and deployment handoff.
---

# Create an SQS Lambda worker

Use this skill when adding a queue-backed Go Lambda, SQS consumer, asynchronous
worker, or a new Lambda artifact under `apps/`.

## Scope and boundaries

- Target Go with the `provided.al2023` runtime and a root-level `bootstrap`.
- Keep the handler idempotent and return partial SQS batch failures when one
  record fails.
- Do not place secret values in source, tests, Terraform, GitHub variables, or
  logs. Use the shared `internal/secretsmanager` package.
- Do not run AWS deployments or `tofu apply` from this skill.
- Use the infra-repository skill `add-sqs-lambda-worker` for AWS resources.

## Workflow

1. Inspect `AGENTS.md`, nearby Lambda packages, `Makefile`, `go.mod`, Bazel
   metadata, and existing message contracts.
2. Choose a stable worker package under `apps/<worker-name>-lambda` and a
   versioned message type. If the Lambda already exists, preserve its directory,
   artifact name, and SSM function parameter; do not rename it to fit the
   scaffold convention. Reject ambiguous ownership or an unversioned wire
   contract.
3. Scaffold a handler that:
   - accepts `events.SQSEvent`;
   - processes records independently;
   - returns `batchItemFailures` for retryable or invalid records according to
     the worker contract;
   - propagates context and bounds external calls with timeouts;
   - logs IDs, counts, phases, and durations without payload secrets.
4. Add shared-secret metadata configuration. The infrastructure supplies only:

   - `<NAME>_ARN`
   - `<NAME>_KEY`
   - `<NAME>_CACHE_TTL_SECONDS`

   Call `secretsmanager.ConfigsFromEnv("NAME", ...)`, create a
   `secretsmanager.Collection`, and map named values into a typed runtime
   config. Never mutate `os.Environ` with loaded values.

   The existing activity-log Lambda is a compatibility exception: the merged
   infrastructure wrapper still supplies `DATABASE_URL_SECRET_ARN`,
   `DATABASE_SECRET_KEY`, and `DATABASE_URL_SECRET_CACHE_TTL_SECONDS`, so that
   worker continues to use `secretsmanager.ConfigFromEnv` until infrastructure
   changes its wrapper contract.
5. Add table-driven tests for valid messages, malformed messages, partial
   failures, context cancellation, secret loading, cache behavior, and safe
   logging. Use fakes for AWS and external dependencies.
6. Add a `Makefile` target that creates `dist/<worker>/bootstrap` with
   `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, and add/update Bazel metadata.
7. Add or update deployment workflow configuration using
   `.github/actions/deploy-lambda-artifact` with the build command, binary path,
   artifact key, artifact-bucket SSM parameter, and function-name SSM parameter.
   Follow the existing `.github/workflows/lambda-deploy.yml` pattern: preserve
   the changed-path detector and deploy job, and make the smallest possible
   change—normally only the Lambda source path and the worker-specific test,
   build, binary, artifact, and function-parameter values. Do not refactor the
   workflow into a different upload/provision structure.
8. Document required non-sensitive environment metadata and the local test
   command. Do not require LocalStack for unit tests.
9. Run `make fmt`, `make lint`, and `make test` before handing off the infra
   inputs.

## Required handoff to infrastructure

Provide the infra developer with:

- worker, queue, DLQ, Lambda, and execution-role names;
- artifact key and build target;
- runtime, timeout, memory, batch, and concurrency requirements;
- private subnet/security-group requirements;
- logical secret references and customer-managed KMS key ARN, if any;
- producer role ARNs;
- extra AWS permissions required by the handler;
- alarm and log-retention requirements.

Read [references/worker-contract.md](references/worker-contract.md) for the
minimum handler and deployment shape.
