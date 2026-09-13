# Go object storage and guideline retrieval

Status: approved for implementation.

## Boundaries

Use Go interfaces and composition. ObjectStore handles bytes and object metadata;
guideline indexing handles searchable passages. Neither exposes provider SDK types.
S3 and R2 share an AWS SDK v2 implementation with distinct configuration.
The existing go-svc hosts authenticated storage and guideline endpoints; no additional service
is necessary. PostgreSQL remains the authority for guideline content and permissions.
Turbopuffer is an optional, rebuildable index, separate from file storage.

## Object storage

Configure named, immutable storage locations. An object reference contains its
location ID and key, so changing the write default cannot redirect old reads.
Keys and locations are identities; signed URLs are temporary delivery credentials.
Support streaming put/get, metadata lookup, idempotent delete, and presigned PUT/GET.
Keep credentials, buckets, endpoints and SDK types inside the driver boundary.
The existing Vercel implementation remains available during adoption.

## Distribution

Build immutable releases in object storage and write a manifest last. Use
conditional creation to prevent overwriting published objects. Publication of an
active release is a separate application/database operation, performed only after
all uploads and metadata verification succeed. CDN configuration, channel APIs,
and browser upload UX remain future product work.

## Guidelines

Canonical document revisions carry organization, project, locale and mandatory
status. Index deterministic chunks by document and revision. Retrieval validates
hits against current canonical documents; mandatory instructions are returned
independently of ranked search. Scope comes from trusted server code, never from
an unauthenticated browser request. Index changes are idempotent so workers can
retry. Removing obsolete revisions must not delete a newer concurrently indexed
revision. Use a separate index interface and a turbopuffer adapter.

## Rollout

Implement the Go foundations and storage and guideline APIs first, with provider features
opt-in through configuration. Existing web file storage and lexical guideline
selection continue operating until their application migrations are enabled.
The future application integration should enqueue index updates transactionally
with guideline edits; an index is never the only copy of user content. A database
migration and outbox worker belong to that integration, not the provider drivers.

## Validation

Test driver HTTP behavior without cloud credentials, signed-request constraints,
location routing, immutable publication, tenant and revision isolation, mandatory
context and index failures. Run make fmt, make lint, make test, and focused race
checks. Live S3/R2/turbopuffer verification requires configured test accounts.
