# Undo stack for the automation form

## Status

Accepted. Built on the new and saved automation pages.

## Context

The automation setup pages hold a form that the person edits by hand and that an assistant will soon fill in for them. Taking a change back needs an undo the app owns:

- The browser keeps one undo history per text field, has none for selects and lists, and offers no way to push onto it. Setting a field's value from code wipes that field's history.
- An assistant turn changes several fields at once. One keystroke should take the whole turn back, with the person's own edits before and after it kept in order.
- The visual workflow editor will want the same thing, so the stack must not know about the automation form.

Two smaller problems on the saved page came out of the same work: a run refetched the record and rebuilt the form, dropping unsaved edits, and there was no way to drop edits short of leaving the page.

## Decision

One undo stack per page, holding whole snapshots of the form, with the page's own keyboard shortcuts scoped to it.

### Stack

- `src/lib/undo-stack/undo-stack.ts` is a pure reducer over a document `T` and a host description `D`. A step holds `before`, `after`, an `origin` (`user`, `assistant` or `system`), the description, and a coalescing key. Undo replaces the document with `before`, redo with `after`. The caller passes the time, so the reducer has no clock.
- Steps with the same key merge while they arrive within a second of each other, so a burst of typing is one step. A step is sealed, and merges no more, when focus leaves the field or when it is undone. A burst that ends where it began leaves no step. The past is capped at 100 steps.
- `use-undo-stack.ts` owns the document through that reducer and exposes `form`, `change`, `seal`, `undo`, `redo`, the next steps either way, `replace` (set without a step) and `reset` (set and forget).

### Shortcuts

- `use-undo-shortcuts.ts` binds Ctrl or Cmd+Z, Ctrl or Cmd+Shift+Z, and Ctrl+Y off macOS through `react-hotkeys-hook`, and listens for the browser's own `historyUndo` and `historyRedo` input events for the menu bar and shake-to-undo.
- It returns a callback ref for the root element. A key press counts only when its target is inside that root or is the page body, so anything in a portal, such as a dialog, a menu, the chat dock or the memory editor, keeps the browser's undo. The root may mount after the first render, as the saved page's does.
- The listener stays attached while there is nothing to undo, so the browser's undo never comes back inside the form's fields.

### Automation form

- `src/lib/agents/workspace-automation-undo.ts` describes a change as the part of the form it touched, such as the name or the trigger, and gives typing in one text field its coalescing key. The form is nullable, because the saved page has none until its record loads.
- Both pages replace their form state with the hook. The header gains Undo and Redo icon buttons with the step named in a tooltip. Each undo or redo raises one toast, replaced on the next press, naming the change with the way back as its action.
- The saved page's "Discard changes" button asks first and is one step. "Run now" with unsaved changes asks to save and run, or discard and run. Save keeps the history, so an undo after it makes the form unsaved again.
- The saved page rebuilds its form only when the saved configuration changes: not after a run, not when its own save returns (the record the save returned is compared), silently when the form is clean, and as a `system` step when someone else saved over unsaved edits.
- The stack is forgotten when the page unmounts or another automation loads.

## Consequences

- Every hand edit is undoable, in one order with the assistant's turns once they land.
- Undo inside a text field goes through the stack, not the browser, so the caret lands at the end of the restored value.
- A run or a push no longer drops edits in progress.
- The toast is the only feedback. Nothing scrolls to or highlights the changed field.
- Two listeners per page, no server change, no migration.

## Alternatives considered

- Per-field marks with Keep and Revert on each change. More to read and to click, and it cannot order the assistant's turn among the person's edits.
- Pushing onto the browser's history with `execCommand("insertText")`. Works for one focused text field only, steals focus, and the command is deprecated. The `UndoManager` API is not shipped.
- Asking before an undo that leaves the focused field. It needs a dialog in the middle of a run of key presses and makes undo asynchronous for every caller. Dropped.

## Out of scope

- The assistant's step and its confirm prompt; `origin: "assistant"` and the wording are in place for it.
- The visual workflow editor; it supplies its own description and equality over the saved definition.
- Caret restore after undo, and scrolling or highlighting the changed field.

## Not decided

- Whether a save made elsewhere while the form is clean should be a step rather than a silent reload.

## Validation

Unit tests cover the reducer, the hook, the shortcuts (root, body, portal, late root, browser-initiated undo, seal on focus out), and the describer. Page tests cover a typing burst as one step, redo, redo cleared by a new change, discard then undo, discard and run then undo, a refetch after a run keeping edits, a save made elsewhere as a system step, a save whose stored values were trimmed, and the shortcut left to the browser inside a dialog. Two Storybook stories drive the buttons on the real editor.
