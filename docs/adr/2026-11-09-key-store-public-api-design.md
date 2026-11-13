# Key store and key jobs in the public API

**Status:** Accepted

## Context

[Key store and key jobs](2026-11-05-key-store-and-key-jobs-design.md) added tags, design links and tasks made of strings to the content editor. Teams moving from Phrase Strings also run this work from scripts: their automation tags keys, uploads screenshots and links them to keys, puts keys into jobs, adds and removes a job's keys and languages, completes jobs, and marks translations unverified in batches. Phrase, Lokalise, Smartling and Crowdin all offer these actions through their API as well as their editor.

## Decision

All routes are for native projects and use the existing scopes (`strings:read` / `strings:write`, `jobs:read` / `jobs:write`), plus `translations:approve` for approving (below). Permissions match the app's role rules in `policy.ts`. Tags and links follow the editor's rules in `internal/keymeta`.

### Strings

- Strings carry `tags` and `designUrl`. `GET /v1/projects/{projectId}/strings` takes a repeatable `tag`; a string must carry every tag given.
- `POST /v1/projects/{projectId}/strings/bulk-update` picks strings by `stringIds`, `keys` or `tags` and adds tags, removes tags or sets (or clears) the design link, up to 1,000 strings per call. As in the editor, only admins, localization managers and developers change them. Only this route writes them; the single-string `PATCH`, string create and batch upsert are unchanged.
- `GET /v1/projects/{projectId}/translations` also takes a repeatable `key` and `updatedSince`.

### Batch review

- `POST /v1/projects/{projectId}/translations/send-to-review` moves approved translations of the picked strings (`stringIds`, `keys` or `tags`, optionally limited to `locales`) back to needs review, keeping their text and writing a revision, through the same code as a source text change. This is Phrase's batch "unverify".
- `POST /v1/projects/{projectId}/translations/approve` approves the picked strings' translations that wait for review, and drafts, when they have text. Blank translations, rejected translations, texts over the string's maximum length and segments locked in the editor are left alone.
- Approving or rejecting is a review decision. In the app it needs `write_back:approve` (admins, localization managers and reviewers), so here it needs `translations:approve`: batch approve, approving or rejecting one translation, and the bilingual import, which saves rows as approved. Sending a translation back to needs review is an edit, which the app allows everyone who edits translations (`write_back:translation`), so batch send to review needs `strings:write`, as a single-translation save with `needs_review` does.

### Key jobs

- `POST /api/v1/jobs` takes `type: "keys"` for native projects, picking keys by `stringIds`, `keys` or `tags` (a tag picks the keys carrying it at that moment), up to 5,000, with the editor's rules for hidden keys, keys in no file and the open-jobs limit. `POST /api/v1/jobs/{jobId}/complete` finishes a task for people with **Mark done**'s rules: reviewers and managers may finish any task, anyone else only a task assigned to them. Both stay in the web app, where jobs are created today and where **Mark done** records its events and its Reports entry. A task created here starts its Reports analysis, as one made in the app does, and stores the project's spelling of its languages.
- `GET`, `POST` and `DELETE /v1/jobs/{jobId}/strings` list, add and remove a job's keys. `GET /v1/jobs/{jobId}/locales` gives each language's progress over the job's visible keys; progress is worked out when asked for, so a translation sent back to review lowers it at once. `POST /v1/jobs/{jobId}/locales` and `DELETE /v1/jobs/{jobId}/locales/{locale}` add and remove a language. Changes are only allowed while the job is open.
- The string, batch review and job string and language routes are in the standalone public API service (`apps/public-api`), next to the other string routes.

### Screenshots

- `GET, POST /v1/projects/{projectId}/screenshots` lists and starts an upload. Create returns a time-limited PUT URL; `POST .../screenshots/{screenshotId}/finalize` verifies the object and marks it ready. `GET` and `DELETE` address one screenshot. Markers live at `POST .../markers` (upsert) and `DELETE .../markers/{markerId}`.
- Reads need `strings:read`; writes need `strings:write` (the same CAT `canEdit` rule as the editor, not the key-details role). Native projects only. PNG, JPEG and WebP, 1 byte to 10 MB. Markers are optional percent boxes (0–100) that pick a string by `stringId` or `key` (`filePath` when the key exists in more than one file). Figma-synced frames appear with `figmaUrl`; this API does not write Figma fields. The Figma plugin still syncs frames through its internal route.
- The same `project_visual_context_screenshots` and `project_visual_context_bindings` tables as the Content Editor. Object storage must be configured or writes return `503 screenshot_storage_unavailable`.

## Consequences

- Bulk update writes the existing `project_strings_updated` activity entry. Batch review, screenshot and marker writes, and the job string and language routes write none yet; adding an event type touches the activity log contract in two services.
- Reports misses changes made through the Go routes: strings and languages added to a task are not analysed again, those removed stay in its analysis, and batch approvals are not counted as work on a task, because Reports starts its analysis and counts approvals in the web app. Reports has no customer users yet.
- The public API applies the app's approve rule as the AI assistant's tools do. The content editor does not check it yet in two places: its approve button, and its bilingual import, which saves rows as approved. Developers and translators can still approve there.

## Alternatives considered

- **Phrase's own words (`verify`, `unverify`).** The routes use the app's words, so the API matches its statuses; the editor docs give Phrase users the mapping.
- **Tags and links on every string route.** Those routes are being changed by other work; one bulk route covers the scripts' calls without touching them.
