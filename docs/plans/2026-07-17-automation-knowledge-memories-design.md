# Automation knowledge memories

## Problem

Workspace automations can use GitHub, Contentful, translation, Slack, and email
tools, but they cannot opt into the organization knowledge base. Teams already
edit that guidance under **Knowledge**; automations should reuse it as a
built-in tool with manage/edit in the automation UI.

## Decision

Treat organization knowledge memory as a built-in automation tool named
**Memories**.

- Store opt-in in `toolConfig.knowledge: { enabled: boolean }`.
- Show **Memories** under a **Built-in** group in Add Tool.
- When enabled, show a Tools row with **Manage** and remove.
- **Manage** opens a sheet that reuses `KnowledgeMemoryEditor`.
- Gate adding Memories on the `workspace-knowledge` flag and
  `workspace:update` for edits (same as the Knowledge page).
- At run time, when enabled, select relevant knowledge and append it to
  composed orchestrator instructions. Do not add a forced orchestrator tool
  call; knowledge guides other planned tools.
- Memories alone does not count as an activatable workflow tool.

## Behavior

1. User adds **Memories** from Add Tool → Built-in.
2. Tools list shows Memories with **Manage** and delete.
3. **Manage** edits the shared org knowledge markdown memory.
4. On run, if `toolConfig.knowledge.enabled`, load memory, select context from
   automation name/instructions, and inject under `## Workspace knowledge`.

## Out of scope

Per-automation private memories, translation-memory (TM) tools, outbound MCP
servers, and forcing a `consult_knowledge_memory` tool step.

---

# Update 2026-08-03 — recall and save become explicit tool calls

Minh confirmed the MVP direction for how automations interact with Memory: still one memory
store (org-level `Memory.md`), still no per-automation store, but access moves from passive
prompt injection to explicit tool calls the agent decides to make.

## What changes

- **Recall becomes a tool call.** Previously, `toolConfig.knowledge.enabled` caused
  `selectKnowledgeMemoryContext` output to be silently pasted into the composed instructions
  before every run (step 4 above). That's replaced by a `recall_memory` tool
  (`tools/recall_memory.ts`) the agent calls with its own query, reusing the same
  `selectKnowledgeMemoryContext` call but driven by a model-supplied question instead of an
  automatic one. `compose-workspace-instructions.ts` adds a one-line nudge when the tool is
  available, so automations don't silently lose the always-present context they used to get.
  It runs first in the plan, before workflow tools, so recalled guidance is available before the
  decisions it's meant to inform.
- **Save is a forced tool call whose skip mechanism lives in its own input, not in the loop.**
  `save_memory.ts` appends to `Memory.md` through the same `commitKnowledgeMemoryForOrganization`
  compare-and-swap a human edit goes through — same optimistic concurrency, same 50,000-character
  cap, append-only, no human actor (`updatedByUserId: null`, provenance in the revision
  `summary`). `WorkspaceOrchestratorPlan` has only `tools`, no separate optional list: when
  `toolConfig.knowledge.allowUpdates` is on, `plan.ts` inserts `save_memory` into `plan.tools`
  itself, positioned after workflow tools and before notifications, and `agent.ts`'s `prepareStep`
  forces it via `toolChoice: { type: "tool", toolName: "save_memory" }` like every other planned
  tool. An earlier version of this gave it its own step with `toolChoice: "auto"` instead — that
  broke because the underlying `ToolLoopAgent`'s step loop only continues past a step that
  produced a tool call, so the model legitimately skipping it could end the run before a later
  forced tool (a Slack/email notification) ever ran. Forcing it doesn't mean it fabricates
  content, though: its `entry` input accepts `null` as an explicit "nothing to remember this run"
  decision, which short-circuits before touching the database — that's the mechanism that keeps
  the original "don't write invented content on every run" requirement satisfied.
- `toolConfig.knowledge.allowUpdates` now has a UI control: an "Allow memory updates" toggle in
  the Memories tool row, shown whenever Memories is enabled.

## Still out of scope

Per-automation memory, Upstash, automatic write triggers without an explicit tool call,
contradiction/dedup handling, and any approval workflow beyond the tool-permission gate itself.
