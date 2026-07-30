# Issue assignee controls — Design

**Status:** Approved  
**Date:** 2026-07-30

## Summary

Make issue ownership operational. Replace incomplete assignee UX with a searchable workspace-member picker on create, detail, and tables. Enforce assignability on the server. Record assignee changes as activity events and show them in the same chronological feed as comments.

## Goals

- Assign an active workspace member who can access the project, assign yourself, or unassign
- Picker shows name and email and supports search
- Assignee appears (and is editable) on project and workspace issue tables
- Manual create accepts an assignee
- My work updates immediately after assignment
- Inactive users and users without project access cannot be newly assigned
- Existing assignments to removed users stay readable
- Assignment changes create activity events

## Data model

### Existing

`issue_sheet_issues.assignee_user_id` — nullable FK to `users`, `ON DELETE SET NULL`.

### New: `issue_sheet_activities`

| Column | Purpose |
|--------|---------|
| `id` | UUID primary key |
| `organization_id`, `project_id`, `issue_id` | Scope |
| `actor_user_id` | Who made the change (nullable FK) |
| `type` | Start with `assignee_changed` |
| `payload` | `{ previousAssigneeUserId, nextAssigneeUserId }` (null = unassigned) |
| `created_at` | Event time |

Keep activities separate from comments. Do not insert fake system comments.

## Assignability

`null` (unassign) is always allowed.

A non-null assignee must:

1. Have an **active** organization membership (not invited / pending)
2. Have **project access**: role with `teams:write`, or membership on the project’s team

Validation runs on create, update, and CSV import. Leaving a removed user’s existing assignment alone is intentional; display still comes from the users left join.

## APIs

- `GET .../issue-sheet/assignable-members` — active members who can access the project
- `GET .../issues/:issueId/activities` — activity rows with actor and assignee display names
- Create / update already accept `assigneeUserId`; reject with `assignee_not_assignable` when invalid

## UI

### AssigneePicker

Shared searchable popover (Command): Unassigned, Assign to me, then members by name + email. Grandfathered current assignees who are no longer assignable remain visible as the current value; users can still unassign or pick a valid member.

### Surfaces

- Create issue dialog — optional assignee
- Issue detail — replace the basic Select
- Project and workspace issue tables — Assignee column with inline picker

### Unified feed

Extend the comment thread into one chronological list: comment cards plus compact activity rows (e.g. “Alex assigned to Mina · 1w ago”). Activity rows are not editable or replyable. The markdown composer stays comment-only.

## My work

Invalidate `organization-issues` and `issue-sheet` queries on assignee change. Optimistically patch list caches so the My work view updates without waiting on a slow refetch.

## Out of scope

- Multi-assignee
- Activity types beyond `assignee_changed`
- Storing activities as comment rows
- Full member picker for custom `user` columns
