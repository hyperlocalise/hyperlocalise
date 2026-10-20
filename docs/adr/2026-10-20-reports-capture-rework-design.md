# Reports capture rework

**Status:** Accepted

## Context

Reports (behind the `workspace-reports` flag) records words, translation memory match bands, completions and costs on hot paths.

Every content editor save makes a second request that the browser awaits, even with the flag off. With the flag on it runs about fifteen queries, scores the string, and locks the job row, so people saving in one job wait for each other. It records only the edited occurrence, not the other copies the Go service saved with it.

File and review jobs score each unique string with its own full-text query over `memory_entries`, before translation and once per locale. On synthetic data this took 0.32 s per string at 200,000 entries. The candidates are picked by word overlap, so typos and CJK text often miss their closest entry.

The Go service already writes a `string_segment_translation_updated` or `string_segment_approved` activity event per saved occurrence, with the acting user, inside the save transaction.

## Decision

### Editor saves come from activity events

- A cron route, `/api/cron/reporting-capture`, runs every 15 minutes, as the other frequent cron jobs do. It records each saved occurrence through `captureAnalysis` and `captureCompletions`, with the acting user.
- Progress is a cursor per organization in `reporting_capture_cursors`. Events are read in `(created_at, id)` order once they are two minutes old, because `created_at` is insert time, not commit time.
- A workspace the task has not seen before starts at the cut-off, and a workspace with Reports off has its position moved past its saves, since Reports records work from when it is turned on. Approvals made in an external translation tool name that tool's string id and are passed over. Each run first waits for the feature flags to download and stops if they cannot, so a failed check never reads as off.
- A run records saves in batches of 200, moving the position after each, loads each memory once, and starts no new batch after four minutes, inside the 300 s function limit.
- The event only says what was saved. Text and source job are read from the state tables. Existing unique keys keep every write idempotent.
- `reporting_activity` gains a nullable `actor_user_id`.
- The browser no longer awaits the reporting request. The route only records product analytics. The web app's own save path writes no event, so it captures directly after the write.

### Matching runs in memory

- A job loads the approved source texts of its memories once and builds a character-bigram index. Each string scores the 64 entries sharing the most bigrams, with Levenshtein on normalized text, as `visual-context-match-lambda` does.
- Fewer than four strings scan the loaded texts instead of indexing them, with the same scores. A memory over 300,000 entries per locale pair is loaded and scored in slices of that size, keeping each string's best score, so memory stays bounded and every string is scored the same way.
- The job row is no longer locked. Instead, writes for one job, language and step take a short database lock after matching, so two captures of one string cannot both stay current. `algorithm_version` becomes 2.

## Consequences

- Editor work appears in Reports 2 to 17 minutes after the save, with every occurrence and the person. Each run records at most 2,000 saves per workspace, so a workspace saving more than 8,000 an hour would fall behind.
- Saves no longer wait on Reports. Matching drops to about 0.02 s per string plus 0.6 s to load 200,000 entries.
- The index takes about 1.5 MB per 1,000 entries, at most about 450 MB per job.
- Reports depends on the Go save event's fields. `activity-log-contract.ts` types and tests them.

## Alternatives considered

- **Keep the browser request, without awaiting it.** Removes the wait, but still misses repeated occurrences and the person.
- **Trigram index (`pg_trgm`).** Needs a database extension for about a 30% gain.
