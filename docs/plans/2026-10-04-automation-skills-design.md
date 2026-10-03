# Automation skills

## Problem

A workspace automation is built by writing instructions and adding tools one at a time from the
"Add tool" menu. The user has to know which tool does what, which tools depend on each other, and
has to write the procedure as free text. Templates pre-select tools, but only at creation: the
link to the template is not saved, so nothing can be added later and the template's procedure
never reaches a run except as text pasted into the instructions box.

## Decision

Add skills to agent automations. A skill is one capability named by its outcome. It carries a
procedure, the tools it needs, and the triggers it works with. The user picks skills; the tools
follow.

### Catalogue

- The catalogue is a typed list in `src/lib/agents/workspace-automation-skills.ts`: id, name,
  description, a plain statement of what the skill can touch, tools, compatible triggers, and
  shared skills. It is plain TypeScript so the editor, the server and the runner read the same
  list, and tool names are type-checked.
- Each skill's procedure is a markdown file with the same id under
  `src/agents/automations/workspace/agent/skills/`. A test keeps the two in step.
- Skills ship with the app. Customer-authored skills are out of scope.

### Expand at save

Picking a skill in the editor switches on that skill's tools in the existing `toolConfig`. The
stored `toolConfig` stays the only record of what an automation may do, so the planner, the forced
tool loop and tool validation do not change, and a later change to a skill's tool list cannot give
a saved automation new tools.

- Removing a skill switches off the tools it declared, unless another attached skill declares
  them. A tool added by hand and also declared by a removed skill is switched off too.
- Settings a skill cannot know (repository, Slack channel, Crowdin project, recipients) stay in
  the tool rows. They are prefilled when the workspace has one obvious choice.
- "Add tool" stays for tools no skill covers.

### Persistence

- `workspace_automations.skill_ids` (jsonb string array, default empty) stores the attached
  skills. Changing it bumps `configVersion`.
- The server rejects unknown skill ids, a skill whose trigger does not match, and a skill whose
  tools are not enabled in `toolConfig`.
- Instructions become optional when at least one skill is attached.

### Run time

- The dispatcher copies `skillIds` into the run's input snapshot, so a run records the skills it
  ran with.
- The orchestrator prompt includes every attached skill's procedure and shared skills.
- Tools that run their own agent (GitHub, GitLab, Crowdin, web search) receive the procedures of
  the skills that declare that tool, followed by the customer's instructions.
- `templateSkillId` in a run snapshot is still honoured for shared skills.

### Templates

Templates whose work is covered by skills attach those skills and leave instructions empty.
Other templates are unchanged.

## Out of scope

- Letting the model decide per run whether to call a skill's tool. Every planned tool is still
  forced once, in order.
- Web chat and content-sync automations.
- MCP server and knowledge-file tools, which have no scheduled-run wiring.
- Existing automations: they have no skills and keep working as they are.

## Verification

- Catalogue test: every skill has a procedure file, known tools and at least one trigger.
- View-model tests: adding a skill enables its tools; removing it disables only tools no other
  skill needs; the payload carries `skillIds`; instructions are optional with a skill.
- Server tests: unknown skill, trigger mismatch and missing tool are rejected; `skillIds` round
  trips and bumps `configVersion`.
- Run-time tests: composed instructions include skill procedures and shared skills; the
  dispatcher snapshots `skillIds`.
- Editor stories for adding and removing a skill.
