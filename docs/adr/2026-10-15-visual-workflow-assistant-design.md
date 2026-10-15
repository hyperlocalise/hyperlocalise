# Automation assistant in the visual workflow editor

**Status:** Accepted

## Context

The automation assistant has its own agent, sessions and panel on the automation form ([design](2026-10-09-automation-assistant-separation-design.md)). That design expected it to build and edit visual workflows as well. The visual editor now has an undo stack for every change (#2852), a mark for steps that appear without being selected (#2857), and settings shown as one list of fields with test data on each step ([design](2026-10-15-visual-workflow-step-settings-and-test-data-design.md)). That last change removed the binding modes, named new steps by their kind, and made a mock test refuse to run while a value it needs is empty.

## Decision

### One assistant, two editors

`src/lib/agents/automation-assistant-editor.ts` names what the assistant needs of an editor: its tool, how the page is described to the model, the person's own edits between turns, how a past call is shown to the model, and the pure functions the page applies a call's changes with. The form's functions are grouped as `automationSetupEditor`, and the canvas is `visualWorkflowEditor` in `visual-workflow-assistant.ts`. `automation-assistant-editors.ts` picks one by the page context's `kind`. The provider, panel, turn runner, history loader, routes and agent factory are shared. The instructions are a short preamble plus one skill per editor (`skills/automation-setup.md`, `skills/visual-workflow.md`) and that editor's catalogue.

### The tool

`edit_visual_workflow` takes an ordered list of operations:

- `add_node`, with `after` to place and connect it as the canvas' "+" button does, and settings merged into the type's defaults
- `remove_node`, `connect`, `disconnect`
- `configure_node`, with settings only
- `rename_workflow`

Each operation is applied or refused on its own, with the reason the canvas' own validator gives, and the rest go on. The tool returns the operations it applied, with positions filled in. The page applies those with the same functions, rather than taking a whole definition from the server, which would overwrite what the person changed while the turn ran. The result also lists what stops the workflow from being activated, and every field reference in a step's settings that the run could not read.

### Values, ids and references

- **No binding modes.** The tool sets values as the panel does. A typed value goes in the setting. A field of an earlier step is written into a text setting as `{{ nodes.<id>.<path> }}`, or `{{ trigger.<path> }}`. A whole value goes in through a data wire. Setting a value removes any binding stored for that setting, as the panel's "Edit as text" does.
- **Step ids.** The model gives each new step an id. The catalogue shows the id the editor would give it, its kind such as `notify_slack`, and the instructions ask for that id, numbered when it is taken.
- **Readable fields.** The page block lists each step's output fields with the exact text that reads them.
- **Reference check.** No validator reads templates, so a reference to a missing step, or to one that does not run earlier, only fails when the run reaches it. `visual-workflow-references.ts` finds these after each call, and the tool reports them.

### What it does not do

The assistant does not move steps, save, test, publish, pause or run. It does not pick anything the person has to choose: a Slack channel, an email's provider, sender and recipients, how an HTTP request signs in, a Content sync's project, system and resource, a repository, or the workflow a Call workflow step runs. These are one list in `visual-workflow-assistant.ts`, each setting with the reason the assistant gives the person: it names something in the workspace the model cannot see or check, or decides where a message goes. The tool refuses to set one, to empty one the person chose, and to make or take away a data connection into one, since a data input of the same name is that setting. It does not set test data. The instructions point the person to each step's Test tab when they want to try the workflow.

### Undo and the page

Each turn of the assistant is one step on the editor's undo stack, with origin `assistant`. Undoing it asks first, through the same `useAssistantUndoSteps` the form uses. The steps it adds carry the editor's "fresh" band until selected. The page passes the editor's own unsaved-change state, so the assistant's count of unsaved changes resets only when the draft matches the saved one. "Configure with assistant" sits in the editor header. The panel is a third column beside the settings panel when there are 1200 px of room, and a sheet below that. Only desktop widths are designed for.

### Sessions

`automation_assistant_sessions.visual_workflow_id` binds a session to a workflow the way `automation_id` binds one to an automation, with the same one-per-author rule. A workflow exists before its editor opens, so such a session is never unbound. Turns are billed under `mode: visual_workflow`. A reply's snapshot holds the workflow (`{ definition }`), and a message's page edits carry the editor's kind, so sessions saved before this still read. Page edits list steps added, removed and configured, connections added and removed, and renames. A step that was only moved is not reported.

## Consequences

- One assistant code path serves both editors. A third editor needs an adapter, a skill text and a catalogue.
- What the assistant writes is what the panel shows: settings, pills and wires, never a binding mode.
- A wrong reference the assistant writes is reported in the same turn. One the person types is still unchecked in the editor.
- A workflow the assistant builds still needs test data before a mock test runs.

## Alternatives considered

- **Return a whole definition from the tool.** Rejected: it would overwrite the person's edits made during the turn.
- **A per-turn undo of the assistant's changes only.** Rejected for one stack shared by every change, which the editor now has.
- **Let the assistant fill test data.** Deferred: test data lives in editor state, outside the definition and the undo stack, so it needs its own path from a tool result into the page.
- **Server-assigned step ids.** Not chosen: the model refers to new steps within one call, so it needs to know their ids when it writes the call.

## Out of scope

- Filling test data, publishing and pausing.
- Choosing the workflow a Call workflow step runs.
- Checking references the person types (a validator change of its own).
- Phone and tablet layouts.

## Validation

Unit tests cover the operations, the page block, the reference check, the session routes and a scripted canvas turn. A Storybook story under `App/Automations/Visual Workflow/Assistant` adds a step and undoes it. The assistant on the canvas is checked in the running app and against a hand-run case list before release.
