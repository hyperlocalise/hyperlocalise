# [BUG] Provider-backed prompt input can clear newly typed text after submit

**File:** [`apps/hyperlocalise-web/src/components/ai-elements/prompt-input.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/components/ai-elements/prompt-input.tsx#L803-L850) (lines 803, 804, 805, 811, 813, 817, 838, 840, 841, 848, 849, 850)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

In provider mode, handleSubmit captures the submitted text but does not clear the controlled provider text immediately. It then awaits blob-to-data-url conversion and the caller's async onSubmit before calling controller.textInput.clear(). If the user edits or starts a new draft during that async window, the success path clears the current provider value and loses the new draft. The local uncontrolled path avoids this by resetting the form immediately after capture, but the provider path does not.

## Recommendation

For provider mode, clear or snapshot the submitted value immediately after capture, or clear on success only if the current provider value still equals the submitted text. Also consider a local submitting state that disables editing during file conversion.

## Revalidation

**Verdict:** true-positive

The current code still does not clear provider-backed text immediately after capturing the submitted value. PromptInputProvider stores textInput in React state and builds a controller object whose textInput.value is the primitive value from that render. handleSubmit captures text from controller.textInput.value, then awaits blob URL conversion and possibly awaits the caller's async onSubmit before clearing. The added guard `controller.textInput.value === text` is not a reliable current-value check, because the async handler closes over the controller object from the submit render; if the user types a new draft later, React creates a new controller object, but the already-running async handler still sees the old value. On success, controller.textInput.clear() calls the stable setTextInput callback and clears the provider's current state, including any newly typed draft. A concrete scenario exists in provider mode with an attachment: submit a message, type a new draft while blob-to-data-url conversion or the async send is still pending, and the success path clears the new draft. The uncontrolled local path resets the form immediately, but the provider path remains race-prone. Commit 94a932a attempted to mitigate this, but the mitigation is incomplete because it does not read from a mutable latest-value ref or clear at capture time.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-22)
