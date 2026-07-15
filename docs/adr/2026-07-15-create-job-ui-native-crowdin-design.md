# Create job UI for native and Crowdin

## Context

Project Jobs pages could list and inspect work, but humans had no dedicated create surface for locales, files, and assignees. Crowdin task create lived only in the adapter. Deletion/cancel was missing.

## Decision

1. Add a **Create job** dialog on project Jobs pages for both native and Crowdin (`ext:crowdin:*`) projects.
2. Wire Crowdin through `POST /tms-provider/projects/:id/jobs` (one Crowdin task per locale) and `DELETE /tms-provider/jobs/:id`.
3. Extend native create with optional title + assignee (`ownerWorkosUserId`) and add `POST .../jobs/:id/cancel`.

## UI

- Title, target locales, multi-file selection, assignees
- Crowdin: task type (translation/proofread), description, multi-assignee
- Native: one assignee, one AI translation job per selected file

## Non-goals

- Multi-assignee native jobs
- Create/delete for Phrase / Lokalise / Smartling in this change
