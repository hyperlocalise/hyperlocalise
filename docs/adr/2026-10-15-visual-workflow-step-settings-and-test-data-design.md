# Visual workflow step settings and test data

**Status:** Accepted

## Context

A step in the visual workflow editor had two places for the same values. The settings form held the step's own fields, such as a Slack channel and message. A separate Inputs section listed one row per bindable input with a mode: `configuration` (use the form), `reference` (read another step's output by path), `literal` (a typed JSON value) or `template` (text with `{{ }}` references). Each input is a form field of the same name, and at run time a stored binding simply overwrites the field. So the Inputs section showed every bindable field a second time, with four raw mode words, and a stored binding left the form's box editable but ignored. Unbound text fields already accepted `{{ nodes.<id>.<path> }}` templates, so two of the four modes duplicated the form. A reference set in the panel never showed on the canvas, which cut across the schema v3 rule of one source of truth between canvas wires and stored bindings.

Test data had the same shape of problem. The editor held one JSON box for the trigger payload and one map of mock outputs keyed by internal step id. A mock run made up values for every step that had no entry, so a test could succeed on data nobody had seen. Steps gave no way to see what a run had produced or to reuse it.

Comparable tools keep one field list and bind a field in place: a per-field toggle (n8n, Dify), a type selector (Node-RED, Windmill), inline pills (Zapier, Power Automate, Make), or a socket with an inline default that a wire disables (ComfyUI, Langflow, Blender, Unreal). None keeps a second list of the same fields. For testing, n8n pins a node's output, Windmill mocks or pins a step, Power Automate has a per-action Testing tab with a static result, and Workato's test cases hold a trigger mock and step mocks. Nobody uses visual workflows yet, so stored bindings only exist in fixtures and development data.

## Decision

### One list of fields

A step's settings are one list on a Configuration tab. Each setting an earlier step can feed, which is each input in the step's contract, shows a port mark beside its name in the card's port colour for its type, hollow until something feeds it.

- **Typed.** The box holds the value. A text setting has an Insert button that opens a searchable menu of the fields of every step before this one, grouped by step, with type and a sample. The step's declared fields are listed, then fields seen in its last run output or, before a run, in its test data. Picking one writes `{{ nodes.<id>.<path> }}`, or `{{ trigger.<path> }}` for the trigger, at the caret. Number and boolean settings have no Insert button; they are typed or wired.
- **Pills.** A text setting that reads fields shows them as pills, named by the field with the full source in a tooltip, until it is clicked; then it is the plain text. The pill is a display form of the existing `{{ }}` text, so the run code is unchanged. A pill, a source chip or a menu row under the pointer marks its source step on the canvas with a grey band.
- **Wired.** A data wire into the port replaces the box with a chip naming the feeding step and path, with Disconnect. A binding stored by the old Inputs section shows the same way: a reference as its step and path with Remove, a fixed value or template with Edit as text, which writes the value into the box and removes the binding.
- **Wire-only inputs.** A Call workflow's and a Return's `value.<id>` inputs show as rows that read "Connect this on the canvas" until wired.
- **Run behaviour.** On error, and for HTTP the fail-on-error switch, sit under a collapsed "If this step fails" section that shows the current choice.
- **Tabs.** Configuration, Outputs and, where it applies, Test, in the panel's header row between the Back and Delete icon buttons. The tab stays while another step is selected and starts over when the panel is reopened. An issue picked from the issue list opens Configuration, where its setting is marked. A step with nothing to set up says so and where its outputs are.

The HTTP step's saved-credential field and the loop and retry body settings stay on Configuration. Collected outputs and declared output fields are on Outputs. The Inputs section, its four modes and the source-field search are gone.

### Test data on each step

Every trigger, and every step that calls out (HTTP, Content sync, Slack, email, AI Agent, Call workflow), has a Test tab with one box per output pin. A trigger's values are its sample event; a step's values are what it returns in a mock test run.

- **Nothing is invented.** A mock run uses each step's test data as its output and never makes values up. Before a run starts, the editor finds every value the run would read, through a wire, a binding or a template, that is not set, refuses the run, names the first missing value and opens its Test tab from the notice. A live test checks only the trigger.
- **Filling the tab.** "Fill with examples" writes the built-in samples into the boxes where they are seen. "Use last run" copies the step's output from the last run. "Use as test data" on a past run in the run history copies that run's outputs into every step. The same values feed the Insert menu and the wired-field picker, so a field's type and sample are known before a run.
- **Mode.** A button beside Test workflow opens the test settings: the live test switch and a note that values are set on each step's Test tab.
- **Storage.** Test data lives in editor state beside the steps, not in their data, so editing it records no undo step. The editor builds the same request the run engine always took, a trigger input and a map of mock outputs keyed by step id, so the server is unchanged. Computed steps such as If, Switch, Set fields and loops run their real logic; Wait and Merge are settled by the engine.

## Consequences

- A value appears once, and its source is visible: in the box, as pills, or as a wire or chip.
- Users never see the four binding modes or step ids while using the Insert menu; they do see `{{ nodes.<id>.<path> }}` while editing a setting's text.
- Lists and objects inserted into text come out as JSON, as before.
- A mock run cannot fail a step or choose an exit, so error branches, Try / Catch and Retry need a live run to be tried.
- Test data is lost on reload, and a mock run's request shape is unchanged, so nothing on the server or in saved workflows moves.
- Stored bindings in fixtures keep working through the chips; no conversion is needed, since no user workflows exist.

## Alternatives considered

- **Keep the Inputs section and only reorder or tab it.** Tried first as tabs. It does not remove the duplication or explain the modes.
- **A per-field mode toggle, as in n8n.** Rejected: our wires already carry a reference, so a mode is a second way to do one thing.
- **A wire that carries a path inside an output and a fallback,** replacing the reference binding's remaining extras. Mocked up, not built; it changes the edge model.
- **A token editor where each field is one object in the text.** Evaluated: the right long-term answer, about a week with an editor library such as Lexical, and its own undo to reconcile. Deferred; readable step ids would be a cheaper improvement first.
- **Keep the single mock map and add a UI over it.** Rejected: ids are internal, and invented values would remain.
- **A failure outcome per step mock, as in Workato.** Deferred to a server-side stage, with saving test data alongside the draft.

## Out of scope

- Saving test data with the workflow, and failure or exit outcomes for a mocked step.
- Clickable pills that open their source, pills that respond to keyboard focus, and turning a lone pill into a wire.
- Declaring an output's shape from an example, and type checks on wires from test data.
- A more compact panel.

## Validation

Unit tests cover the field helpers, the panel's tabs and fields, the test data rules and the refused run. Storybook stories cover the tabs and the panel states. The form, the Insert menu, a pill and the pointed source step were checked in the running app.
