# Source file reconciliation

Approved design: reconcile complete source snapshots inside the existing Vercel ingest workflow. Parse outside a transaction, then lock the repository file, verify workflow ownership and latest upload order, bulk-upsert in bounded batches, delete missing keys, and record the applied version and successful ingestion atomically. Cascades remove translations and comments; issue and QA references are cleared. Retained keys retain IDs and translations, including keys whose source becomes blank.

The alternative of a separate cleanup workflow introduces a period of inconsistent membership and additional coordination. Filtering stale keys only in UI queries leaves database records and other consumers inconsistent.

Every upload enters ingestion, including repeated historical hashes, so reverting a file reconciles its membership. A persisted reconciled-version pointer makes step retries safe and distinguishes reconciled snapshots from legacy imports. Existing upload ordering uses createdAt then ID; file locking serializes publication with upload registration. Newer uploads supersede older pending work. Empty valid snapshots delete all file keys; parser and database failures preserve prior data. QA foreign-key indexes bound cascade lookup cost.

Validation covers removals, retained translations and IDs, other-file isolation, empty and blank values, historical hashes, stale workflows, retries, more than 5000 keys, and rollback after a later batch fails. Run vp test, vp check --fix, generate and apply the Drizzle migration. Existing files are repaired on their next upload; a production-wide repair requires explicit operational rollout.
