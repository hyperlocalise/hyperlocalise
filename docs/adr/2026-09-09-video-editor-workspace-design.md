# Video refinement workspace

## Decision

Replace the file-backed video's two bare players with a preview-first workspace,
following the image editor's restrained surfaces and review flow. The user approved
this direction on 9 September 2026.

The stage shows the original or translated video and can compare both. Playback,
scrubbing, and timestamped text elements share a playhead. Only the active preview
plays audio. A responsive inspector contains Sound and On-screen text tabs.

Sound controls express generation instructions: translate or preserve speech,
voice and pacing direction, and background-audio direction. They do not pretend to
mix separate audio stems. Changes apply through the existing video generation
callback; preview volume affects listening only.

Text extraction is optional and explicitly scoped to the original frame at the
playhead. The browser captures a bounded PNG and an authenticated, project-scoped
endpoint uses the existing metered image text extractor. Reviewers can correct
the transcription, supply an exact replacement, keep an element unchanged, or
add an element manually. Timestamps and normalized bounds accompany instructions
to generation. Extraction does not claim to scan the whole video or detect exact
appearance intervals.

Draft refinements stay in this workspace until generation; failures retain edits.
Approval is blocked while refinements are unapplied. File and locale changes reset
the workspace, abort extraction, and clear the review block. No schema migration
or new generation provider is required.

## Validation

Test generation instructions, failed-generation recovery, extraction errors,
timestamp selection, read-only behavior, and review blocking. Exercise the real
API for project access, invalid/oversized frames, and billing denial. Include
Storybook states for preview, missing translation, and read-only review. Run
`vp test` and `vp check --fix`, then inspect desktop and narrow layouts.
