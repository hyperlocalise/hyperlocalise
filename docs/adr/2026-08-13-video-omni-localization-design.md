# Video localization with Gemini Omni Flash

Superseded for the model id by
[2026-08-16-video-seedance-model-design.md](./2026-08-16-video-seedance-model-design.md).
The dual-entry CAT paths, duration gates, and error codes in this note still
apply.

## Date

2026-08-13

## Context

Hyperlocalise localizes text, images (png/jpeg/webp via `gpt-image-2`), and
office files (manual CAT). Video is out of scope in the image translation
design. Users need to upload short clips, regenerate localized MP4s, and review
them in native CAT, including string keys whose value is a direct video URL.

`google/gemini-omni-flash-preview` on Vercel AI Gateway edits uploaded video
and returns an MP4 with audio. Clips are 3–10 seconds at 720p. English is fully
supported; other languages are unevaluated. Uploaded-video edit is unavailable
in the EEA, Switzerland, and the United Kingdom. Voice editing is not
supported. Captions, CLI sync, Slack, email, Contentful, YouTube, and webm wait.

Image regen and video both use Vercel AI Gateway model strings. Vercel
authenticates those calls with OIDC. File-translation sandboxes still use
`OPENAI_API_KEY`.

## Decision

Mirror image dual entry. Do not generalize `project_image_variants`.

| Entry | Source of truth | Target | v1 sync |
|-------|-----------------|--------|---------|
| File-backed | `.mp4` source file | Localized MP4 in `project_video_variants` | Native web only |
| URL-backed | String key whose text is `https://…/clip.mp4` | Hyperlocalise public media URL | String sync unchanged |

Shared path: load bytes → confirm `video/mp4` and duration 3–10s from the MP4
`mvhd` box → call Omni via Gateway → store output. File-backed attaches a
variant. URL-backed writes `/api/public/media/:fileId` into the translation.

Surfaces: native project CAT, source upload, and file translation jobs. Org
Gemini BYOK stays text-only.

## Data model

File-backed sources skip string-key extract. `project_video_variants` matches
`project_image_variants` (project, path, locale uniqueness; status; provenance;
stored file). Metadata may hold duration seconds.

URL-backed keys use `metadata.contentKind: "video_url"`. A key cannot be both
`image_url` and `video_url`. Public media serving allows opted-in `image/*` or
`video/mp4`.

Formats: `mp4` only. `looksLikeVideoUrl` is http(s) with pathname ending `.mp4`.
Duration under about 3s or over 10s, or a missing `mvhd`, is rejected before the
model runs.

## CAT and jobs

File-backed CAT uses File view with source and target video players,
Regenerate, Upload replace, Approve, and Reject. Ingest creates empty draft
variant rows per target locale.

URL-backed CAT shows Treat as video when `looksLikeVideoUrl`. Native projects
only. String translation jobs do not localize `video_url` keys; CAT regenerate
does.

File jobs add a video branch next to images. Approved variants stay locked
without force. Usage metering source is `video_localization`.

The model id is `google/gemini-omni-flash-preview` through the AI SDK Gateway
default provider. The
prompt keeps composition and localizes on-screen text and speech. Generation
runs in workflow steps, not the HTTP handler.

## Errors

Stable codes: `unsupported_video_format`, `video_duration_unreadable`,
`video_duration_unsupported`, `video_fetch_failed`, `video_ssrf_blocked`,
`video_model_unavailable`, `video_edit_region_blocked`,
`video_localization_failed`, `approved_locked`. CAT keeps the prior target.
Jobs fail with the code. Do not retry region blocks.

## Testing

Unit tests cover format gates, URL detect, duration parse, public media video,
and treat-as-video clearing `image_url`. Service tests cover localize, URL
write-back, approved lock, and SSRF. Route and workflow tests mock Gateway.
No live Omni calls in `vp test`.

## Follow-ups

webm, captions/SRT, CLI sync, Slack/email/Contentful, YouTube/Vimeo, clips over
10s, org BYOK for video, Gateway cutover for images.
