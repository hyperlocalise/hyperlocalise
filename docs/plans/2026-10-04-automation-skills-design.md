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
- A skill lists a trigger only when its tools can do something useful there. Research, Crowdin
  and issue skills, and Slack and email delivery, work on every trigger except web chat, which
  runs a different agent. Uploaded-file translation needs the source-upload trigger, the pull
  request comment needs a GitHub event, and Contentful translation needs an entry.
- A skill may declare a `risk`: a plain statement of what it does that cannot be undone. The
  editor shows it and asks for confirmation before attaching the skill, from the menu or from a
  suggestion. Only "Email results" declares one.
- A skill cannot be added while an integration its tools need is known to be disconnected. It is
  greyed out in the menu and in suggestions, with a line naming what to connect. A status that
  is still loading does not grey anything out, and the server still validates connections on
  save.

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
- The editor shows Triggers, Agent Instructions, Skills, then Tools. A tool row that attached
  skills need carries a "Required for skill" badge in place of its remove button; hovering it
  names the skills.

### Persistence

- `workspace_automations.skill_ids` (jsonb string array, default empty) stores the attached
  skills. Changing it bumps `configVersion`.
- The server rejects unknown skill ids, a skill whose trigger does not match, and a skill whose
  tools are not enabled in `toolConfig`.
- Instructions become optional when at least one skill is attached. An update that would leave an
  automation with neither is rejected.

### Run time

- The dispatcher copies `skillIds` into the run's input snapshot as a record of what was attached
  when the run was queued. The run itself reads the automation's skills when it starts, as it does
  the instructions and tools, so it never mixes two saved configurations.
- The orchestrator prompt includes every attached skill's procedure and shared skills.
- Tools that run their own agent (GitHub, GitLab, Crowdin, web search) receive the procedures of
  the skills that declare that tool, with the shared procedures those skills name, followed by the
  customer's instructions.
- `templateSkillId` in a run snapshot is still honoured for shared skills.

### Templates

Templates whose work is covered by skills attach those skills and leave instructions empty.
Other templates are unchanged.

### Suggestions

The editor suggests skills and tools from what the user types in the automation's name and
instructions. Suggestions appear as chips beside the "Agent Instructions" title, above the box,
once typing pauses, and a chip is highlighted briefly when it first appears. A chip only suggests:
nothing is added until it is clicked, and a chip can be dismissed.

- Matching is by keyword, in the browser, with no library and no model call. Each skill carries
  its terms in the catalogue; tools that no skill covers (GitHub sync, GitLab, Semrush, Ahrefs,
  Zernio) carry theirs in `workspace-automation-suggestions.ts`.
- A strong term, such as "Slack" or "Crowdin", suggests its item on its own. Weak terms, such as
  "review" or "translate", suggest an item only when two different ones match. Alternatives for
  one idea count once, so naming a repository alone suggests nothing.
- Terms match whole words in any case, with a plain plural. An email address and a `#channel`
  name are strong signals.
- Negation is not detected. Instructions tell the agent what to do, so a strong term is taken to
  mean the user wants that item.
- Attached skills, tools already on, and tools that conflict with the repository in use are not
  suggested. A skill that does not fit the trigger, or a tool whose integration is not connected,
  is shown disabled with the reason.
- MCP server, Memories and Knowledge files are never suggested.

### Tools left without a skill

- Semrush and Ahrefs: every call spends paid API units from the customer's own subscription.
- Zernio: creates paid ads.
- GitHub sync and GitLab: not decided.

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
- Suggestion tests: strong and weak matching, whole-word matching, ordering, filtering of items
  already added, and the editor story for adding and dismissing a chip.
