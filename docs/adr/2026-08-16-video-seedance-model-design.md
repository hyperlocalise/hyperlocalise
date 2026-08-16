# Video localization uses Seedance 2.5

## Date

2026-08-16

## Context

Video localization called `google/gemini-omni-flash-preview` through Vercel AI
Gateway. ByteDance Seedance 2.5 is now on the same Gateway as
`bytedance/seedance-2.5`. It edits a source clip from `inputReferences`,
returns MP4 with audio, and accepts the same `experimental_generateVideo`
shape already used for Omni.

Seedance asks the prompt to name the first video reference as `[Video 1]`.
Generation can take several minutes, so the ByteDance poll timeout is 10
minutes.

## Decision

Point `hyperlocaliseVideoModelId` at `bytedance/seedance-2.5`. Keep the
existing Gateway call: source MP4 bytes in `inputReferences`,
`aspectRatio: "adaptive"`, `generateAudio: true`, and the source clip
duration. Name the source as `[Video 1]` in the localization prompt.

Duration gates stay 3–10 seconds. File-backed and URL-backed CAT paths do
not change. Image and video jobs stay on the managed Gateway and do not
use org BYOK.

## Consequences

- Tests mock Seedance. `vp test` still makes no live video calls.
- Omni-specific EEA/UK region-block mapping remains. Seedance may return
  different geo errors; those fall through to `video_localization_failed`.
- Seedance documents URL references. Gateway still accepts the current
  buffer `inputReferences` used for Omni. Switch to hosted URLs only if
  buffer uploads fail in production.
- Seedance can generate up to 30 seconds. Raising the 10s ingest cap is a
  follow-up.

## Follow-ups

Clips over 10s, hosted URL references if buffers fail, org BYOK for video.
