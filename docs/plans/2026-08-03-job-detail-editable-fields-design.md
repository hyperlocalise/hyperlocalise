# Job detail editable fields — Design

**Status:** Approved  
**Date:** 2026-08-03

## Summary

Let users edit assignees, title, and description on Jobs detail, with parity to Issues where the models map. Native jobs use a single owner plus local title/description. Crowdin and Smartling sync supported fields to the TMS. Other providers stay read-only for these fields.

## Goals

- Assign or unassign a native job owner from detail (single assignee)
- Assign Crowdin task members from detail (multi-assignee)
- Edit title and description on native, Crowdin, and Smartling jobs
- Keep create-dialog assignee sources and validation rules
- Leave status, due date, locales, and non-Crowdin/Smartling provider assignees out of this change

## Field matrix

| Field | Native | Crowdin | Smartling | Other providers |
|-------|--------|---------|-----------|-----------------|
| Title | `inputPayload.metadata.title` | PATCH `/title` | `jobName` via update job | Read-only |
| Description | `inputPayload.metadata.description` | PATCH `/description` | existing description update | Read-only |
| Assignees | single `ownerUserId` | multi `assigneeExternalUserIds` | Read-only (no simple assignee API) | Read-only |

## APIs

### Native

`PATCH /api/orgs/:org/projects/:projectId/jobs/:jobId`

Body (all optional; at least one required):

```ts
{
  title?: string;                 // 1–256 chars
  description?: string | null;    // max 2048; null clears
  ownerWorkosUserId?: string | null; // null unassigns
}
```

- Requires `jobs:write`
- Owner must be an active org member with project access (same spirit as issue assignability)
- Writes title/description into `inputPayload.metadata`
- Returns the updated job record

### Provider

Replace description-only route with:

`PATCH /api/orgs/:org/tms-provider/jobs/:encodedJobId`

Body (all optional; at least one required):

```ts
{
  title?: string;
  description?: string | null;
  assigneeExternalUserIds?: string[]; // Crowdin only
}
```

- Crowdin: title, description, assignees via JSON Patch
- Smartling: title + description; assignee updates return `unsupported_job_field_update`
- Other providers: `unsupported_job_field_update`
- Keep the old `/description` path as a thin alias or migrate callers in the same change

## UI

### Assignees

- Properties sidebar: replace the comma-joined string with a picker for native and Crowdin
- Native: Issue-like single-select (Unassign, Assign to me, members)
- Crowdin: multi-select toggle list matching create dialog
- Smartling / unsupported: keep read-only text

### Title

- Inline editable header (blur/Enter save, Escape cancel)
- Reject empty titles client-side before PATCH

### Description

- Crowdin/Smartling: keep `ProviderJobDescriptionField`, driven by the unified PATCH
- Native: same editor/preview slot; store in `metadata.description`

### Interaction

- Disable controls while a mutation is pending
- Optimistic detail-cache patch; invalidate job lists afterward
- On failure, show the error and revert optimistic values

## Data flow

1. Detail loads job + assignable members (org members for native; TMS project members for Crowdin)
2. User edits title, description, or assignees → PATCH
3. Server checks permission, job existence, and provider field support
4. Native updates DB; Crowdin/Smartling call provider APIs and refresh cached external fields
5. Client updates detail cache and list/“assigned to me” queries

## Errors

| Code | When |
|------|------|
| `assignee_not_assignable` | Native owner is inactive or lacks project access |
| `unsupported_job_field_update` | Field not supported for provider kind |
| Provider auth / not found | Existing Crowdin/Smartling error mapping |
| Empty title | Validation reject (min 1 char) |

## Testing

- Native PATCH: title, description, owner assign/unassign, invalid owner
- Crowdin PATCH: title, description, assignees
- Smartling PATCH: title, description; assignees rejected
- Unsupported provider → 400
- Layout helpers: picker vs read-only by provider
- Mutation/UI coverage where Issues/description patterns already exist

## Out of scope

- Smartling assignee editing
- Due date, status picker, locale edits
- Phrase/Lokalise field edits
- Job activity feed for assignee changes
