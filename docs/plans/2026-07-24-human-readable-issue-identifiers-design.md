# Human-readable issue identifiers

**Status:** Approved — Approach B  
**Date:** 2026-07-24  
**Related:** [Issue Sheet design](./2026-07-07-issue-sheet-design.md), [Workspace Issues flag](./2026-07-16-workspace-issues-flag-design.md)

## Problem

Issues use UUIDs as their only public identity (`2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21`). Those IDs are hard to say, remember, or paste into chat. Teams need Linear-style references such as `HL-123` while keeping UUIDs as the stable internal primary key.

## Goals

- Show a human-readable ID everywhere people talk about issues.
- Give each project a short **Identifier** (prefix), defaulted from the project name and editable in project settings.
- Keep `issue_sheet_issues.id` (UUID) as the canonical internal and URL identifier for this release.
- Assign numbers safely under concurrency and never reuse a number within a project.
- **Persist the full display ID** (`HL-123`) on each issue row at create time (Approach B).

## Non-goals (this release)

- Replace UUID path segments with `HL-123` in app URLs (deferred; keep UUID routes).
- Org-wide sequences (numbers are per project).
- Public `/v1` API changes beyond returning the new fields on existing issue payloads.
- Renaming translation-key field `IssueSheetIssue.key` (that remains the string key).

## Decision

**Approach B — store full display ID on each issue.**

Persist `issue_sheet_issues.identifier` as `HL-123` at create time so list and detail DTOs need no join for display. Keep `number` for sequencing and uniqueness. When a project prefix is renamed, rewrite stored issue identifiers for that project so display stays consistent.

### Alternatives considered

| Approach | Why not |
|----------|---------|
| A — compose at read time | Chosen originally; superseded by product preference for stored IDs |
| C — human ID as route key now | Too invasive for this release |

## Design

### Data model

#### `projects`

| Column | Type | Notes |
|--------|------|--------|
| `identifier` | `text` not null | Short prefix, e.g. `HL`. Unique per `organization_id`. |
| `issue_number_seq` | `integer` not null default `0` | Last issued number for this project. |

Constraints:

- Unique on `(organization_id, identifier)` with uppercase-normalized values.
- Check: `identifier ~ '^[A-Z][A-Z0-9]{0,9}$'` (1–10 chars, starts with a letter).

#### `issue_sheet_issues`

| Column | Type | Notes |
|--------|------|--------|
| `number` | `integer` not null | Per-project sequence, starting at 1. |
| `identifier` | `text` not null | Full display ID, e.g. `HL-123`, stored at create (and rewritten on project prefix rename). |

Constraints:

- `unique (project_id, number)`
- `unique (project_id, identifier)`
- Index `(organization_id, project_id, number)` for list sort / lookup

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
RETURNING issue_number_seq, identifier;
```

Insert the issue with that `number` and `identifier = formatIssueIdentifier(prefix, number)`. Never allocate outside the transaction. Dedup paths that return an existing issue must **not** consume a new number.

CSV import: each newly inserted row gets the next number; skipped duplicates keep their existing identifier.

### Project settings UI

Add **Identifier** under General on `/org/.../projects/.../settings`.

- Label: **Identifier**
- Help: “Used as the prefix for issue IDs (for example HL-12). Letters and numbers only.”
- Editable for **native and external** projects (Hyperlocalise metadata).
- Validate client + server with the same Zod rules as the DB check.
- On conflict: field error `identifier_taken`.
- On rename: rewrite `issue_sheet_issues.identifier` for the project to `${newPrefix}-${number}`. Confirm copy: “Existing issues will show the new prefix.”

Who can edit: same permission as updating project settings today.

### API / types

Extend issue DTOs with:

```ts
{
  id: string;          // UUID (unchanged)
  number: number;
  identifier: string;  // "HL-123" stored display ID
}
```

Project records expose `identifier` (prefix). Do not overload translation `key`.

Zod:

- `updateProjectBodySchema`: optional `identifier`
- Project create responses include `identifier`
- Issue params remain `issueId: z.string().uuid()` for this release

### UI surfaces

Show the stored human ID as muted mono/tabular text next to or above the title.

| Surface | Change |
|---------|--------|
| Project Issue Sheet table | Leading `HL-12` + title |
| Org `/issues` table | Same |
| Issue detail header / breadcrumb | Show `HL-12` beside title |
| Create success / CAT toast | Prefer `HL-12` in copy; link still uses UUID URL |
| Copy action | “Copy ID” copies stored `HL-12` |

Do not replace the translation-key subtitle with the issue identifier.

### Backfill

1. Add nullable columns.
2. Backfill `projects.identifier` for all rows (collision-safe).
3. Backfill `issue_sheet_issues.number` per project ordered by `created_at asc, id asc`.
4. Set `issue_sheet_issues.identifier` from project prefix + number.
5. Set `issue_number_seq` from max(number).
6. Set columns `not null` and add unique indexes / checks.
7. Generate via `vp run db:generate` — do not hand-write SQL snapshots. Custom SQL data backfill can live in the generated migration or a follow-up migrate script if Drizzle cannot express the procedural uniquify.

### Concurrency and edge cases

| Case | Behavior |
|------|----------|
| Two creates at once | Row lock on `projects` update serializes numbers |
| Identifier rename | Mass-update stored issue identifiers; UUID URLs unchanged |
| Delete issue | Number is not reused |
| Project delete | Cascade removes issues; prefix freed for reuse |
| Empty / emoji-only project name | Fallback identifier `PROJ` then `PROJ2`… |

### Testing

- Unit: identifier derivation, uniquify, format helper
- Service: create assigns `1`, `2`, … with stored IDs; dedup does not bump seq; rename rewrites stored IDs
- Route: PATCH project identifier validation + conflict; issue GET includes `identifier`
- UI: settings field; table/detail render

### Implementation order

1. Schema + migration + backfill
2. Project create default + settings PATCH + form field
3. Issue create path assigns `number` + stored `identifier`; extend DTOs
4. Wire UI lists, detail, toasts, copy
5. Tests + `vp check` / `vp test`

## Success criteria

- New issues show stored `PREFIX-N` in lists and detail without exposing UUID in primary UI.
- Project settings expose an editable **Identifier** with org-unique validation.
- Existing projects and issues receive stable numbers and stored identifiers after migration.
- UUID remains the primary key and route param.
