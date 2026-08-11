# Native file job display names

## Problem

Translate with agent creates native file translation jobs whose UI name falls
back to `inputPayload.sourceFileId` (a `file_…` UUID). That is not readable in
job lists or detail pages.

## Decision

When creating a native file translation job, set
`inputPayload.metadata.title` to:

```
{filename} · {YYYY-MM-DD HH:mm}
```

- Use the stored file basename (`sourceFile.filename`).
- Use a fixed UTC stamp so the persisted title is timezone-stable.
- Keep the existing ` · ` separator used elsewhere in job title copy.
- Caller-supplied `metadata.title` still wins when provided.

## Display

`getJobName` already prefers `metadata.title`. Align job detail title
resolution to the same order:

1. `externalTitle`
2. `metadata.title`
3. `sourceFileId` (legacy fallback)
4. job id

## Scope

- `createFileTranslationJob` (automations and other helper callers)
- Project jobs create route (`job.route.ts`) used by Translate with agent UI
- Shared `mergeNativeFileTranslationJobMetadata` helper for both paths
- Job detail layout title resolution
