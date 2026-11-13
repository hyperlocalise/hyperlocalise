# ADR: Draft translation-memory write-back and cleanup

## Status

Accepted

## Date

2026-10-10

## Context

File translation jobs persist accepted keys into native translation memory. The insert path left `review_status` unset, so Postgres stored `approved`. Matching and reuse only read approved entries. Wrong agent output therefore entered live TM and prefills the next job.

The product already has an entry review model: `approved`, `pending`, and `rejected`. `draft` is a library status on `memories`, not an entry status. The explorer can filter by review status, but it has no review queue, no bulk actions, and no cleanup shortcuts. Origin chips omit `file_job`.

### How other TMS products handle this

| Product | Write-back | Cleanup |
| --- | --- | --- |
| Phrase | Curate TM before linguists or NextMT consume it. Rule filters: duplicates, near-duplicates, date, length ratio, non-translatables. ML filters: alignment, language ID, QPS. | Automated Asset Curation exports a cleaned TMX. |
| memoQ | Roles matter. A reviewer confirmation outranks a translator confirmation. | TM editor: filter, date cut, remove or merge duplicates. |
| Trados | Project TM update settings decide what confirmation level writes to TM. QA Checker and terminology verifier run after translation and review. | Penalties, hard filters, and scheduled QA tasks. |
| Crowdin | Auto-translate can skip approved strings and reset approval so proofreaders review replacements. | TM Cleaner app removes duplicate TUs and keeps a backup TM. |
| Lokalise | AI/MT saves to TM when a reviewer accepts the segment in a Review task, even if the text is unchanged. Review outside a task does not write TM. | Admins delete entries. Imports skip empty or duplicate units. |
| Smartling | Linguists approve in the CAT tool. TM updates stay tied to reviewed work. | Regular cleanup: drop stale units, merge duplicates, normalize formatting. |

The shared rule: unreviewed machine output must not become reusable gold.

## Decision

Keep the existing `pending` review status. Treat it as the draft state for unreviewed job output.

1. File translation jobs write `reviewStatus: "pending"` and `provenance: "file_job"`.
2. Conflict updates skip approved entries. A later job may refresh a pending or rejected suggestion. It must not overwrite approved target text.
3. Matching and reuse stay approved-only.
4. Manual creates, imports, and promote-from-project stay approved.
5. The TM explorer adds a draft queue, cleanup shortcuts, and bulk approve / reject / delete.

Phrase-style QPS scoring, near-duplicate merge, and language-ID filters stay out of this change.

### Write path

`FileTranslationMemoryStore.persistEntries` sets `reviewStatus: "pending"`. The upsert uses `ON CONFLICT ... DO UPDATE ... WHERE review_status <> 'approved'`.

### Review APIs

| Method | Path | Capability |
| --- | --- | --- |
| `GET` | `/:memoryId/entries/review-summary` | read |
| `POST` | `/:memoryId/entries/bulk-review` | review |
| `POST` | `/:memoryId/entries/bulk-delete` | bulk_mutation |
| `GET` | `/:memoryId/entries?sameAsSource=true` | read |

`review-summary` returns `{ pending, rejected, sameAsSource }`. Bulk routes accept at most 100 entry IDs.

### Explorer

The detail page shows how many drafts need review and a **Review drafts** action. **Cleanup** filters drafts, rejected entries, same-as-source copies, and translation-job origin. Reviewers can select visible rows and approve, reject, or delete them.

Origin filters now include `file_job` and `approved_job`. The pending label in the explorer is **Draft**.

## Consequences

- New job output no longer pollutes reuse until someone approves it.
- Existing approved `file_job` rows stay approved. This change is not a backfill.
- Reviewers need a queue. The explorer now provides one.
- Approved gold is sticky: a later wrong job cannot replace it.
- Cleanup is filter-and-bulk, not automated curation.
