# Source upload content idempotency

## Problem

Source uploads create a new source-file version even when the project, path, and
content hash match an already ingested version. Ingest correctly skips parsing
the duplicate, but source-upload automations still use the new version ID as
their idempotency key. The same bytes can therefore create and translate another
billable job.

## Options

1. Stop dispatching automations from the duplicate-ingest path. This fixes
   sequential re-uploads, but concurrent identical uploads can both pass the
   pre-ingest hash check and dispatch.
2. Key automation runs by content identity. Use project ID, source path, and
   source hash when a hash is available; retain the source-version key as a
   fallback for unhashed uploads. This deduplicates sequential and concurrent
   uploads while preserving retries for inputs without a hash.
3. Add job-level uniqueness for source content. This would provide a second
   defense, but it requires broader schema and job-lifecycle decisions.

## Decision

Use option 2. Propagate the source hash from both the skipped-ingest path and the
claimed workflow record into automation dispatch. Build a collision-safe key
from the content identity and include the automation config version so an
intentional configuration change can process the content again.

## Validation

- Different source-version IDs with the same project, path, and hash enqueue one
  automation run.
- Changing the project, path, hash, or automation config version creates a new
  key.
- Missing hashes retain version-based idempotency.
- Existing source-ingest, automation dispatcher, full web test, and static
  checks pass.
