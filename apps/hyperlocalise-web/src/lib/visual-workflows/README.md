# Visual workflows

Organization-scoped automation graphs with typed data bindings, immutable published versions, mock draft tests, and durable action recovery. The `workspace-visual-workflows` flag remains off by default.

User guide: [`docs/platform/visual-workflows.mdx`](../../../../../docs/platform/visual-workflows.mdx).

## Definition and publishing

Schema v2 stores stable node IDs, execution edges, typed `inputs`, optional declared `outputFields`, and editor positions. A binding is a literal, reference (`nodeId` plus string/number path segments), text template, or organization credential reference. Direct references preserve JSON types. Missing required values fail before execution; optional references can specify a fallback. HTTP JSON is unknown until a schema is declared. Samples do not guarantee fields.

`catalog/node-contracts.ts` supplies node input/output contracts and mock samples. `validation/compile-workflow.ts` validates handles, references, types, branch availability, cycles, and loop scopes. Loops have explicit `each` and `done` handles, `bodyNodeIds`, and collected bindings. Nested loops are rejected.

Saving changes a draft and increments its revision. Save and publish API requests require `expectedRevision`; stale writes return 409. Publishing validates and atomically selects an immutable version. Automatic and ordinary manual runs use that version. Draft tests carry their own snapshot and never save or publish. Legacy records remain in the database but are not executable through the v2 editor; recreate them or explicitly convert them before use.

## Execution and recovery

A run and dispatch outbox row are inserted transactionally. The scheduler reconciles undispatched and abandoned work. Expiring run claims use a token to fence stale workers. Each durable step reconstructs execution from encrypted completed results and executes at most one new external action. Node history is keyed by run, node, iteration, and attempt. Loop items run sequentially in isolated contexts.

Connections settle selected or skipped. Joins wait for every incoming connection and execute when at least one is selected. Handled failures remain visible. Unexecuted nodes are marked skipped, blocked, or cancelled.

HTTP GET and explicitly configured provider idempotency headers permit up to three attempts with exponential backoff. Other external operations are not blindly retried after an uncertain outcome. `needs_attention` requires provider inspection and an explicit retry acknowledging duplication. A manual retry retains completed action results and old attempts, resets the deadline, and queues recovery. Cancellation is cooperative and aborts supported in-flight requests; it cannot undo an external effect already accepted by a provider. Pausing prevents new automatic runs.

Limits are centralized in `runtime/limits.ts`: 200 nodes, 400 edges, 100 loop items, 1,000 steps, 30-second HTTP timeout, 120-second AI timeout, and 15-minute run deadline. HTTP responses are parsed completely within the shared public-fetch size limit before producing a truncated display preview.

## Credentials and inspection

Credential APIs return metadata only. HTTP credentials and recovery payloads use the existing credential encryption master key. Definitions carry IDs, never resolved values. Inspection snapshots redact sensitive keys and known secret values, including downstream echoes. Preserve the encryption key across worker restarts and deployments.

Run inspection uses the executed snapshot independently of the current draft. It exposes mode, version, node states, redacted inputs/outputs, errors, iteration, and attempt history. Structured logs carry run/node/iteration/attempt/outcome; reconciliation logs queue age and stalled-work recovery. Persisted timestamps and statuses support duration, failure, retry, and unresolved-write monitoring.

## Operator recovery

1. Inspect the selected run and provider delivery records before retrying `needs_attention`.
2. Use the run's retry action with explicit duplication acknowledgement. Never manually reset successful node records.
3. For queued or abandoned running work, verify the scheduler and durable worker are available. Reconciliation re-enqueues expired claims; duplicate delivery is fenced by the run claim.
4. For credential failures, verify organization ownership and the encryption key. Do not paste decrypted credentials into logs or run inputs.
5. Cancel a selected run to stop further steps; pause the workflow to prevent future automatic runs.

## Rollout and validation

Apply generated Drizzle migrations 0116 and 0117 using `vp run db:migrate` before enabling the feature. No deployment or migration application is performed by this change. Keep the flag off, enable an internal organization first, and only expand after the acceptance suite is executed successfully.

Regression coverage lives in `runtime/production-contracts.test.ts`, existing runtime tests, database service tests, and API route tests. For this implementation pass, execution tests, database migration validation, browser acceptance, and production build validation were explicitly deferred by the user; only `vp check --fix` was requested. Static checks do not establish rollout readiness.
