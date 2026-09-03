# Visual workflows

Deterministic automation graphs stored in Postgres and executed by a small in-process interpreter. Phase 1 covers manual triggers, HTTP actions, if/else branching, and single-shot AI prompts.

User-facing docs: [`docs/platform/visual-workflows.mdx`](../../../../docs/platform/visual-workflows.mdx).

## Layout

| Path | Role |
| --- | --- |
| `catalog/node-catalog.ts` | Node types exposed in the editor picker and default configs |
| `schema/` | Canonical definition types, Zod schema, React Flow serializers |
| `validation/validate-workflow.ts` | Graph invariants (single trigger, reachability, valid edges) |
| `visual-workflows.ts` | CRUD for `visual_workflows` rows |
| `visual-workflow-runs.ts` | Run lifecycle, idempotency, node run persistence |
| `runtime/` | Interpreter, per-node executors, template expressions |
| `preview/fake-run.ts` | Client-side fake execution for editor preview |

API routes live in [`src/api/routes/visual-workflow/`](../../api/routes/visual-workflow/) and mount at `/api/orgs/:organizationSlug/visual-workflows`.

## Feature flag

`workspaceVisualWorkflowsFlag` (`workspace-visual-workflows`) gates UI routes and API handlers. Default is off.

## Definition schema

Definitions are versioned JSON (`schemaVersion: 1`) with:

- `nodes[]` — `{ id, type, config }` where `type` is a `VisualCatalogType`
- `edges[]` — `{ id, source, target, sourceHandle, targetHandle }`
- `editor.positions` — canvas layout metadata

If nodes use `logic.if`, outgoing edges must use `sourceHandle` `"true"` or `"false"`.

## Execution pipeline

```text
POST .../visual-workflows/:id/runs
        |
        v
createVisualWorkflowRun (stores definition snapshot in inputSnapshot)
        |
        v
enqueueVisualWorkflowRunOnce -> createVisualWorkflowExecutionQueue
        |
        v
visualWorkflowExecutionWorkflow (Vercel Workflow)
        |
        v
executeVisualWorkflowStep
        |
        v
runVisualWorkflowInterpreter
        |
        +-- trigger.manual
        +-- action.http   (withPublicHttpFetch, bounded body)
        +-- logic.if      (selectNextEdges by branchResult)
        +-- ai.agent      (generateText via organization AI Engine)
        `-- logic.for_each (unsupported in Phase 1)
```

The interpreter performs a topological walk with a queue. Nodes with multiple incoming edges wait until all predecessors complete. Skipped if/else branches propagate skips to downstream nodes on the untaken path.

Local dev can execute inline when `shouldRunWorkflowInlineLocally()` is true (see [`src/workflows/adapters.ts`](../../workflows/adapters.ts)).

## Template expressions

`runtime/expressions.ts` resolves `{{ trigger.* }}` and `{{ nodes.<id>.* }}` in URLs, conditions, and prompts. Conditions support numeric and string comparisons after resolution.

## Persistence

- `visual_workflows` — draft/active/paused/archived workflows with monotonic `definitionVersion`
- `visual_workflow_runs` — queued/running/terminal runs, optional idempotency key per workflow
- `visual_workflow_node_runs` — per-node input/output snapshots and errors

Runs capture the definition at enqueue time under `inputSnapshot.definitionSnapshot` so replay/debug stays stable across edits.

## Testing

- Unit tests: `visual-workflow.test.ts`, `runtime/runtime.test.ts`
- Route tests: `visual-workflow.route.test.ts` (uses real Hono app + WorkOS test auth)

Run from `apps/hyperlocalise-web`:

```bash
vp test src/lib/visual-workflows
vp test src/api/routes/visual-workflow
```

## Phase boundaries

Implemented:

- Manual trigger only (`triggerSource: "manual"`)
- HTTP GET/POST/PUT/PATCH/DELETE
- If/else with true/false handles
- AI agent single-turn `generateText`

Not implemented yet:

- Scheduled or webhook triggers
- `logic.for_each` loops
- Additional action nodes (Slack, translation, etc.)
- Public `/v1` API exposure
