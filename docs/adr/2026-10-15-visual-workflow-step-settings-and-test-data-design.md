# Visual workflow step settings and test data

**Status:** Accepted

## Context

A step in the visual workflow editor had two places for the same values. The settings form held the step's own fields, such as a Slack channel and message. A separate Inputs section listed one row per bindable input with a mode: `configuration` (use the form), `reference` (read another step's output by path), `literal` (a typed JSON value) or `template` (text with `{{ }}` references). Each input is a form field of the same name, and at run time a stored binding simply overwrites the field. So the Inputs section showed every bindable field a second time, with four raw mode words, and a stored binding left the form's box editable but ignored. Unbound text fields already accepted `{{ nodes.<id>.<path> }}` templates, so two of the four modes duplicated the form. A reference set in the panel never showed on the canvas, which cut across the schema v3 rule of one source of truth between canvas wires and stored bindings.

Test data had the same shape of problem. The editor held one JSON box for the trigger payload and one map of mock outputs keyed by internal step id. A mock run made up values for every step that had no entry, so a test could succeed on data nobody had seen. Steps gave no way to see what a run had produced or to reuse it.

Comparable tools keep one field list and bind a field in place: a per-field toggle (n8n, Dify), a type selector (Node-RED, Windmill), inline pills (Zapier, Power Automate, Make), or a socket with an inline default that a wire disables (ComfyUI, Langflow, Blender, Unreal). None keeps a second list of the same fields. For testing, n8n pins a node's output, Windmill mocks or pins a step, Power Automate has a per-action Testing tab with a static result, and Workato's test cases hold a trigger mock and step mocks. Nobody uses visual workflows yet, so stored bindings only exist in fixtures and development data.

## Decision

### One list of fields

A step's settings are one list on a Configuration tab. Each setting an earlier step can feed, which is each input in the step's contract, shows a port mark beside its name in the card's port colour for its type, hollow until something feeds it.

- **Typed.** The box holds the value. A text setting has an Insert button that opens a searchable menu of the fields of every step before this one, grouped by step, with type and a sample. The step's declared fields are listed, then fields seen in its last run output or, before a run, in its test data. Picking one writes `{{ nodes.<id>.<path> }}`, or `{{ trigger.<path> }}` for the trigger, at the caret. Only text and untyped settings have an Insert button; number, boolean, list and object settings are typed or wired.
- **Pills.** A text setting that reads fields shows them as pills, named by the field with the full source in a tooltip, until it is clicked; then it is the plain text. The pill is a display form of the existing `{{ }}` text, so the run code is unchanged. A pill, a source chip or a menu row under the pointer marks its source step on the canvas with a grey band.
- **Wired.** A data wire into the port replaces the box with a chip naming the feeding step and path, with Disconnect. A binding stored by the old Inputs section shows the same way: a reference as its step and path with Remove, a fixed value or template with Edit as text, which writes the value into the box and removes the binding.
- **Wire-only inputs.** A Call workflow's and a Return's `value.<id>` inputs show as rows that read "Connect this on the canvas" until wired.
- **Run behaviour.** On error, and for HTTP the fail-on-error switch, sit under a collapsed "If this step fails" section that shows the current choice.
- **Tabs.** Configuration, Outputs and, where it applies, Test, in the panel's header row between the Back and Delete icon buttons. The tab stays while another step is selected and starts over when the panel is reopened. An issue picked from the issue list opens Configuration, where its setting is marked. A step with nothing to set up says so and where its outputs are.

The HTTP step's saved-credential field and the loop and retry body settings stay on Configuration. Collected outputs and declared output fields are on Outputs. The Inputs section, its four modes and the source-field search are gone.

### Test data on each step

Every trigger, and every step that calls out (HTTP, Content sync, Slack, email, AI Agent, Call workflow), has a Test tab with one box per output pin. A trigger's values are its sample event; a step's values are what it returns in a mock test run. These are the mockable steps, set in one table typed over every step type, so a new type has to choose. Every other step, Wait and Merge included, is worked out by the run from its inputs, in a test as in a live run, and has no test data; a test checks that each of them has logic the run carries out.

- **Nothing is invented.** A mock run uses each step's test data as its output and never makes values up. Before a run starts, the editor finds every value the run would read, through a wire, a binding or a template, that is not set, refuses the run, names the first missing value and opens its Test tab from the notice. A step that runs for real, or is set to fail, needs no test data.
- **Filling the tab.** "Fill with examples" writes the built-in samples into the boxes where they are seen. "Use last run" copies the step's output from the last run. "Use as test data" on a past run in the run history copies that run's outputs into every step that has a Test tab. Each box takes its pin's type; an untyped box, such as an HTTP step's `json`, reads text that starts with `{` or `[` as JSON when it is left. The same values feed the Insert menu and the wired-field picker, so a field's type and sample are known before a run.
- **Storage.** Test data lives in editor state beside the steps, not in their data, so editing it records no undo step. The request to the run engine is a trigger input and a map of mock outputs keyed by step id, as before; computed steps such as If, Switch, Set fields and loops run their real logic, and Wait and Merge are settled by the engine.

### Mocking per step

Which steps call out for real is chosen per step, not for the whole test run. On its Test tab, a mockable step other than a trigger is set to **Use test data** (the default) or **Run for real**, and while it uses test data its **Outcome** is **Succeeds** or **Fails**.

- **Running for real.** The run lists the steps it runs for real (`realNodeIds`). The server's durable run decides per step: a listed step gets its credentials and the real executor, every other step the mock executor. A step runs for real only when listed, never because its test data is missing, and only in a mock run; the server drops a listed trigger or a step the definition lacks. When every mockable step runs for real, the editor sends a live run, as the old live test switch did, so Wait steps really wait. The run records the steps it ran for real, and run history marks them.
- **Asking first.** Before a test run in which any step runs for real, a dialog lists those steps and asks. It also names, for each of them, the mocked steps whose test data it reads, directly or through steps the run works out, since such a step acts for real on test values. The warning applies to every kind of step. The trigger's sample event is not counted: every test uses one, so it would warn on every run.
- **Marks and settings.** A step that runs for real has a lightning mark on its card. The test settings beside Test workflow replace the live test switch: they count the steps that run for real and set every step to use test data, or to run for real, at once.
- **Failing.** A step set to fail returns the error code and message from its Test tab instead of its test data. What follows goes through its On error setting, as a real failure would: the run stops, goes on, or takes the error path. A step set to fail needs no test data. One outcome applies to every loop iteration and retry attempt.
- **Saving.** The test data and these choices are saved with the draft when it is saved, through the same request, and never published. They are stored encrypted, as a run's trigger input and mock outputs are, since test data can hold real values copied from a run. Entries for steps the draft no longer has are dropped when it is saved. A change to them counts as an unsaved change.
- **Not offered without the server.** The editor's local test run, used by Storybook, cannot call out, so there a step cannot be set to run for real. It runs as a mock run, so a Wait finishes at once.

## Consequences

- A value appears once, and its source is visible: in the box, as pills, or as a wire or chip.
- Users never see the four binding modes. While editing a setting's text they see `{{ nodes.<id>.<path> }}`, so a new step's id is its kind, such as `notify_slack`, numbered when the workflow already has one, rather than a random string.
- Lists and objects inserted into text come out as JSON, as before.
- A mocked step can fail, so error branches, Try / Catch and Retry can be tried without calling out. A mocked step cannot yet choose one of several exits, which no step that calls out has today.
- A step can call out for real on test values from a mocked step; the dialog says so, but does not stop it.
- Test data and test run choices survive a reload once the draft is saved. Two columns are added: the saved test setup on the workflow, and the steps that ran for real on the run.
- Stored bindings in fixtures keep working through the chips; no conversion is needed, since no user workflows exist.

## Alternatives considered

- **Keep the Inputs section and only reorder or tab it.** Tried first as tabs. It does not remove the duplication or explain the modes.
- **A per-field mode toggle, as in n8n.** Rejected: our wires already carry a reference, so a mode is a second way to do one thing.
- **A wire that carries a path inside an output and a fallback,** replacing the reference binding's remaining extras. Mocked up, not built; it changes the edge model.
- **A token editor where each field is one object in the text.** Evaluated: the right long-term answer, built on TipTap, which the app already has. It needs an inline pill node, parsing between the `{{ }}` text and the editor's document, a single- and multi-line wrapper that uses the editor's undo stack in place of TipTap's own, and the Insert menu as a `{{` suggestion: roughly 450 to 600 lines plus tests, replacing about 120. Deferred; readable step ids were done first.
- **Keep the single mock map and add a UI over it.** Rejected: ids are internal, and invented values would remain.
- **A failure outcome per step mock, as in Workato.** Built as the Outcome choice, with the step's On error setting deciding what follows rather than the choice picking an exit itself.
- **One live switch for the whole test run.** Replaced: it could not try one real step among mocked ones, and it called out for every step at once.
- **Sorting steps into pure, read-only and effectful, with read-only lookups run for real by default.** Dropped for the one mockable or not split: per-step mocking lets a person choose, and what a step does need not be classified.
- **Saving test data on its own, as the person edits it.** Rejected for saving with the draft: one Save, and the unsaved-changes warning covers it.

## Out of scope

- Choosing which of several exits a mocked step takes, and a different outcome per loop iteration or retry attempt.
- Running read-only steps for real by default.
- Clickable pills that open their source, pills that respond to keyboard focus, and turning a lone pill into a wire.
- Declaring an output's shape from an example, and type checks on wires from test data.
- A more compact panel.

## Validation

Unit tests cover the field helpers, the panel's tabs and fields, the test data rules, the refused run, the run-for-real dialog and saving with the draft. Database tests cover a mock run with one step run for real, a mocked failure, and the saved setup. Storybook stories cover the tabs, the panel states and a step's test run choices. The form, the Insert menu, a pill and the pointed source step were checked in the running app.
