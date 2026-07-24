# Human-readable issue identifiers

**Status:** Proposed  
**Date:** 2026-07-24  
**Related:** [Issue Sheet design](./2026-07-07-issue-sheet-design.md), [Workspace Issues flag](./2026-07-16-workspace-issues-flag-design.md)

## Problem

Issues use UUIDs as their only public identity (`2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21`). Those IDs are hard to say, remember, or paste into chat. Teams need Linear-style references such as `HL-123` while keeping UUIDs as the stable internal primary key.

## Goals

- Show a human-readable ID everywhere people talk about issues.
- Give each project a short **Identifier** (prefix), defaulted from the project name and editable in project settings.
- Keep `issue_sheet_issues.id` (UUID) as the canonical internal and URL identifier for this release.
- Assign numbers safely under concurrency and never reuse a number within a project.

## Non-goals (this release)

- Replace UUID path segments with `HL-123` in app URLs (deferred; keep UUID routes).
- Org-wide sequences (numbers are per project).
- Public `/v1` API changes beyond returning the new fields on existing issue payloads.
- Renaming translation-key field `IssueSheetIssue.key` (that remains the string key).

## Approaches

### A — Prefix + per-project number (recommended)

Add `projects.identifier` and `issue_sheet_issues.number`. Display ID is computed as `` `${identifier}-${number}` ``.

| Pros | Cons |
|------|------|
| Matches Linear mental model and the product note | Display ID changes if the project identifier is renamed |
| Small schema change; UUID routes stay valid | Call sites must join or select project identifier for display |
| Atomic counters are well understood | Needs uniqueness rules and backfill |

### B — Store full display ID on each issue

Persist `identifier` string like `HL-123` on the issue row at create time.

| Pros | Cons |
|------|------|
| No join for display | Renaming the project prefix leaves stale IDs or needs a mass rewrite |
| Simple UI binding | Duplicates prefix data on every row |

### C — Human ID as primary route key now

Switch detail URLs and API params to `HL-123` immediately.

| Pros | Cons |
|------|------|
| Best end-state UX | Touches every Zod param, link builder, React Query key, and CAT toast |
| | Identifier renames break bookmarked URLs unless redirects are added |

**Recommendation:** Approach A. Ship display and settings first; keep UUID routes. Optionally resolve `HL-123` in a follow-up lookup helper without changing the canonical path.

## Design

### Data model

#### `projects`

| Column | Type | Notes |
|--------|------|--------|
| `identifier` | `text` not null | Short prefix, e.g. `HL`. Unique per `organization_id`. |
| `issue_number_seq` | `integer` not null default `0` | Last issued number for this project. |

Constraints:

- `unique (organization_id, lower(identifier))` (or store normalized uppercase and unique on `(organization_id, identifier)`).
- Check: `identifier ~ '^[A-Z][A-Z0-9]{0,9}$'` (1–10 chars, starts with a letter, uppercase A–Z / 0–9).

#### `issue_sheet_issues`

| Column | Type | Notes |
|--------|------|--------|
| `number` | `integer` not null | Per-project sequence, starting at 1. |

Constraints:

- `unique (project_id, number)`
- Index `(organization_id, project_id, number)` for list sort / lookup

Do **not** store the full `HL-123` string. Compose it at read time:

```ts
function formatIssueIdentifier(projectIdentifier: string, number: number) {
  return `${projectIdentifier}-${number}`;
}
```

### Identifier generation

On project create (native and external):

1. Derive a candidate from `name`:
   - Prefer word initials from ASCII letters (`Hyper Local App` → `HLA`).
   - If fewer than 2 letters, take the first 2–3 letters of the stripped name (`App` → `APP`).
   - Uppercase; strip non `[A-Z0-9]`; clamp to 10 chars; ensure it starts with a letter (prefix `P` if needed).
2. If the candidate collides in the org, append `2`, `3`, … (`HL`, `HL2`, `HL3`) until free, keeping length ≤ 10.
3. Persist `identifier` and `issue_number_seq = 0`.

Backfill existing projects with the same algorithm (deterministic order by `created_at`, then `id`).

### Number assignment

Inside the same DB transaction as `createIssue` / CSV import create / CAT create:

```sql
UPDATE projects
SET issue_number_seq = issue_number_seq + 1
WHERE id = $projectId
RETURNING issue_number_seq;
```

Insert the issue with that `number`. Never allocate outside the transaction. Dedup paths that return an existing issue (`externalRef` / linked comment) must **not** consume a new number.

CSV import: each newly inserted row gets the next number; skipped duplicates keep their existing number.

### Project settings UI

Add **Identifier** under General on `/org/.../projects/.../settings`.

- Label: **Identifier**
- Help: “Used as the prefix for issue IDs (for example HL-12). Letters and numbers only.”
- Editable for **native and external** projects. This is Hyperlocalise metadata, not provider-managed — allow edit even when name/locales are read-only for TMS projects.
- Validate client + server with the same Zod rules as the DB check.
- On conflict: field error `identifier_taken`.
- Changing the identifier immediately changes displayed IDs for all issues in that project (numbers stay). Show a short confirm copy: “Existing issues will show the new prefix.”

Who can edit: same permission as updating project settings today (org members with project write access / admins as already enforced by the project update route). No new role.

### API / types

Extend issue DTOs (`IssueSheetIssue`, org issue list/detail) with:

```ts
{
  id: string;                 // UUID (unchanged)
  number: number;
  identifier: string;         // "HL-123" composed display ID
  projectIdentifier: string;  // "HL" — useful in org-wide lists
}
```

Name the composed field `identifier` on the issue payload (Linear-style). Keep project field also `identifier` on project records. Do not overload `key` (translation key).

Zod:

- `updateProjectBodySchema`: optional `identifier`
- Project create responses include `identifier`
- Issue params remain `issueId: z.string().uuid()` for this release

Optional helper (same PR or immediate follow-up, low risk):

- `resolveIssueRef(projectId, ref)` accepts UUID **or** `HL-123` / bare number within a project for future deep links and agent tools. Not required to ship display.

### UI surfaces

Show the human ID as muted mono/tabular text next to or above the title — not as a card badge cluster.

| Surface | Change |
|---------|--------|
| Project Issue Sheet table | First column or leading cell: `HL-12` + title |
| Org `/issues` table | Same; include ID so cross-project rows stay distinct |
| Issue detail header / breadcrumb | Show `HL-12` beside title; keep UUID out of chrome |
| Create success / CAT toast | Prefer `HL-12` in copy; link still uses UUID URL |
| Copy action | Add “Copy ID” (`HL-12`) on detail (and optionally row overflow). Do not copy UUID by default |

Do not replace the translation-key subtitle (`issueKey`) with the issue identifier — both may appear.

### Backfill

Migration steps:

1. Add nullable columns.
2. Backfill `projects.identifier` for all rows (collision-safe).
3. Set `issue_number_seq` from `count(*)` or `max(number)` after issue backfill.
4. Backfill `issue_sheet_issues.number` per project ordered by `created_at asc, id asc` starting at 1.
5. Set columns `not null` and add unique indexes / checks.
6. Generate via `vp run db:generate` — do not hand-write SQL snapshots.

### Concurrency and edge cases

| Case | Behavior |
|------|----------|
| Two creates at once | Row lock on `projects` update serializes numbers |
| Identifier rename | Display IDs update; UUID URLs unchanged |
| Delete issue | Number is not reused |
| Project delete | Cascade removes issues; identifier freed for reuse |
| Empty / emoji-only project name | Fallback identifier `PROJ` then `PROJ2`… |
| Search | Org/project issue list query may match `identifier` / `number` in a follow-up; MVP can keep title-only search |

### Testing

- Unit: identifier derivation, uniquify, format helper
- Service: create assigns `1`, `2`, …; dedup does not bump seq; rename updates composed field
- Route: PATCH project identifier validation + conflict; issue GET includes `identifier`
- UI: settings field; table/detail render; copy ID (component tests where patterns exist)

### Implementation order

1. Schema + migration + backfill helpers
2. Project create default + settings PATCH + form field
3. Issue create path assigns `number`; extend service select/DTO
4. Wire UI lists, detail, toasts, copy
5. Tests + `vp check` / `vp test` for touched packages

## Open questions

None blocking. Deferred product choices:

1. Whether detail URLs should later become `/issue-sheet/HL-123` with UUID redirects.
2. Whether org search should parse `HL-123` as a hard filter.

## Success criteria

- New issues show `PREFIX-N` in lists and detail without exposing UUID in primary UI.
- Project settings expose an editable **Identifier** with org-unique validation.
- Existing projects and issues receive stable numbers after migration.
- UUID remains the primary key and route param.
