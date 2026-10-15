# Visual workflows

Organization-scoped automation graphs with typed data bindings, immutable published versions, mock draft tests, and durable action recovery. The `workspace-visual-workflows` flag remains off by default.

User guide: [`docs/platform/visual-workflows.mdx`](../../../../../docs/platform/visual-workflows.mdx).

## Definition and publishing

Schema v2 stores stable node IDs, execution edges, typed `inputs`, optional declared `outputFields`, and editor positions. A binding is a literal, reference (`nodeId` plus string/number path segments), text template, or organization credential reference. Direct references preserve JSON types. Missing required values fail before execution; optional references can specify a fallback. HTTP JSON is unknown until a schema is declared. Samples do not guarantee fields.

`catalog/node-contracts.ts` supplies node input/output contracts and mock samples. `validation/compile-workflow.ts` validates handles, references, types, branch availability, cycles, and loop scopes. Loops have explicit `each` and `done` handles, `bodyNodeIds`, and collected bindings. Nested loops are rejected.

Saving changes a draft and increments its revision. Save and publish API requests require `expectedRevision`; stale writes return 409. Publishing validates and atomically selects an immutable version. Automatic and ordinary manual runs use that version. Draft tests carry their own snapshot and never save or publish. Legacy records remain in the database but are not executable through the v2 editor; recreate them or explicitly convert them before use.

## Adding a node

How a step's settings panel and its test data are meant to work: [docs/adr/2026-10-15-visual-workflow-step-settings-and-test-data-design.md](../../../../../docs/adr/2026-10-15-visual-workflow-step-settings-and-test-data-design.md).

Editor files are in `src/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/visual-workflow-editor/`. Other paths are relative to this folder.

Every node:

- **Type and config:** `schema/types.ts`, `schema/definition-schema.ts`, `schema/serializers.ts`.
- **Catalog:** the entry, default config, card size, and subtitle in `catalog/node-catalog.ts`.
- **Data contract:** inputs, outputs, and a mock sample in `catalog/node-contracts.ts`. The card's data ports and the port marks on the settings form are drawn from this: a setting whose name is an input in the contract shows its port, the fields of earlier steps and, when wired, its source.
- **Runtime:** `runtime/execute-node.ts` for an action; `runtime/execute-logic-node.ts` and `runtime/interpreter.ts` for control flow. An action with outside effects also belongs in `validation/retry-idempotency.ts`.
- **Editor:** `titleFor` and `hintFor` in `visual-workflow-node-picker.tsx`, `titleMessage` in `nodes/visual-workflow-compact-node.tsx`, and the settings form in `visual-workflow-config-panel.tsx`, which is the panel's Configuration tab.

A node with one execution output needs nothing else on the card. A node with several:

- **List its outputs** in `getAllowedExecutionSourceHandles` and its main one in `getPrimaryExecutionSourceHandle` (`validation/execution-handles.ts`). Validation rejects a connection from an unlisted handle. The card does not read this list, so keep the two in step by hand.
- **Describe each output** in the `outputs` list of `VisualWorkflowCompactNode`: its handle id, the label drawn inside the card beside the handle, its row (`executionTop(fraction)` or `spreadTop(index, count)`) and a text color such as `text-destructive` for its tone. The card draws the handle, its label and its "+" button from this.
- **Count a variable number of outputs** in `spreadExecutionHandleCount`, so the top of the card grows to fit them.

`executionTop` fractions are of the card's top part, which stays above the data ports; the rows start below the marks in the card's corners. Execution handles and data ports must not share a spot on the card's edge. A handle's glyph is hollow until a wire is attached (`isExecutionHandleConnected` in `editor/visual-workflow-execution-ports.ts` for execution handles, `connectionCount` for data ports).

On the card:

- Do not transition `transform`, `scale`, `opacity`, or `filter`. In Chromium the rest of the canvas jumps for a frame. Animate `width` and `height` instead.
- A class on a React Flow handle needs `!` wherever React Flow's stylesheet sets the same property.
- The card marks a selected step, a step with an issue and a step that changed unseen with a band along its edge (`STEP_BAND_TONE_CLASS`). Do not give a node its own ring, border or shadow for a state.
- Under the pointer, change a color, never a size.
- Keep an output's label short. It is drawn inside the card, and the title and subtitle give up their width to it.

Undo and marks on the canvas:

- The editor keeps the name, nodes, and edges on one undo stack (`editor/visual-workflow-undo.ts`). A new node gets undo and its tooltip wording without extra code.
- Change the graph through `commit` (records a step) or `place` (no step) in `visual-workflow-editor.tsx`. State kept beside the graph is not undone.
- Keep what a person sets on a step in `config`, `inputs`, `outputFields`, or `collect`. `visualWorkflowStepSettings` reads those four to mark a step that changed while it was not selected.
- A value that a test run writes to a node's data must be left out in `nodeSettings`, as `runStatus` and `lastOutput` are. Otherwise a test run records undo steps.
- A mark on a step reaches the card through the canvas actions context (`issueNodeIds`, `freshNodeIds`), not through the node's data, because undo compares that data.

Validation issues:

- A setting that fails the config schema is reported once per step and setting, with `field` and `reason`. A new node gets this without extra code.
- A custom check in `validation/compile-workflow.ts` passes `{ field, reason }` as the fourth argument to `add`.
- A settings control shows the invalid state when it uses `connectedInputProps(portId)` or passes `invalid`.
- Wording for a new issue code goes in `issueMessage` in `visual-workflow-issue-list.tsx`. A code without wording shows the general step-configuration message.

Settings and test data:

- Draw a setting that is an input in the contract with `WorkflowBoundField` and `connectedInputProps(name)`. That gives it its port mark, the Insert menu, pills for the fields it reads and, when wired, its source with Disconnect. A plain input gets none of these.
- Name an input that only a wire can feed `value.<name>` in the contract. The form lists it as a row that asks for a wire, so it needs no form field.
- A node with nothing to set up goes in the empty-settings check of the Configuration tab in `visual-workflow-config-panel.tsx`, beside `trigger.manual` and `logic.try_catch`.
- Mark the node in `MOCKABLE` in `editor/visual-workflow-test-data.ts`, which is typed over every step type, so a new type does not compile until it is there. `true` is for a step whose result comes from outside the run: a trigger, or a step that calls out. It gets a Test tab with a box per declared output, and Fill with examples starts from its contract `mock`. `false` is for a step the run works out from its inputs, in a test as in a live run; it has no test data. A step marked `false` must be handled by `runtime/execute-logic-node.ts` or settled by the run engine, as Wait and Merge are. A test checks this, because otherwise a test run would make its result up.
- In a test run, each mockable step other than a trigger uses its test data, runs for real, or fails with an error the Test tab sets. The failure goes through the step's On error setting. A step runs for real only when it is listed in the run's `realNodeIds`: `runtime/durable-slice.ts` then fetches its credentials and calls the real executor. Every other step goes to `runtime/mock-executor.ts`. When every mockable step runs for real, the test is sent as a live run.
- The test data and these choices are saved with the draft, encrypted, in `visual_workflows.encrypted_test_setup`, by the draft's own update in `updateVisualWorkflow`, so both share its revision check. They are never published. A run records the steps it ran for real in `visual_workflow_runs.real_node_ids`.
- The editor's local test run (`preview/playground-run.ts`, used by Storybook) runs as a mock run, so a Wait finishes at once. It cannot run a step for real.
- A new step's id is its type after the dot (`notify_slack`, then `notify_slack_2`; `editor/visual-workflow-node-id.ts`), and references to it read `{{ nodes.notify_slack.sent }}`. Pick a type name that reads well there. A deleted step's id stays reserved (`reservedVisualWorkflowNodeIds`), since test setup and references are keyed by id.

## Execution and recovery

A run and dispatch outbox row are inserted transactionally. The scheduler reconciles undispatched and abandoned work. Expiring run claims use a token to fence stale workers. Each durable step reconstructs execution from encrypted completed results and executes at most one new external action. Node history is keyed by run, node, iteration, and attempt. Loop items run sequentially in isolated contexts.

Connections settle selected or skipped. Joins wait for every incoming connection and execute when at least one is selected. Handled failures remain visible. Unexecuted nodes are marked skipped, blocked, or cancelled.

HTTP GET and explicitly configured provider idempotency headers permit up to three attempts with exponential backoff. Other external operations are not blindly retried after an uncertain outcome. `needs_attention` requires provider inspection and an explicit retry acknowledging duplication. A manual retry retains completed action results and old attempts, resets the deadline, and queues recovery. Cancellation is cooperative and aborts supported in-flight requests; it cannot undo an external effect already accepted by a provider. Pausing prevents new automatic runs.

Limits are centralized in `runtime/limits.ts`: 200 nodes, 400 edges, 100 loop items, 1,000 steps, 30-second HTTP timeout, 10-minute AI timeout, and 2-hour run deadline. A durable slice runs at most one external action, so an AI node gets a whole workflow step; the execution lease (3 minutes) is renewed every minute while a slice runs and only lapses when its worker dies. HTTP responses are parsed completely within the shared public-fetch size limit before producing a truncated display preview.

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
