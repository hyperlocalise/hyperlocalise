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

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-06)
