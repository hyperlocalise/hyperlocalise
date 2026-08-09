# Disable forced automation memory tools

## Problem

Workspace automation plans currently include `recall_memory` whenever organization memory is
enabled and `save_memory` whenever updates are allowed. The orchestrator forces every planned
tool call, so both memory operations run on every eligible automation. A nullable save entry
avoids mandatory writes, but it does not make the tool call optional.

This behavior adds model work and can inject unrelated fallback guidance or append low-quality
content. Making either step use automatic tool choice is unsafe in the current loop because a
skipped tool can end the run before required workflow or notification tools execute.

## Decision

Do not add `recall_memory` or `save_memory` to generated workspace automation plans.

- Keep workflow and notification planning unchanged.
- Keep organization memory storage, the Knowledge editor, and chat memory tools unchanged.
- Preserve the automation memory configuration fields for compatibility with saved automation
  records and the planned retrieval redesign.
- Keep the memory tool implementations temporarily, but make them unreachable from generated
  automation plans.

This is an immediate safety change, not the final retrieval architecture. Optional automation
memory access requires an orchestrator design where skipping an optional call cannot terminate
required execution.

## Verification

- Planning tests must prove that enabling memory or memory updates does not add memory tools.
- Plans containing workflow and notification tools must otherwise remain unchanged.
- Memory-only automation configuration must still produce no actionable plan.
- Run the web test and check suites before finalizing.
