# CAT Segment Locks

## Context

Approved and hidden CAT strings still need a way to prevent accidental edits. Hidden is informational (see prior hidden-string ADRs). Approved is a review status. Neither should imply a lock.

Native TMS and external TMS both need the same lock behavior. Provider hide APIs must stay separate.

## Decision

Store lock as an explicit per-segment flag in `project_cat_segment_locks`.

1. Identity is `(organization_id, project_id, target_locale, external_string_id)`.
2. `project_id` is the API project id (`ext:crowdin:42` for TMS, native UUID otherwise).
3. The CAT editor can lock or unlock the current segment and show a Locked badge.
4. The queue can lock or unlock the selection so users can filter Approved or Hidden, then lock those rows.
5. Locked segments are read-only in CAT. Save, approve, copy, clear, TM/AI apply, and image regenerate/upload are disabled.
6. Translation writes and file-backed image/video/office status updates return `409 translation_locked`. Lock state is local only; do not call Crowdin, Phrase, or Lokalise.

## Alternatives considered

- Derive lock from approved or hidden: rejected. Those are different product states, and managers still edit them.
- Store lock on native keys or provider metadata: rejected. Locks are per target locale and must work the same for TMS.
- Reuse CAT string overlays: rejected. Overlay identity includes file/resource ids; segment lock does not.

## Testing

- Service coverage for native and `ext:crowdin:…` project ids.
- Route coverage for lock/unlock, queue `isLocked`, 403 without write-back, and 409 on save.
- CAT mapper, store, mutations, editor badge, and queue bulk Lock/Unlock.
